// Isolated PostgreSQL tests. Never connects to production / Supabase.
import { PGlite } from '../tmp/question-report-db-test/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
const alice = '10000000-0000-4000-8000-000000000001';
const bob = '10000000-0000-4000-8000-000000000002';
const admin = '10000000-0000-4000-8000-000000000003';
const unverified = '10000000-0000-4000-8000-000000000004';
const exam = '20000000-0000-4000-8000-000000000001';
const q1 = '30000000-0000-4000-8000-000000000001';
const q2 = '30000000-0000-4000-8000-000000000002';
await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
  CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz);
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO authenticated, anon;
  INSERT INTO auth.users VALUES ('${alice}', 'alice@test.invalid', now()), ('${bob}', 'bob@test.invalid', now()),
    ('${admin}', 'vietdang293.vn@gmail.com', now()), ('${unverified}', 'vietdang293@gmail.com', NULL);`);
const sql = (name) => readFileSync(new URL('../src/lib/supabase/' + name, import.meta.url), 'utf8');
await db.exec(sql('mock-exams-schema.sql').replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;/i, ''));
await db.exec('GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon');
await db.exec(`INSERT INTO mock_exams(id, grade, title, duration) VALUES ('${exam}', 8, 'Đề kiểm thử', 10);
  INSERT INTO mock_exam_questions(id, exam_id, content, options, correct_answer, solution, order_index)
  VALUES ('${q1}', '${exam}', '1+1=?', '["1","2","3","4"]', 1, 'Lời giải bí mật', 0),
    ('${q2}', '${exam}', '2+2=?', '["1","2","3","4"]', 3, 'Lời giải hai', 1);`);
await db.exec(sql('mock-exam-server-grading.sql'));
await db.exec(sql('mock-exam-server-grading.sql'));
async function as(id, email = 'student@test.invalid', role = 'authenticated') {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: id, email })]);
  await db.exec('SET ROLE ' + role);
}
async function rpc(name, args) {
  const placeholders = args.map((_, i) => '$' + (i + 1)).join(',');
  return (await db.query(`SELECT public.${name}(${placeholders}) AS result`, args)).rows[0].result;
}
const start = (resume = null) => rpc('start_mock_exam_session', [exam, resume]);
await as(alice);
const a = await start();
assert.equal(a.questions.length, 2);
assert.equal(a.questions[0].correct_answer, undefined);
assert.equal(a.questions[0].solution, undefined);
assert.equal((await start()).session_id, a.session_id);
assert.equal((await start(a.session_id)).deadline_at, a.deadline_at);
await assert.rejects(() => db.query('SELECT * FROM mock_exam_sessions'), /permission denied/);
await assert.rejects(() => rpc('flydo_exam_validate_answers', [[], {}]), /permission denied/);
for (const bad of [null, [], { missing: 0 }, { [q1]: '1' }, { [q1]: -1 }, { [q1]: 4 }, { [q1]: 1.5 }, { [q1]: 1e30 }]) {
  await assert.rejects(() => rpc('save_mock_exam_answers', [a.session_id, bad, 0]), /không hợp lệ/);
}
const saved = await rpc('save_mock_exam_answers', [a.session_id, { [q1]: 1 }, 0]);
assert.equal(saved.revision, 1);
await assert.rejects(() => rpc('save_mock_exam_answers', [a.session_id, {}, 0]), /FLYDO_CONFLICT/);
await as(bob);
await assert.rejects(() => rpc('save_mock_exam_answers', [a.session_id, {}, 1]), /Không tìm thấy/);
await assert.rejects(() => rpc('submit_mock_exam_session', [a.session_id, {}, 1]), /Không tìm thấy/);
const b = await start(a.session_id);
assert.notEqual(b.session_id, a.session_id);
await db.exec('RESET ROLE');
// Admin edits during an active exam must not change that exam's grading / result.
await db.exec(`UPDATE mock_exam_questions SET correct_answer = 0, solution = 'Edited' WHERE id='${q1}';
  UPDATE mock_exams SET title='Edited exam', duration=45 WHERE id='${exam}';`);
await as(alice);
const submitted = await rpc('submit_mock_exam_session', [a.session_id, { [q1]: 1, [q2]: 3 }, 1]);
assert.equal((await rpc('submit_mock_exam_session', [a.session_id, {}, 0])).attempt_id, submitted.attempt_id);
assert.equal((await start(a.session_id)).attempt_id, submitted.attempt_id);
const result = await rpc('get_my_mock_exam_result', [exam, submitted.attempt_id]);
assert.equal(result.attempt.score, 10);
assert.equal(result.attempt.correct_count, 2);
assert.equal(result.exam.title, 'Đề kiểm thử');
assert.equal(result.questions[0].solution, 'Lời giải bí mật');
assert.equal(result.server_graded, true);
await as(bob);
await assert.rejects(() => rpc('get_my_mock_exam_result', [exam, submitted.attempt_id]), /Không tìm thấy/);
await rpc('save_mock_exam_answers', [b.session_id, { [q1]: 1 }, 0]);
await db.exec('RESET ROLE');
await db.query("UPDATE mock_exam_sessions SET started_at = clock_timestamp() - interval '11 minutes', deadline_at = clock_timestamp() - interval '1 minute' WHERE id=$1", [b.session_id]);
await db.exec(sql('mock-exam-server-lockdown.sql'));
await db.exec(sql('mock-exam-server-lockdown.sql'));
await as(bob);
const lateSave = await rpc('save_mock_exam_answers', [b.session_id, { [q1]: 1, [q2]: 3 }, 1]);
assert.equal(lateSave.accepted, false);
assert.deepEqual(lateSave.answers, { [q1]: 1 });
assert.equal((await start()).session_id, b.session_id); // No timer reset after expiry.
const late = await rpc('submit_mock_exam_session', [b.session_id, { [q1]: 1, [q2]: 3 }, 1]);
const lateResult = await rpc('get_my_mock_exam_result', [exam, late.attempt_id]);
assert.equal(lateResult.attempt.score, 5);
assert.equal(lateResult.attempt.duration_used, 600);
assert.deepEqual(lateResult.attempt.answers, { [q1]: 1 });
assert.equal((await db.query('SELECT * FROM mock_exam_questions')).rows.length, 0);
await assert.rejects(() => db.query(`INSERT INTO mock_exam_attempts(user_id,exam_id,score) VALUES ('${bob}','${exam}',10)`), /permission denied/);
await assert.rejects(() => db.query('UPDATE mock_exam_attempts SET score=10'), /permission denied/);
await assert.rejects(() => db.query('DELETE FROM mock_exam_attempts'), /permission denied/);
assert.equal((await db.query('SELECT * FROM mock_exam_attempts')).rows.length, 1);
await as(unverified, 'vietdang293@gmail.com');
assert.equal((await db.query('SELECT * FROM mock_exam_questions')).rows.length, 0);
await as(admin, 'vietdang293.vn@gmail.com');
assert.equal((await db.query('SELECT * FROM mock_exam_questions')).rows.length, 2);
await db.exec(`UPDATE mock_exam_questions SET content='ADMIN can edit' WHERE id='${q2}'`);
await db.exec('RESET ROLE');
const legacy = (await db.query(`INSERT INTO mock_exam_attempts(user_id,exam_id,score) VALUES ('${alice}','${exam}',7) RETURNING id`)).rows[0].id;
await as(alice);
assert.equal((await rpc('get_my_mock_exam_result', [exam, legacy])).server_graded, false);
assert.equal((await rpc('get_my_mock_exam_result', [exam, submitted.attempt_id])).questions[0].correct_answer, 1);
const retake = await start();
assert.notEqual(retake.session_id, a.session_id);
await as(null, '', 'anon');
await assert.rejects(() => start(), /permission denied/);
await assert.rejects(() => db.query('SELECT * FROM mock_exam_questions'), /permission denied/);
await db.exec('RESET ROLE');
assert.equal((await db.query('SELECT count(*) AS n FROM mock_exam_attempts WHERE id=$1', [submitted.attempt_id])).rows[0].n, 1);
console.log('PASS: rerunnable SQL, answer-key privacy, private sessions, verified ADMIN, drafts/revision conflicts, ownership, server scoring/deadline, late-answer rejection, idempotent submission, immutable snapshots, retakes, legacy results, direct-score tampering and anonymous access.');
await db.close();
