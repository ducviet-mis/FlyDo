import { PGlite } from '../tmp/question-report-db-test/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
const sql = n => readFileSync('src/lib/supabase/' + n, 'utf8').replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;/gi, '');
assert.ok(existsSync('src/lib/supabase/mock-exam-short-answer.sql'), 'Short-answer migration must exist');
const db = new PGlite();
const a='10000000-0000-4000-8000-000000000001', b='10000000-0000-4000-8000-000000000002', admin='10000000-0000-4000-8000-000000000003', unverified='10000000-0000-4000-8000-000000000004', exam='20000000-0000-4000-8000-000000000001';
await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO authenticated,anon;
 INSERT INTO auth.users VALUES ('${a}','a@test.invalid',now()),('${b}','b@test.invalid',now()),('${admin}','vietdang293.vn@gmail.com',now()),('${unverified}','vietdang293@gmail.com',NULL);
 CREATE TABLE practice_lessons(id text PRIMARY KEY); INSERT INTO practice_lessons VALUES('lesson');`);
await db.exec(sql('mock-exams-schema.sql'));
await db.exec(sql('question-json-import.sql'));
await db.exec('GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated,anon');
await db.exec(`INSERT INTO mock_exams(id,grade,title,duration) VALUES('${exam}',8,'Mixed test',10);
 INSERT INTO mock_exam_questions(exam_id,content,options,correct_answer,order_index) VALUES('${exam}','legacy','["a","b","c","d"]',0,0);`);
await db.exec(sql('mock-exam-server-grading.sql'));
await db.exec(sql('mock-exam-server-lockdown.sql'));
const snapshotless=(await db.query(`INSERT INTO mock_exam_attempts(user_id,exam_id,score,total_questions) VALUES('${a}','${exam}',7,1) RETURNING id`)).rows[0].id;
async function as(id,email='student@test.invalid',role='authenticated') {
 await db.exec('RESET ROLE'); await db.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,email})]); await db.exec('SET ROLE '+role);
}
async function rpc(name,args) { return (await db.query(`SELECT public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS r`,args)).rows[0].r; }
await as(a); const legacy=await rpc('start_mock_exam_session',[exam,null]);
await db.exec('RESET ROLE');
// A pre-upgrade session has no question_type in its snapshot.
await db.exec(sql('mock-exam-short-answer.sql')); await db.exec(sql('mock-exam-short-answer.sql'));
await as(a);
const old=await rpc('submit_mock_exam_session',[legacy.session_id,{[legacy.questions[0].id]:0},0]);
assert.equal((await rpc('get_my_mock_exam_result',[exam,old.attempt_id])).attempt.score,10);
const short={question_type:'short_answer',content:'fraction?',accepted_answers:['0,5','0.5','1/2'],solution:'secret'};
const word={question_type:'short_answer',content:'shape?',accepted_answers:['hình chữ nhật'],options:[],correct_answer:null};
const imp=(qs,target='mock_exam')=>rpc('import_questions_json',[target,target==='practice'?'lesson':null,target==='mock_exam'?exam:null,target==='practice'?1:null,qs]);
await assert.rejects(()=>imp([short]),/quyền/);
await as(unverified,'vietdang293@gmail.com'); await assert.rejects(()=>imp([short]),/quyền/);
await as(admin,'vietdang293.vn@gmail.com'); assert.equal(await imp([short,word]),2);
for (const bad of [{accepted_answers:[]},{accepted_answers:[5]},{accepted_answers:[' ']},{accepted_answers:Array(21).fill('a')},
 {accepted_answers:['😀'.repeat(101)]},{accepted_answers:[' '.repeat(201)+'a']},{correct_answer:0},{answer:'A'},{options:['x']},{answers:['x']},{question_type:null},{question_type:'essay'}]) {
 await assert.rejects(()=>imp([short,{...short,...bad}]),/hợp lệ|Câu/);
 assert.equal((await db.query('SELECT count(*) AS n FROM mock_exam_questions')).rows[0].n,3);
}
await assert.rejects(()=>imp([short],'practice'),/Thi thử/);
// Authenticated ADMIN direct edits pass the private SECURITY DEFINER trigger.
await db.query('UPDATE mock_exam_questions SET content=$1 WHERE question_type=$2',['fraction edit','short_answer']);
await as(a); const s=await rpc('start_mock_exam_session',[exam,null]);
const oldResult=await rpc('get_my_mock_exam_result',[exam,snapshotless]);
assert.equal(oldResult.attempt.score,7);
assert.equal(oldResult.server_graded,false);
assert.equal(oldResult.questions.length,1,'Snapshotless historical results must not expose new short-answer questions');
assert.equal(oldResult.questions.some(q=>q.question_type==='short_answer'||q.accepted_answers?.length),false);
assert.equal(s.questions.length,3); const [q1,q2,q3]=s.questions.map(q=>q.id);
for (const q of s.questions) { assert.equal(q.accepted_answers,undefined); assert.equal(q.correct_answer,undefined); assert.equal(q.solution,undefined); }
for (const bad of [null,[],{outside:'5'},{[q1]:'0'},{[q2]:5},{[q2]:'😀'.repeat(101)},{[q1]:4}]) await assert.rejects(()=>rpc('save_mock_exam_answers',[s.session_id,bad,0]),/hợp lệ/);
let save=await rpc('save_mock_exam_answers',[s.session_id,{[q2]:'😀'.repeat(100),[q3]:' \u00a0\t'},0]);
assert.equal(save.answers[q3],undefined); assert.equal(save.answers[q2],'😀'.repeat(100));
await assert.rejects(()=>rpc('save_mock_exam_answers',[s.session_id,{},0]),/CONFLICT/);
await as(b); await assert.rejects(()=>rpc('submit_mock_exam_session',[s.session_id,{},1]),/Không tìm thấy/);
await as(admin,'vietdang293.vn@gmail.com'); await db.query('UPDATE mock_exam_questions SET accepted_answers=$1 WHERE id=$2',[JSON.stringify(['changed']),q2]);
await as(a); const submitted=await rpc('submit_mock_exam_session',[s.session_id,{[q1]:0,[q2]:' 0,5 ',[q3]:'sai'},1]);
const result=await rpc('get_my_mock_exam_result',[exam,submitted.attempt_id]);
assert.equal(result.attempt.score,6.67); assert.deepEqual(result.questions.map(q=>q.is_correct),[true,true,false]);
assert.deepEqual(result.questions[1].accepted_answers,['0,5','0.5','1/2']);
assert.equal((await rpc('submit_mock_exam_session',[s.session_id,{},0])).attempt_id,submitted.attempt_id);
assert.equal((await db.query('SELECT * FROM mock_exam_questions')).rows.length,0);
for (const [name,args] of [['flydo_exam_normalize_short_answer',['a']],['flydo_exam_question_valid',[short]],['flydo_exam_answer_correct',[short,'0.5']],['flydo_exam_validate_answers',[[],{}]]]) await assert.rejects(()=>rpc(name,args),/permission denied/);
await assert.rejects(()=>db.query('UPDATE mock_exam_attempts SET score=10'),/permission denied/);
await as(b); await assert.rejects(()=>rpc('get_my_mock_exam_result',[exam,submitted.attempt_id]),/Không tìm thấy/);
const late=await rpc('start_mock_exam_session',[exam,null]);
await rpc('save_mock_exam_answers',[late.session_id,{[q1]:0,[q3]:'hình\u00a0\tchữ  nhật'},0]);
await db.exec('RESET ROLE'); await db.query("UPDATE mock_exam_sessions SET deadline_at=clock_timestamp()-interval '1 minute' WHERE id=$1",[late.session_id]);
await as(b); assert.equal((await rpc('save_mock_exam_answers',[late.session_id,{},1])).accepted,false);
const lr=await rpc('submit_mock_exam_session',[late.session_id,{[q2]:'changed'},1]);
assert.equal((await rpc('get_my_mock_exam_result',[exam,lr.attempt_id])).attempt.score,6.67);
await as(null,'','anon'); await assert.rejects(()=>rpc('start_mock_exam_session',[exam,null]),/permission denied/);
await db.exec('RESET ROLE');
for (const answer of ['0,5','0.5','1/2']) assert.equal(await rpc('flydo_exam_answer_correct',[short,JSON.stringify(answer)]),true);
for (const answer of ['2/4','0.50','50%']) assert.equal(await rpc('flydo_exam_answer_correct',[short,JSON.stringify(answer)]),false);
assert.equal(await rpc('flydo_exam_normalize_short_answer',['\u2003A\u2003']),'\u2003A\u2003');
assert.equal(await rpc('flydo_exam_answer_correct',[word,JSON.stringify('Hình chữ nhật')]),false);
assert.equal(await rpc('flydo_exam_answer_correct',[word,JSON.stringify('hinh chu nhat')]),false);
const manyQuestions=Array.from({length:1000},(_,i)=>({...short,id:'item'+i}));
const oversized=Object.fromEntries(manyQuestions.map(q=>[q.id,'x'.repeat(100)]));
await assert.rejects(()=>rpc('flydo_exam_validate_answers',[manyQuestions,oversized]),/hợp lệ/);
console.log('PASS: rerunnable mixed migration/import, atomic rejection, legacy snapshots, Unicode, variants, ownership, private keys/helpers, revision/deadline and ADMIN writes.');
await db.close();
