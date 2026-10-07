// Real, isolated PostgreSQL. Never connects to Supabase or edits user accounts.
import { PGlite } from '../tmp/question-report-db-test/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
const user = '10000000-0000-4000-8000-000000000001', other = '10000000-0000-4000-8000-000000000002';
const key = n => `20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const migration = new URL('../src/lib/supabase/account-device-linking.sql',import.meta.url);
let passed = 0;
async function test(name,fn) { await fn(); passed++; console.log('PASS ' + name); }
async function owner() { await db.exec('RESET ROLE'); }
async function as(id=user,session='session-a',role='authenticated') {
  await owner(); await db.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,session_id:session})]);
  await db.exec('SET ROLE '+role);
}
async function rpc(name,args=[]) {
  return (await db.query(`SELECT public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) r`,args)).rows[0].r;
}
const register = (k,session,type='computer') => rpc('register_login_device',[k,type,'Chrome · Windows',session]);
const create = k => rpc('create_account_device_link',[k]);
const redeem = (code,k,session,type='computer') => rpc('redeem_account_device_link',[code,k,type,'Chrome · Windows',session]);
const list = k => rpc('get_my_account_devices',[k]);
async function activeCount(id=user,type='computer') { await owner(); return Number((await db.query('SELECT count(*) n FROM account_devices WHERE user_id=$1 AND device_type=$2 AND revoked_at IS NULL',[id,type])).rows[0].n); }
try {
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY); INSERT INTO auth.users VALUES('${user}'),('${other}');
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(auth.jwt()->>'sub','')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated,anon;`);
  const baseline = readFileSync(new URL('../src/lib/supabase/account-devices.sql',import.meta.url),'utf8');
  await db.exec(baseline);
  await as(user,'session-a'); assert.equal((await register(key(1),'session-a')).active,true);
  await owner(); await db.exec(`UPDATE account_device_quota SET removal_count=1 WHERE user_id='${user}'`);
  const before=(await db.query('SELECT id,device_key,session_id,first_seen_at,last_login_at FROM account_devices ORDER BY id')).rows;
  if (existsSync(migration)) { await db.exec(readFileSync(migration,'utf8')); await db.exec(readFileSync(migration,'utf8')); }
  await test('SQL-first backfill/rerun retains legacy key, session, dates and lifetime quota',async()=>{
    await owner(); assert.deepEqual((await db.query('SELECT id,device_key,session_id,first_seen_at,last_login_at FROM account_devices ORDER BY id')).rows,before);
    await as(user,'session-a'); assert.equal((await rpc('check_registered_device',[key(1),'session-a'])).active,true);
    assert.equal((await register(key(1),'session-a')).active,true);
  });
  let ticket, target;
  await test('registered profile can explicitly authorize another profile on the same logical device',async()=>{
    await as(user,'session-a');
    await assert.doesNotReject(async()=>{ ticket=await create(key(1)); },'An active profile must be able to create a one-use link');
    assert.match(ticket.code,/^[0-9a-f-]{36}$/i); assert.equal(ticket.device_type,'computer');
    assert.ok(Date.parse(ticket.expires_at)-Date.parse(ticket.server_now)>=299000);
    await as(user,'session-b'); const linked=await redeem(ticket.code,key(2),'session-b');
    assert.equal(linked.active,true); assert.equal(linked.linked,true); target=linked.device_id;
    assert.equal(await activeCount(),1);
    await as(user,'session-a'); assert.equal((await rpc('check_registered_device',[key(1),'session-a'])).active,true);
    await as(user,'session-b'); assert.equal((await rpc('check_registered_device',[key(2),'session-b'])).active,true);
    assert.equal((await register(key(2),'session-b')).active,true);
    const summary=await list(key(2)); assert.equal(summary.devices.length,1); assert.equal(summary.devices[0].profile_count,2);
    assert.equal(summary.devices[0].is_current,true); assert.equal(summary.remaining,1);
  });
  await test('same redemption retry is idempotent, another profile cannot replay the consumed code',async()=>{
    await as(user,'session-b'); assert.equal((await redeem(ticket.code,key(2),'session-b')).active,true);
    await as(user,'session-c'); assert.equal((await redeem(ticket.code,key(3),'session-c')).active,false);
    assert.equal(await activeCount(),1);
  });
  await test('two actual independent groups keep the limit; a third unlinked profile cannot enroll',async()=>{
    await as(user,'session-c'); assert.equal((await register(key(3),'session-c')).active,true);
    await as(user,'session-d'); assert.deepEqual(await register(key(4),'session-d'),{active:false,reason:'limit'});
    assert.equal(await activeCount(),2);
  });
  await test('existing duplicate group merges explicitly without consuming a deletion or ending other profile sessions',async()=>{
    await as(user,'session-a'); const t=await create(key(1));
    await as(user,'session-c'); const linked=await redeem(t.code,key(3),'session-c');
    assert.equal(linked.active,true); assert.equal(linked.merged_device,true);
    assert.equal(await activeCount(),1);
    await as(user,'session-c'); const summary=await list(key(3));
    assert.equal(summary.devices[0].profile_count,3); assert.equal(summary.remaining,1); assert.equal(summary.devices[0].is_current,true);
    await as(user,'session-b'); assert.equal((await rpc('check_registered_device',[key(2),'session-b'])).active,true);
    await owner(); const merged=(await db.query('SELECT merged_into FROM account_devices WHERE device_key=$1',[key(3)])).rows[0]; assert.equal(merged.merged_into,target);
    await db.exec(readFileSync(migration,'utf8'));
    await as(user,'session-c'); assert.equal((await register(key(3),'session-c')).active,true); assert.equal((await list(key(3))).devices.length,1);
  });
  await test('foreign account, forged session, unknown key and mismatched category cannot authorize or redeem links',async()=>{
    await as(user,'session-a'); const t=await create(key(1));
    await as(other,'foreign'); assert.equal((await redeem(t.code,key(10),'foreign')).active,false);
    await as(user,'session-z'); assert.equal((await redeem(t.code,key(4),'forged')).active,false);
    assert.equal((await redeem(t.code,key(4),'session-z','phone')).active,false);
    await assert.rejects(()=>create(key(1)),/thiết bị|phiên|đăng nhập/i);
    await as(user,'session-a'); await assert.rejects(()=>create(key(99)),/thiết bị|phiên|đăng nhập/i);
    await as(user,'session-d'); assert.equal((await redeem(t.code,key(4),'session-d')).active,true,'Rejected attempts must not consume valid code');
  });
  await test('expired, cancelled and superseded codes leave aliases and group counts unchanged',async()=>{
    await as(user,'session-a'); const expired=await create(key(1));
    await owner(); await db.query("UPDATE account_device_link_codes SET expires_at=now()-interval '1 second' WHERE code=$1",[expired.code]);
    await as(user,'session-e'); assert.equal((await redeem(expired.code,key(5),'session-e')).active,false);
    await as(user,'session-a'); const first=await create(key(1)), latest=await create(key(1));
    await as(user,'session-e'); assert.equal((await redeem(first.code,key(5),'session-e')).active,false);
    await as(user,'session-a'); assert.equal((await rpc('cancel_account_device_link',[latest.code])).cancelled,true);
    await as(user,'session-e'); assert.equal((await redeem(latest.code,key(5),'session-e')).active,false);
    assert.equal(await activeCount(),1);
  });
  await test('logout of one linked profile does not logout others and ended sessions cannot silently re-enroll',async()=>{
    await as(user,'session-b'); await rpc('release_device_session',[key(2),'session-b']);
    assert.equal((await rpc('check_registered_device',[key(2),'session-b'])).active,false);
    assert.equal((await register(key(2),'session-b')).active,false);
    await as(user,'session-a'); assert.equal((await rpc('check_registered_device',[key(1),'session-a'])).active,true);
    const t=await create(key(1)); await rpc('release_device_session',[key(1),'session-a']);
    await as(user,'session-e'); assert.equal((await redeem(t.code,key(5),'session-e')).active,false);
    await as(user,'session-a2'); assert.equal((await register(key(1),'session-a2')).active,true);
  });
  await test('own grouped device cannot be deleted from any alias; removing another revokes all aliases once',async()=>{
    await as(user,'session-a2'); assert.equal((await rpc('remove_account_device',[target])).reason,'current');
    assert.equal((await register(key(5),'session-a2','phone')).active,true);
    await as(user,'phone-session'); assert.equal((await register(key(5),'phone-session','phone')).active,true);
    const removed=await rpc('remove_account_device',[target]); assert.equal(removed.removed,true); assert.equal(removed.remaining,0);
    await as(user,'session-c'); assert.equal((await rpc('check_registered_device',[key(3),'session-c'])).active,false);
    assert.equal((await register(key(3),'session-c')).active,false);
    await as(user,'session-a2'); assert.equal((await register(key(1),'session-a2')).active,false);
    await as(user,'phone-session'); const state=await list(key(5)); assert.equal(state.remaining,0); assert.equal(state.devices.length,1);
    assert.equal((await rpc('remove_account_device',[target])).removed,false);
  });
  await test('global logout ends every linked session and cancels issued authorizations',async()=>{
    await as(user,'phone-session'); const t=await create(key(5)); await rpc('clear_my_device_sessions');
    assert.equal((await rpc('check_registered_device',[key(5),'phone-session'])).active,false);
    assert.equal((await register(key(5),'phone-session','phone')).active,false);
    await as(user,'new-phone'); assert.equal((await redeem(t.code,key(6),'new-phone','phone')).active,false);
  });
  await test('an authenticated but unregistered session cannot delete devices or globally logout registered users',async()=>{
    await as(other,'legitimate-session'); assert.equal((await register(key(11),'legitimate-session')).active,true);
    const id=(await list(key(11))).devices[0].id;
    await as(other,'unregistered-session'); assert.equal((await rpc('remove_account_device',[id])).removed,false);
    await assert.rejects(()=>rpc('clear_my_device_sessions'),/thiết bị|phiên|đăng nhập/i);
    await as(other,'legitimate-session'); assert.equal((await rpc('check_registered_device',[key(11),'legitimate-session'])).active,true);
  });
  await test('moving an issuer cancels its old codes permanently but retains authorizations from source survivors',async()=>{
    await as(other,'legitimate-session'); const t=await create(key(11));
    await as(other,'alias-session'); assert.equal((await redeem(t.code,key(12),'alias-session')).active,true);
    const stale=await create(key(12));
    await as(other,'destination-session'); assert.equal((await register(key(13),'destination-session')).active,true);
    const outbound=await create(key(13));
    await as(other,'alias-session'); assert.equal((await redeem(outbound.code,key(12),'alias-session')).active,true);
    assert.equal((await redeem(stale.code,key(14),'alias-session')).active,false);
    await as(other,'legitimate-session'); const back=await create(key(11));
    await as(other,'alias-session'); assert.equal((await redeem(back.code,key(12),'alias-session')).active,true);
    await as(other,'fresh-session'); assert.equal((await redeem(stale.code,key(14),'fresh-session')).active,false,'Returning the issuer must not revive its prior authorization');
    // An authorization from a surviving source profile must stay valid.
    await as(other,'legitimate-session'); const kept=await create(key(11));
    await as(other,'destination-session'); const moveAgain=await create(key(13));
    await as(other,'alias-session'); assert.equal((await redeem(moveAgain.code,key(12),'alias-session')).active,true);
    await as(other,'fresh-session'); assert.equal((await redeem(kept.code,key(14),'fresh-session')).active,true);
  });
  await test('replaced session tokens cannot re-enroll after a later global logout, including replacement during redemption',async()=>{
    await as(other,'legitimate-session-2'); assert.equal((await register(key(11),'legitimate-session-2')).active,true);
    await as(other,'legitimate-session'); assert.equal((await register(key(11),'legitimate-session')).active,false,'Displaced JWT must be ended on ordinary registration');
    await as(other,'legitimate-session-2'); const t=await create(key(11));
    await as(other,'alias-session-2'); assert.equal((await redeem(t.code,key(12),'alias-session-2')).active,true);
    await as(other,'alias-session'); assert.equal((await register(key(12),'alias-session')).active,false,'Displaced JWT must be ended on linking');
    await as(other,'legitimate-session-2'); await rpc('clear_my_device_sessions');
    await as(other,'legitimate-session'); assert.equal((await register(key(11),'legitimate-session')).active,false);
    await as(other,'alias-session'); assert.equal((await register(key(12),'alias-session')).active,false);
  });
  await test('changing issuer sessions permanently cancels its codes even when a surviving alias retains the old session',async()=>{
    await as(other,'shared-session'); assert.equal((await register(key(11),'shared-session')).active,true);
    assert.equal((await register(key(14),'shared-session')).active,true);
    const oldCode=await create(key(11)); const survivorCode=await create(key(14));
    await as(other,'changed-session'); assert.equal((await register(key(11),'changed-session')).active,true);
    await as(other,'shared-session'); assert.equal((await rpc('check_registered_device',[key(14),'shared-session'])).active,true);
    assert.equal((await register(key(11),'shared-session')).active,true);
    await as(other,'probe-session'); assert.equal((await redeem(oldCode.code,key(15),'probe-session')).active,false,'Returning to a retained session must not revive this issuer code');
    assert.equal((await redeem(survivorCode.code,key(16),'probe-session')).active,true,'The survivor issuer authorization must remain usable');
  });
  await test('new tables/helpers cannot be read or written directly; no anonymous or foreign-device listing',async()=>{
    await as(user,'new-phone'); await assert.rejects(()=>db.query('SELECT * FROM account_device_link_codes'),/permission denied/);
    await assert.rejects(()=>db.query('UPDATE account_device_profiles SET device_key=$1',[key(100)]),/permission denied/);
    await assert.rejects(()=>list(key(5)),/phiên|thiết bị|đăng nhập/i);
    await as(null,'','anon'); await assert.rejects(()=>create(key(5)),/permission denied/);
    await assert.rejects(()=>list(key(5)),/permission denied/);
  });
  console.log(`Account profile linking: ${passed} database behavior groups passed.`);
} finally { await db.close(); }
