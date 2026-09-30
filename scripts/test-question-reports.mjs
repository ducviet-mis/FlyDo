// Isolated PostgreSQL integration tests: no live Supabase connection or credentials.
// Prepare: npm install --prefix tmp/question-report-db-test --no-save --package-lock=false @electric-sql/pglite@0.3.14
// Run from repository root: node scripts/test-question-reports.mjs
import { PGlite } from '../tmp/question-report-db-test/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
const ids = {
  admin: '10000000-0000-4000-8000-000000000001',
  alice: '10000000-0000-4000-8000-000000000002',
  bob: '10000000-0000-4000-8000-000000000003',
  carol: '10000000-0000-4000-8000-000000000004',
};
await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users(id uuid primary key, email text);
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO authenticated, anon;
  CREATE TABLE public.profiles(id uuid primary key, name text);
  CREATE TABLE public.practice_lessons(id text primary key, title text, grade int, chapter text);
  CREATE TABLE public.practice_questions(id text primary key, lesson_id text, content text, options jsonb, correct_answer int, solution text, difficulty_level int, diagram jsonb);
  CREATE TABLE public.mock_exams(id uuid primary key, title text, grade int);
  CREATE TABLE public.mock_exam_questions(id uuid primary key, exam_id uuid, content text, options jsonb, correct_answer int, solution text, order_index int, diagram jsonb);
  INSERT INTO auth.users VALUES ('${ids.admin}', 'vietdang293.vn@gmail.com'), ('${ids.alice}', 'alice@example.test'), ('${ids.bob}', 'bob@example.test'), ('${ids.carol}', 'carol@example.test');
  INSERT INTO public.profiles SELECT id, split_part(email, '@', 1) FROM auth.users;
  INSERT INTO public.practice_lessons VALUES ('lesson-1', 'Đơn thức', 8, 'Đa thức');
  INSERT INTO public.practice_questions VALUES ('q1', 'lesson-1', 'x+1=?', '["1","2","3","4"]', 1, 'Lời giải', 2, NULL);
  INSERT INTO public.practice_questions VALUES ('legacy-q', 'legacy-lesson', 'Legacy data', '["1","2","3","4"]', 1, '', 1, NULL);
  INSERT INTO public.practice_questions SELECT 'limit-' || g, 'lesson-1', 'Câu ' || g, '["1","2","3","4"]', 1, '', 1, NULL FROM generate_series(1,21) g;
  INSERT INTO public.mock_exams VALUES ('20000000-0000-4000-8000-000000000001', 'Thi thử', 8);
  INSERT INTO public.mock_exam_questions VALUES ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Câu thi', '["1","2","3","4"]', 2, 'Lời giải thi', 0, NULL);
