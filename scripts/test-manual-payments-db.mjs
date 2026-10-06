// Real SQL in an isolated PostgreSQL engine. Never connects to live Supabase.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '../tmp/question-report-db-test/node_modules/@electric-sql/pglite/dist/index.js';

const db = new PGlite();
const ids = Object.fromEntries(['admin','alice','bob','carol','admin2'].map((name, i) => [name, `10000000-0000-4000-8000-00000000000${i+1}`]));
const emails = {admin:'vietdang293.vn@gmail.com', admin2:'vietdang293@gmail.com', alice:'alice@example.test', bob:'bob@example.test',carol:'carol@example.test'};
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
async function owner(sql, params = []) { await db.exec('RESET ROLE'); return (await db.query(sql, params)).rows; }
async function as(name, jwtEmail = emails[name]) {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({sub:ids[name],email:jwtEmail})]);
  await db.exec('SET ROLE authenticated');
}
async function rpc(name, args = []) { return (await db.query(`SELECT public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS value`, args)).rows[0].value; }
async function prepare(plan='flymax_half_yearly', request=crypto.randomUUID()) { return rpc('prepare_payment_order',[plan,request]); }
let aliceOrder;
const resumedToken=crypto.randomUUID();
before(async () => {
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz);
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated,anon;
    CREATE TABLE profiles(id uuid PRIMARY KEY REFERENCES auth.users, name text, email text, phone text,
      account_tier text DEFAULT 'flygo', subscription_started_at timestamptz,subscription_expires_at timestamptz,referral_discount_percent int DEFAULT 0);
    CREATE TABLE subscription_plans(code text PRIMARY KEY,name text,account_tier text,price_vnd int,duration_days int,is_public bool DEFAULT true,is_active bool DEFAULT true);
    CREATE TABLE subscriptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES profiles,plan_code text REFERENCES subscription_plans,
      source text,status text,starts_at timestamptz,expires_at timestamptz,metadata jsonb DEFAULT '{}',created_at timestamptz DEFAULT now());
    CREATE TABLE payment_settings(id int PRIMARY KEY,bank_name text,account_number text,account_holder text,qr_image_url text,is_enabled bool DEFAULT false);
    CREATE TABLE payment_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES profiles,plan_code text REFERENCES subscription_plans,
      amount_vnd int CHECK(amount_vnd>0),transfer_code text,status text DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
      proof_url text,admin_note text,created_at timestamptz DEFAULT now(),reviewed_at timestamptz,reviewed_by uuid REFERENCES profiles,
      list_price_vnd int,discount_percent int DEFAULT 0,discount_amount_vnd int DEFAULT 0,streak_discount_applied bool DEFAULT false);
    CREATE TABLE learning_streak_discounts(user_id uuid PRIMARY KEY REFERENCES auth.users,discount_percent int DEFAULT 50,starts_at timestamptz,expires_at timestamptz,used_at timestamptz);
    CREATE FUNCTION create_payment_order(text) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
    GRANT ALL ON payment_orders,subscriptions TO authenticated,anon;
    GRANT UPDATE(status),INSERT(amount_vnd) ON payment_orders TO authenticated;
    GRANT UPDATE(expires_at) ON subscriptions TO authenticated;
    GRANT EXECUTE ON FUNCTION create_payment_order(text) TO authenticated,anon;
    INSERT INTO subscription_plans VALUES
      ('flymax_monthly','FlyMax 1 tháng','flymax',29000,30,true,true),
      ('flymax_quarterly','FlyMax 3 tháng','flymax',69000,90,true,true),
      ('flymax_half_yearly','FlyMax 6 tháng','flymax',139000,180,true,true),
      ('flymax_yearly','FlyMax 1 năm','flymax',199000,365,true,true),
      ('flyinfinity','FlyInfinity trọn đời','flyinfinity',299000,null,true,true),
      ('flymax_gift','Gift','flymax',0,null,false,true);
    INSERT INTO payment_settings VALUES(1,'Ngân hàng thử nghiệm','0012345678','FLYDO TEST',null,true);`);
  for (const name of Object.keys(ids)) {
    await owner('INSERT INTO auth.users VALUES($1,$2,now());', [ids[name],emails[name]]);
    await owner("INSERT INTO profiles(id,name,email,phone) VALUES($1,'Đặng Đức Việt','not-identity@example.test','090 123-4567')",[ids[name]]);
  }
  await owner("INSERT INTO learning_streak_discounts VALUES($1,50,now()-interval '1 day',now()+interval '1 day',null)",[ids.alice]);
  await owner("INSERT INTO payment_orders(user_id,plan_code,amount_vnd,transfer_code,status) VALUES($1,'flymax_monthly',29000,'LEGACY','approved')",[ids.alice]);
  await db.exec(read('../src/lib/supabase/notifications.sql'));
  const streak = read('../src/lib/supabase/learning-streak-rewards.sql');
  await db.exec(streak.slice(streak.indexOf('CREATE OR REPLACE FUNCTION public.consume_learning_streak_discount()'),streak.indexOf('COMMIT;',streak.indexOf('CREATE OR REPLACE FUNCTION public.consume_learning_streak_discount()'))));
  const migration = read('../src/lib/supabase/manual-payments.sql');
  await db.exec(migration); await db.exec(migration);
});
after(async()=>db.close());

test('server quote, Vietnamese memo, one open order and retry token are immutable',async()=>{
  await as('alice'); const token=crypto.randomUUID(); const result=await prepare(undefined,token);
  assert.equal(result.success,true); aliceOrder=result.order;
  assert.equal(aliceOrder.amount_vnd,69500); assert.equal(aliceOrder.discount_percent,50);
  assert.equal(aliceOrder.buyer_snapshot.email,'alice@example.test');
  assert.match(aliceOrder.transfer_code,/^DANG DUC VIET 0901234567 FD[A-F0-9]{10}$/);
  assert.equal((await prepare('flymax_yearly',resumedToken)).order.id,aliceOrder.id);
  assert.equal((await prepare(undefined,token)).order.id,aliceOrder.id);
  assert.equal((await owner('SELECT used_at FROM learning_streak_discounts WHERE user_id=$1',[ids.alice]))[0].used_at,null);
});
test('buyer cannot confirm/read/cancel another order, spoof ADMIN, or bypass RPC with column grants',async()=>{
  await as('bob',emails.admin);
  for(const name of ['get_my_payment_order','confirm_payment_order','cancel_payment_order','admin_approve_payment_order']) {
    assert.equal((await rpc(name,[aliceOrder.id])).success,false,name);
  }
  await assert.rejects(()=>db.query("UPDATE payment_orders SET status='approved'"),/permission denied/);
  await assert.rejects(()=>db.query("UPDATE subscriptions SET expires_at=now()"),/permission denied/);
  await assert.rejects(()=>rpc('create_payment_order',['flymax_monthly']),/permission denied/);
  await assert.rejects(()=>db.query('SELECT * FROM payment_orders'),/permission denied/);
  await as('alice'); assert.equal('reviewed_by' in (await rpc('get_my_payment_order',[aliceOrder.id])).order,false);
});
test('confirmation sends exactly one private message per verified ADMIN without granting membership',async()=>{
  await as('alice'); assert.equal((await rpc('confirm_payment_order',[aliceOrder.id])).order.status,'pending');
  await rpc('confirm_payment_order',[aliceOrder.id]);
  const notices=await owner('SELECT target_user_id,action_url FROM app_notifications');
  assert.equal(notices.length,2); assert.deepEqual(new Set(notices.map(n=>n.target_user_id)),new Set([ids.admin,ids.admin2]));
  assert.equal((await owner('SELECT account_tier FROM profiles WHERE id=$1',[ids.alice]))[0].account_tier,'flygo');
  await as('alice'); assert.equal((await rpc('cancel_payment_order',[aliceOrder.id])).success,false);
});
test('notification failure rolls back entire approval, then late approval consumes exact voucher once',async()=>{
  await owner("UPDATE learning_streak_discounts SET expires_at=expires_at WHERE user_id=$1",[ids.alice]);
  await db.exec('RESET ROLE');
  await db.exec(`CREATE FUNCTION test_fail_notice() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test delivery failure'; END $$;
    CREATE TRIGGER test_fail_notice BEFORE INSERT ON app_notifications FOR EACH ROW EXECUTE FUNCTION test_fail_notice();`);
  await as('admin'); await assert.rejects(()=>rpc('admin_approve_payment_order',[aliceOrder.id]),/test delivery failure/);
  assert.equal((await owner('SELECT count(*)::int AS n FROM subscriptions'))[0].n,0);
  assert.equal((await owner('SELECT used_at FROM learning_streak_discounts WHERE user_id=$1',[ids.alice]))[0].used_at,null);
  await owner('DROP TRIGGER test_fail_notice ON app_notifications');
  // Expiry after quote is permitted: freeze a historically eligible quote and matching voucher.
  await owner("UPDATE learning_streak_discounts SET starts_at=now()-interval '4 days',expires_at=now()-interval '1 day' WHERE user_id=$1",[ids.alice]);
  await owner("UPDATE payment_orders SET created_at=now()-interval '2 days',voucher_snapshot=(SELECT jsonb_build_object('starts_at',starts_at,'expires_at',expires_at) FROM learning_streak_discounts WHERE user_id=$1) WHERE id=$2",[ids.alice,aliceOrder.id]);
  await as('admin'); const approved=await rpc('admin_approve_payment_order',[aliceOrder.id]);
  assert.equal(approved.order.status,'approved'); assert.ok(approved.order.subscription_id);
  const expiry=approved.order.result_expires_at;
  await as('admin2'); assert.equal((await rpc('admin_approve_payment_order',[aliceOrder.id])).order.result_expires_at,expiry);
  assert.equal((await owner('SELECT count(*)::int AS n FROM subscriptions'))[0].n,1);
  await as('alice');assert.equal((await prepare('flymax_yearly',resumedToken)).order.id,aliceOrder.id,'Retry of resumed intent must return its completed order, not a new draft');
  assert.ok((await owner('SELECT used_at FROM learning_streak_discounts WHERE user_id=$1',[ids.alice]))[0].used_at);
  await as('alice'); const page=await rpc('get_my_payment_orders',['all',20,null,null]);
  assert.equal(page.summary.approved_total_vnd,69500); assert.equal(page.items.find(o=>o.flow_version===0).status,'approved');
  assert.equal((await rpc('get_my_payment_orders',['closed',20,null,null])).summary.approved_total_vnd,69500);
});
test('all five plan durations, referral discount, fixed quotes and lifetime protection',async()=>{
  await owner('UPDATE profiles SET referral_discount_percent=20 WHERE id=$1',[ids.bob]);
  const cases=[['flymax_monthly',29000,30],['flymax_quarterly',69000,90],['flymax_half_yearly',111200,180],['flymax_yearly',159200,365],['flyinfinity',239200,null]];
  for(const [plan,amount,days] of cases){
    await as('bob'); const d=await prepare(plan); assert.equal(d.order.amount_vnd,amount); assert.equal(d.order.plan_snapshot.duration_days,days);
    await rpc('cancel_payment_order',[d.order.id]);
  }
  await as('bob'); assert.equal((await prepare('flymax_gift')).success,false);
  const d=await prepare('flymax_monthly'); await rpc('confirm_payment_order',[d.order.id]);
  await owner("UPDATE profiles SET account_tier='flymax',subscription_started_at=now()-interval '10 days',subscription_expires_at=now()+interval '10 days' WHERE id=$1",[ids.bob]);
  const old=(await owner('SELECT subscription_expires_at,subscription_started_at FROM profiles WHERE id=$1',[ids.bob]))[0];
  await as('admin'); const ok=await rpc('admin_approve_payment_order',[d.order.id]);
  assert.equal(Math.round((new Date(ok.order.result_expires_at)-new Date(old.subscription_expires_at))/86400000),30);
  assert.equal((await owner('SELECT subscription_started_at FROM profiles WHERE id=$1',[ids.bob]))[0].subscription_started_at.toISOString(),old.subscription_started_at.toISOString());
  await as('bob'); const inf=await prepare('flyinfinity'); await rpc('confirm_payment_order',[inf.order.id]);
  await as('admin'); const lifetime=await rpc('admin_approve_payment_order',[inf.order.id]); assert.equal(lifetime.order.result_expires_at,null);
  await as('bob'); assert.equal((await prepare()).code,'LIFETIME');
});
test('reject/reply requires text, no duplicate final action; voucher replacement blocks grant',async()=>{
  await as('carol'); const d=await prepare('flymax_yearly'); await rpc('confirm_payment_order',[d.order.id]);
  await as('admin'); assert.equal((await rpc('admin_reject_payment_order',[d.order.id,' '])).success,false);
  assert.equal((await rpc('admin_reply_payment_order',[d.order.id,'Em kiểm tra lại nội dung chuyển khoản nhé.'])).order.status,'pending');
  assert.equal((await rpc('admin_reject_payment_order',[d.order.id,'Chưa đối chiếu được khoản chuyển.'])).order.status,'rejected');
  assert.equal((await rpc('admin_approve_payment_order',[d.order.id])).success,false);
  await owner("INSERT INTO learning_streak_discounts VALUES($1,50,now()-interval '1 day',now()+interval '1 day',null)",[ids.carol]);
  await as('carol'); const v=await prepare(); await rpc('confirm_payment_order',[v.order.id]);
  await owner("UPDATE learning_streak_discounts SET starts_at=now(),expires_at=now()+interval '2 days' WHERE user_id=$1",[ids.carol]);
  await as('admin'); assert.equal((await rpc('admin_approve_payment_order',[v.order.id])).code,'VOUCHER_CONFLICT');
  await owner("UPDATE profiles SET account_tier='flyinfinity' WHERE id=$1",[ids.carol]);
  await as('admin'); assert.equal((await rpc('admin_approve_payment_order',[v.order.id])).code,'LIFETIME');
});
test('bank/profile validation, empty ADMIN recipient rollback, safe filters and cursor',async()=>{
  await owner("UPDATE profiles SET account_tier='flygo',phone='bad' WHERE id=$1",[ids.bob]);
  await as('bob'); assert.equal((await prepare()).code,'PROFILE');
  await owner("UPDATE profiles SET phone='0901234567' WHERE id=$1;",[ids.bob]);
  await owner('UPDATE payment_settings SET is_enabled=false');
  await as('bob'); assert.equal((await prepare()).code,'BANK_DISABLED');
  await owner('UPDATE payment_settings SET is_enabled=true');
  await as('bob'); const d=await prepare();
  await owner('UPDATE auth.users SET email_confirmed_at=null WHERE id IN ($1,$2)',[ids.admin,ids.admin2]);
  await as('bob'); assert.equal((await rpc('confirm_payment_order',[d.order.id])).code,'ADMIN_UNAVAILABLE');
  assert.equal((await rpc('get_my_payment_order',[d.order.id])).order.status,'draft');
  await owner('UPDATE auth.users SET email_confirmed_at=now() WHERE id IN ($1,$2)',[ids.admin,ids.admin2]);
  await as('bob'); await rpc('cancel_payment_order',[d.order.id]);
  assert.equal((await rpc('get_my_payment_orders',['bogus',20,null,null])).success,false);
  assert.equal((await rpc('get_my_payment_orders',['all',20,new Date().toISOString(),null])).success,false);
  assert.equal((await rpc('get_my_payment_orders',['all',51,null,null])).success,false);
  await as('alice'); const first=await rpc('get_my_payment_orders',['all',1,null,null]);
  const second=await rpc('get_my_payment_orders',['all',1,first.next_cursor.created_at,first.next_cursor.id]);
  assert.notEqual(first.items[0].id,second.items[0].id);
  await db.exec('RESET ROLE; SET ROLE anon'); await assert.rejects(()=>prepare(),/permission denied/);
});
test('same-time keyset cursor is stable, legacy never auto-activates, helpers are private',async()=>{
  const legacy=(await owner("SELECT id FROM payment_orders WHERE transfer_code='LEGACY'"))[0].id;
  await as('admin');assert.equal((await rpc('admin_approve_payment_order',[legacy])).code,'LEGACY');
  await assert.rejects(()=>rpc('payment_detail',[aliceOrder.id,false]),/permission denied/);
  await assert.rejects(()=>rpc('payment_change_order',[aliceOrder.id,'approve','']),/permission denied/);
  await owner("INSERT INTO payment_orders(id,user_id,plan_code,amount_vnd,transfer_code,status,created_at) SELECT ('40000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,$1,'flymax_monthly',29000,'TIE','cancelled','2025-01-01' FROM generate_series(1,3) g",[ids.alice]);
  await as('alice');let cursor=null;const seen=[];
  do{const page=await rpc('get_my_payment_orders',['all',1,cursor?.created_at??null,cursor?.id??null]);seen.push(page.items[0].id);cursor=page.next_cursor;}while(cursor);
  assert.equal(new Set(seen).size,seen.length);assert.deepEqual(seen.slice(-3),['40000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001']);
});