`);
const sql = readFileSync(new URL('../src/lib/supabase/question-reports.sql', import.meta.url), 'utf8');
await db.exec(readFileSync(new URL('../src/lib/supabase/notifications.sql', import.meta.url), 'utf8'));
await db.exec(sql);
await db.exec(sql); // migration is rerunnable
async function as(name) {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: ids[name], email: name === 'admin' ? 'vietdang293.vn@gmail.com' : `${name}@example.test` })]);
  await db.exec('SET ROLE authenticated');
}
async function rows(query, params = []) { return (await db.query(query, params)).rows; }
async function submit(source, id, reason = 'wrong_answer', details = '') {
  return (await rows('SELECT public.submit_question_report($1,$2,$3,$4) AS id', [source, id, reason, details]))[0].id;
}
async function respond(id, status, body, token, timestamp) {
  return rows('SELECT public.respond_question_report($1,$2,$3,$4,$5) AS id', [id, status, body, token, timestamp]);
}
await as('alice');
const alice = await submit('practice', 'q1');
assert.equal(await submit('practice', 'q1'), alice);
await submit('mock_exam', '30000000-0000-4000-8000-000000000001', 'display');
await assert.rejects(() => submit('practice', 'q1', 'other', ''), /mô tả/);
await assert.rejects(() => submit('practice', 'missing'), /không còn tồn tại/);
assert.equal((await rows('SELECT * FROM public.question_reports')).length, 0);
await assert.rejects(() => rows("INSERT INTO public.question_reports (id) VALUES (gen_random_uuid())"), /permission denied/);
await assert.rejects(() => respond(alice, 'resolved', 'fake admin', crypto.randomUUID(), new Date().toISOString()), /Chỉ ADMIN/);
await as('bob');
const bob = await submit('practice', 'q1', 'solution', 'Kiểm tra giúp em');
await as('admin');
const all = await rows('SELECT * FROM public.question_reports');
assert.equal(all.length, 3);
assert.equal(all.find(r => r.id === alice).question_snapshot.correct_answer, 1);
assert.equal(all.find(r => r.id === alice).source_title, 'Đơn thức');
let report = (await rows('SELECT * FROM public.question_reports WHERE id=$1', [alice]))[0];
await respond(alice, 'reviewing', '', crypto.randomUUID(), report.updated_at);
assert.equal((await rows('SELECT * FROM public.app_notifications')).length, 0);
report = (await rows('SELECT * FROM public.question_reports WHERE id=$1', [alice]))[0];
await assert.rejects(() => respond(alice, 'resolved', '', crypto.randomUUID(), report.updated_at), /viết phản hồi/);
const token = crypto.randomUUID();
const first = await respond(alice, 'resolved', 'Đã sửa đáp án, cảm ơn em!', token, report.updated_at);
const retry = await respond(alice, 'resolved', 'Đã sửa đáp án, cảm ơn em!', token, report.updated_at);
assert.equal(first[0].id, retry[0].id);
assert.equal((await rows('SELECT * FROM public.app_notifications')).length, 1);
assert.equal((await rows('SELECT * FROM public.question_report_responses')).length, 1);
await assert.rejects(() => respond(alice, 'reviewing', '', crypto.randomUUID(), report.updated_at), /đã được cập nhật/);
await as('alice');
assert.equal((await rows('SELECT public.get_my_notification_inbox() AS inbox'))[0].inbox.items.length, 1);
await as('bob');
assert.equal((await rows('SELECT public.get_my_notification_inbox() AS inbox'))[0].inbox.items.length, 0);
assert.equal((await rows('SELECT * FROM public.question_report_responses')).length, 0);
await db.exec('RESET ROLE');
await db.exec(`CREATE FUNCTION fail_test_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test delivery failure'; END $$;
  CREATE TRIGGER test_fail BEFORE INSERT ON app_notifications FOR EACH ROW EXECUTE FUNCTION fail_test_notification();`);
await as('admin');
report = (await rows('SELECT * FROM public.question_reports WHERE id=$1', [bob]))[0];
await assert.rejects(() => respond(bob, 'resolved', 'Sửa rồi', crypto.randomUUID(), report.updated_at), /test delivery failure/);
assert.equal((await rows('SELECT status FROM public.question_reports WHERE id=$1', [bob]))[0].status, 'new');
assert.equal((await rows('SELECT * FROM public.question_report_responses')).length, 1);
await db.exec('RESET ROLE');
await db.exec("DROP TRIGGER test_fail ON app_notifications; DELETE FROM practice_questions WHERE id='q1';");
await as('admin');
assert.equal((await rows('SELECT question_snapshot FROM question_reports WHERE id=$1', [bob]))[0].question_snapshot.content, 'x+1=?');
await as('bob');
const legacy = await submit('practice', 'legacy-q');
await as('admin');
assert.equal((await rows('SELECT source_id FROM question_reports WHERE id=$1', [legacy]))[0].source_id, 'legacy-lesson');
await as('carol');
for (let i = 1; i <= 20; i++) await submit('practice', `limit-${i}`);
await assert.rejects(() => submit('practice', 'limit-21'), /20 báo lỗi/);
await db.exec('RESET ROLE; SET ROLE anon');
await assert.rejects(() => submit('practice', 'limit-21'), /permission denied/);
console.log('PASS: rerunnable migration, practice/exam snapshots, validation, deduplication, RLS, admin-only writes, status, optimistic concurrency, private notifications, retry idempotency, atomic rollback, deletion snapshots, daily limit, anonymous access.');
await db.close();
