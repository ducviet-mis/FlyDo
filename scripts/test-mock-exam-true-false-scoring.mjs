// In-memory PostgreSQL only. No Supabase, credentials, files or external writes.
// Run: node scripts/test-mock-exam-true-false-scoring.mjs
import { PGlite } from '../tmp/question-report-db-test/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';

const migration = 'mock-exam-true-false-scoring.sql';
const sql = name => readFileSync(new URL('../src/lib/supabase/' + name, import.meta.url), 'utf8')
  .replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;/gi, '');
const db = new PGlite();
const admin = '10000000-0000-4000-8000-000000000001';
const alice = '10000000-0000-4000-8000-000000000002';
const bob = '10000000-0000-4000-8000-000000000003';
const unverified = '10000000-0000-4000-8000-000000000004';
const legacyId = '20000000-0000-4000-8000-000000000001';
const mc = { content: 'MC', options: ['a','b','c','d'], correct_answer: 0, solution: 'secret MC' };
const sa = { content: 'SA', question_type: 'short_answer', accepted_answers: ['0,5', '0.5'], solution: 'secret SA' };
const tf = { content: 'TF', question_type: 'true_false', solution: 'secret TF', statements:
  [true,false,true,false].map((key,i) => ({ content: 'statement ' + i, correct_answer: key, solution: 'secret ' + i })) };
const points = (m=0,t=0,s=0) => ({ multiple_choice:m, true_false:t, short_answer:s });
let passed=0;
async function test(name, f) { await f(); passed++; console.log('PASS ' + name); }
async function owner() { await db.exec('RESET ROLE'); }
async function as(id, email=id===admin?'vietdang293.vn@gmail.com':'student@test.invalid', role='authenticated') {
  await owner();
  await db.query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({sub:id,email})]);
  await db.exec('SET ROLE ' + role);
}
async function rpc(name, args) {
  return (await db.query(`SELECT public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS r`,
    args.map(a => a !== null && typeof a === 'object' ? JSON.stringify(a) : a))).rows[0].r;
}
const get = id => rpc('admin_get_mock_exam_scoring',[id]);
const save = (id,p,o,rev,publish=false) => rpc('admin_save_mock_exam_scoring',[id,p,o,rev,publish]);
const imp = (id,qs,rev) => rpc('admin_import_mock_exam_questions',[id,qs,rev]);
const preview = (id,qs,rev) => rpc('admin_preview_mock_exam_import',[id,qs,rev]);
const oldImp = (id,qs) => rpc('import_questions_json',['mock_exam',null,id,null,qs]);
async function create(title='sectioned') {
  await as(admin);
  return (await db.query('INSERT INTO mock_exams(grade,title,duration,scoring_mode) VALUES(8,$1,10,\'sectioned\') RETURNING id',[title])).rows[0].id;
}

try {
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated,anon;
    INSERT INTO auth.users VALUES('${admin}','vietdang293.vn@gmail.com',now()),('${alice}','alice@test.invalid',now()),
      ('${bob}','bob@test.invalid',now()),('${unverified}','vietdang293@gmail.com',NULL);
    CREATE TABLE profiles(id uuid PRIMARY KEY,name text);
    INSERT INTO profiles SELECT id,'name' FROM auth.users;
    CREATE TABLE practice_lessons(id text PRIMARY KEY,title text,grade integer,chapter text);
    INSERT INTO practice_lessons VALUES('lesson','Lesson',8,'chapter');`);
  for (const name of ['mock-exams-schema.sql','question-json-import.sql','mock-exam-server-grading.sql',
    'mock-exam-server-lockdown.sql','mock-exam-short-answer.sql','notifications.sql','question-reports.sql']) await db.exec(sql(name));
  await db.exec('GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated,anon');
  // Restore intentional lockdown grants after the fixture's broad legacy grants.
  await db.exec(sql('mock-exam-server-lockdown.sql'));
  await db.exec(`INSERT INTO mock_exams(id,grade,title,duration) VALUES('${legacyId}',8,'legacy',10);
    INSERT INTO mock_exam_questions(exam_id,content,options,correct_answer,order_index)
      VALUES('${legacyId}','old MC','["a","b","c","d"]',0,0);
    INSERT INTO mock_exam_attempts(user_id,exam_id,score,total_questions) VALUES('${alice}','${legacyId}',7.25,1);`);
  await as(alice);
  const oldSession = await rpc('start_mock_exam_session',[legacyId,null]);
  await owner();
  const beforeAttempts=(await db.query('SELECT * FROM mock_exam_attempts ORDER BY id')).rows;
  const beforeSessions=(await db.query('SELECT * FROM mock_exam_sessions ORDER BY id')).rows;
  const beforeQuestions=(await db.query('SELECT * FROM mock_exam_questions ORDER BY id')).rows;
  // RED against the installed baseline exercises missing behavior, not SQL text.
  if (process.argv.includes('--baseline-red')) {
    assert.equal(await rpc('flydo_exam_question_valid',[tf]),true,'Four boolean statements must be a valid exam question');
  }
  assert.ok(existsSync(new URL('../src/lib/supabase/' + migration, import.meta.url)), 'Missing sectioned/true-false SQL migration');
  await db.exec(sql(migration));
  await db.exec(sql(migration));
  await test('rerun leaves old attempts, sessions and question values intact', async () => {
    assert.deepEqual((await db.query('SELECT * FROM mock_exam_attempts ORDER BY id')).rows,beforeAttempts);
    assert.deepEqual((await db.query('SELECT * FROM mock_exam_sessions ORDER BY id')).rows,beforeSessions);
    const q=(await db.query('SELECT * FROM mock_exam_questions ORDER BY id')).rows[0];
    for (const [k,v] of Object.entries(beforeQuestions[0])) assert.deepEqual(q[k],v);
    assert.equal(q.max_points,null); assert.equal(q.points_override,null);
    assert.equal((await db.query('SELECT scoring_mode FROM mock_exams WHERE id=$1',[legacyId])).rows[0].scoring_mode,'legacy_equal');
  });
  await test('old sessions grade unchanged and snapshotless history has no invented weights', async () => {
    await as(alice);
    const r=await rpc('submit_mock_exam_session',[oldSession.session_id,{[oldSession.questions[0].id]:0},0]);
    const result=await rpc('get_my_mock_exam_result',[legacyId,r.attempt_id]);
    assert.equal(result.attempt.score,10); assert.equal(result.section_scores,undefined);
    const history=await rpc('get_my_mock_exam_result',[legacyId,beforeAttempts[0].id]);
    assert.equal(history.attempt.score,7.25); assert.equal(history.section_scores,undefined);
    assert.equal(history.questions[0].earned_points,undefined); assert.equal(history.questions[0].max_points,undefined);
  });
  await test('all admin RPCs require verified database email, ignoring forged JWT email',async()=>{
    for (const who of [alice,unverified]) {
      await as(who,'vietdang293.vn@gmail.com');
      for (const [name,args] of [ ['admin_get_mock_exam_scoring',[legacyId]], ['admin_preview_mock_exam_import',[legacyId,[mc],0]],
        ['admin_save_mock_exam_scoring',[legacyId,points(10),{},0,false]], ['admin_delete_mock_exam_question',[legacyId,oldSession.questions[0].id,0]],
        ['admin_import_mock_exam_questions',[legacyId,[mc],0]] ]) await assert.rejects(()=>rpc(name,args),/ADMIN|quyền/);
      const forged=await db.query('UPDATE mock_exams SET title=$1 WHERE id=$2 RETURNING id',['forged',legacyId]);
      assert.deepEqual(forged.rows,[], 'RLS must suppress forged admin writes');
    }
    await as(null,'','anon'); await assert.rejects(()=>get(legacyId),/permission denied/);
    await as(admin);
  });
  let e;
  await test('SQL-first old web create/import/start payload stays usable as legacy',async()=>{
    await as(admin);
    const oldCreated=(await db.query('INSERT INTO mock_exams(grade,title,duration) VALUES(8,\'old web\',10) RETURNING *')).rows[0];
    assert.equal(oldCreated.scoring_mode,'legacy_equal','Omitted scoring columns must preserve old-web creation');
    assert.equal(oldCreated.scoring_ready,false); assert.equal(oldCreated.scoring_revision,0);
    assert.deepEqual(oldCreated.section_points,points(10));
    assert.equal(await oldImp(oldCreated.id,[mc,mc]),2);
    await as(alice); const room=await rpc('start_mock_exam_session',[oldCreated.id,null]);
    assert.equal(room.exam.scoring_mode,'legacy_equal'); assert.equal(room.questions.length,2);
    assert.equal(room.questions[0].max_points,undefined);
    const answers=Object.fromEntries(room.questions.map(q=>[q.id,0]));
    const r=await rpc('submit_mock_exam_session',[room.session_id,answers,0]);
    const result=await rpc('get_my_mock_exam_result',[oldCreated.id,r.attempt_id]);
    assert.equal(result.attempt.score,10); assert.equal(result.section_scores,undefined);
    await as(admin);
  });
  await test('explicit new-web sectioned exam stays draft through save/import',async()=>{
    e=await create(); let state=await get(e);
    assert.equal(state.exam.scoring_mode,'sectioned'); assert.equal(state.exam.scoring_ready,false);
    assert.deepEqual(state.exam.section_points,points(10)); assert.equal(state.revision,0);
    state=await save(e,points(2,4,4),{},0); assert.ok(state.errors.length); assert.equal(state.exam.scoring_ready,false);
    await as(alice); await assert.rejects(()=>rpc('start_mock_exam_session',[e,null]),/sẵn sàng|nháp/);
    await as(admin); state=await imp(e,[mc,tf,sa],1);
    assert.equal(state.count,3); assert.equal(state.revision,2); assert.equal(state.exam.scoring_ready,false);
    assert.deepEqual(state.questions.map(q=>q.max_points),[2,4,4]); assert.deepEqual(state.errors,[]);
  });
  await test('ADMIN can create custom section totals only as a valid unpublished revision-zero draft',async()=>{
    await as(admin);
    const row=(await db.query('INSERT INTO mock_exams(grade,title,duration,scoring_mode,section_points) VALUES(8,\'custom draft\',10,\'sectioned\',$1) RETURNING *',[JSON.stringify(points(2,4,4))])).rows[0];
    assert.deepEqual(row.section_points,points(2,4,4)); assert.equal(row.scoring_ready,false); assert.equal(row.scoring_revision,0);
    for(const p of [points(-1),points(1.00001),{...points(2),true_false:'4'},{multiple_choice:10},{...points(10),other:0}])
      await assert.rejects(()=>db.query('INSERT INTO mock_exams(grade,title,duration,scoring_mode,section_points) VALUES(8,\'bad\',10,\'sectioned\',$1)',[JSON.stringify(p)]),/điểm|hợp lệ/);
    await assert.rejects(()=>db.query('INSERT INTO mock_exams(grade,title,duration,section_points,scoring_ready) VALUES(8,\'bad publish\',10,$1,true)',[JSON.stringify(points(2,4,4))]),/RPC|điểm/);
  });
  await test('preview combines existing/incoming questions without persisting or trusting client max_points',async()=>{
    const before=await get(e); const p=await preview(e,[{...mc,max_points:999,id:'preview-0'}],before.revision);
    assert.equal(p.revision,before.revision); assert.equal(p.questions.length,4);
    assert.deepEqual(p.questions.filter(q=>q.question_type==='multiple_choice').map(q=>q.max_points),[1,1]);
    assert.deepEqual(await get(e),before);
    const p2=await preview(e,[{...mc,points:0.6,id:'30000000-0000-4000-8000-000000000001'}],before.revision);
    assert.equal(p2.questions.at(-1).id,'30000000-0000-4000-8000-000000000001');
    assert.equal(p2.questions.at(-1).max_points,0.6);
  });
  await test('import is atomic; malformed TF, point values and irrelevant keys are rejected',async()=>{
    const before=await get(e);
    const bad=[ {...tf,statements:tf.statements.slice(1)}, {...tf,statements:[...tf.statements,{content:'5',correct_answer:true}]},
      {...tf,statements:tf.statements.map((s,i)=>i===0?{...s,correct_answer:'false'}:s)},
      {...tf,statements:tf.statements.map((s,i)=>i===0?{...s,content:' '}:s)},
      {...tf,options:['a']}, {...tf,correct_answer:0}, {...tf,accepted_answers:['x']},
      {...mc,statements:tf.statements}, {...sa,statements:tf.statements},
      ...[0,-1,'1',null,1.00001,10].map(p=>({...mc,points:p})) ];
    for(const q of bad) { await assert.rejects(()=>imp(e,[mc,q],before.revision),/hợp lệ|Câu|điểm/); assert.deepEqual(await get(e),before); }
    await assert.rejects(()=>oldImp(e,[mc]),/revision|phiên bản|phân điểm/);
    await assert.rejects(()=>oldImp(legacyId,[tf]),/chuyển|phân điểm/);
    await assert.rejects(()=>oldImp(legacyId,[{...mc,points:1}]),/chuyển|phân điểm/);
    assert.equal(await oldImp(legacyId,[sa]),1);
    await assert.rejects(()=>rpc('import_questions_json',['practice','lesson',null,1,[tf]]),/Thi thử/);
    assert.equal(await rpc('import_questions_json',['practice','lesson',null,1,[mc]]),1);
  });
  await test('exact integer allocations, overrides, reset, rejection and stale revisions',async()=>{
    const x=await create(); let s=await save(x,points(2),{},0);
    s=await imp(x,Array(8).fill(mc),s.revision); assert.deepEqual(s.questions.map(q=>q.max_points),Array(8).fill(0.25));
    const ids=s.questions.map(q=>q.id);
    s=await save(x,points(2),{[ids[0]]:0.6},s.revision);
    assert.deepEqual(s.questions.map(q=>q.max_points),[0.6,...Array(7).fill(0.2)]);
    let before=s;
    for(const o of [{unknown:1},{[ids[1]]:'1'},{[ids[1]]:0},{[ids[1]]:-1},{[ids[1]]:0.00001},{[ids[1]]:2}]) {
      await assert.rejects(()=>save(x,points(2),o,before.revision),/điểm|câu|hợp lệ/); assert.deepEqual(await get(x),before);
    }
    for(const p of [{...points(2),true_false:'1'},points(-1),points(1.00001),{multiple_choice:10}]) await assert.rejects(()=>save(x,p,{},before.revision),/điểm|hợp lệ/);
    const rev=s.revision; s=await save(x,points(2),{[ids[0]]:null},rev);
    await assert.rejects(()=>save(x,points(2),{},rev),/CONFLICT/);
    await assert.rejects(()=>imp(x,[mc],rev),/CONFLICT/);
    await assert.rejects(()=>preview(x,[mc],rev),/CONFLICT/);
    await assert.rejects(()=>rpc('admin_delete_mock_exam_question',[x,ids[0],rev]),/CONFLICT/);
    s=await rpc('admin_delete_mock_exam_question',[x,ids[7],s.revision]);
    for(const id of ids.slice(3,7)) s=await rpc('admin_delete_mock_exam_question',[x,id,s.revision]);
    assert.deepEqual(s.questions.map(q=>q.max_points),[0.6667,0.6667,0.6666]);
    s=await save(x,points(2),{[ids[0]]:0.5,[ids[1]]:0.5,[ids[2]]:1},s.revision);
    assert.equal(s.questions.reduce((a,q)=>a+Math.round(q.max_points*10000),0),20000);
    await assert.rejects(()=>save(x,points(3),{},s.revision),/điểm/);
  });
  await test('direct section writes and publication/scoring bypass fail; metadata remains editable',async()=>{
    const s=await get(e);
    await db.query('UPDATE mock_exams SET title=$1 WHERE id=$2',['Updated title',e]);
    for(const query of ['UPDATE mock_exams SET scoring_ready=true WHERE id=$1','UPDATE mock_exams SET section_points=\'{"multiple_choice":10,"true_false":0,"short_answer":0}\' WHERE id=$1',
      'UPDATE mock_exams SET scoring_mode=\'legacy_equal\' WHERE id=$1','UPDATE mock_exam_questions SET max_points=10 WHERE exam_id=$1',
      'UPDATE mock_exam_questions SET content=\'bypass\' WHERE exam_id=$1','DELETE FROM mock_exam_questions WHERE exam_id=$1'])
      await assert.rejects(()=>db.query(query,[e]),/RPC|phân điểm|quyền/);
    await assert.rejects(()=>db.query('INSERT INTO mock_exam_questions(exam_id,content,options,correct_answer,order_index) VALUES($1,\'direct\',\'["a","b","c","d"]\',0,9)',[e]),/RPC|phân điểm/);
    assert.equal((await get(e)).revision,s.revision);
    await db.query('UPDATE mock_exam_questions SET content=$1 WHERE exam_id=$2 AND question_type=$3',['safe legacy edit',legacyId,'multiple_choice']);
    await assert.rejects(()=>db.query('UPDATE mock_exam_questions SET points_override=1 WHERE exam_id=$1',[legacyId]),/phân điểm|RPC/);
  });
  await test('publish validates totals and section presence, snapshots stay fixed after edits/draft',async()=>{
    let s=await get(e); s=await save(e,points(2,4,4),{},s.revision,true); assert.equal(s.exam.scoring_ready,true);
    await as(alice); const room=await rpc('start_mock_exam_session',[e,null]);
    for(const q of room.questions) { assert.equal(q.correct_answer,undefined); assert.equal(q.accepted_answers,undefined); assert.equal(q.solution,undefined); }
    assert.deepEqual(room.questions[1].statements,tf.statements.map(s=>({content:s.content})));
    assert.equal(room.questions[1].max_points,4);
    await as(admin); s=await save(e,points(1,5,4),{},s.revision); assert.equal(s.exam.scoring_ready,true);
    s=await save(e,points(1,4,4),{},s.revision); assert.equal(s.exam.scoring_ready,false);
    await assert.rejects(()=>save(e,points(1,4,4),{},s.revision,true),/10|sẵn sàng/);
    await as(bob); await assert.rejects(()=>rpc('start_mock_exam_session',[e,null]),/sẵn sàng|nháp/);
    await as(alice); const resumed=await rpc('start_mock_exam_session',[e,room.session_id]);
    assert.equal(resumed.questions[1].max_points,4);
    const resultId=await rpc('submit_mock_exam_session',[room.session_id,{[room.questions[0].id]:0,[room.questions[1].id]:[true,false,null,null],[room.questions[2].id]:' 0,5 '},0]);
    const result=await rpc('get_my_mock_exam_result',[e,resultId.attempt_id]);
    assert.equal(result.attempt.score,7); assert.equal(result.attempt.correct_count,2); assert.equal(result.partial_count,1);
    assert.deepEqual(result.section_scores.true_false,{max_points:4,earned_points:1,question_count:1});
    assert.equal(result.questions[1].correct_statement_count,2); assert.equal(result.questions[1].earned_points,1);
    assert.deepEqual(result.questions[1].statements,tf.statements);
    assert.equal((await rpc('submit_mock_exam_session',[room.session_id,{},999])).attempt_id,resultId.attempt_id);
    await as(admin); s=await rpc('admin_delete_mock_exam_question',[e,s.questions[1].id,s.revision]);
    await as(alice); assert.deepEqual(await rpc('get_my_mock_exam_result',[e,resultId.attempt_id]),result);
  });
  await test('TF grading exercises every rate at max 1 and non-unit max, partial null differs from false',async()=>{
    for(const budget of [1,2.5]) {
      const x=await create(); let s=await save(x,points(10-budget,budget),{},0); s=await imp(x,[mc,tf],s.revision);
      s=await save(x,points(10-budget,budget),{},s.revision,true);
      for(let correct=0;correct<=4;correct++) {
        await as(alice); const room=await rpc('start_mock_exam_session',[x,null]); const id=room.questions[1].id;
        const answers=tf.statements.map((s,i)=>i<correct?s.correct_answer:!s.correct_answer);
        const r=await rpc('submit_mock_exam_session',[room.session_id,{[id]:answers},0]);
        const result=await rpc('get_my_mock_exam_result',[x,r.attempt_id]);
        const expected=budget*[0,0.1,0.25,0.5,1][correct];
        assert.equal(result.questions[1].earned_points,expected); assert.equal(result.questions[1].correct_statement_count,correct);
        assert.equal(result.attempt.score,Number(expected.toFixed(2))); assert.equal(result.attempt.correct_count,correct===4?1:0);
      }
      await as(bob); const room=await rpc('start_mock_exam_session',[x,null]); const id=room.questions[1].id;
      for(const bad of [[true],Array(5).fill(false),[0,false,true,false],['true',false,true,false],{x:true}])
        await assert.rejects(()=>rpc('save_mock_exam_answers',[room.session_id,{[id]:bad},0]),/hợp lệ/);
      await assert.rejects(()=>rpc('save_mock_exam_answers',[room.session_id,{unknown:[true,false,true,false]},0]),/hợp lệ/);
      let a=await rpc('save_mock_exam_answers',[room.session_id,{[id]:[null,false,null,null]},0]); assert.deepEqual(a.answers[id],[null,false,null,null]);
      a=await rpc('save_mock_exam_answers',[room.session_id,{[id]:Array(4).fill(null)},1]); assert.equal(a.answers[id],undefined);
      const r=await rpc('submit_mock_exam_session',[room.session_id,{[id]:[null,false,null,null]},2]);
      const result=await rpc('get_my_mock_exam_result',[x,r.attempt_id]); assert.equal(result.questions[1].correct_statement_count,1);
    }
  });
  await test('owner, deadlines, revision and private helper grants remain enforced',async()=>{
    const x=await create(); let s=await imp(x,[mc],0); s=await save(x,points(10),{},s.revision,true);
    await as(alice); const room=await rpc('start_mock_exam_session',[x,null]); const id=room.questions[0].id;
    await rpc('save_mock_exam_answers',[room.session_id,{[id]:0},0]);
    await assert.rejects(()=>rpc('save_mock_exam_answers',[room.session_id,{},0]),/CONFLICT/);
    await assert.rejects(()=>rpc('submit_mock_exam_session',[room.session_id,{},0]),/CONFLICT/);
    await as(bob); await assert.rejects(()=>rpc('submit_mock_exam_session',[room.session_id,{},1]),/Không tìm thấy/);
    await owner(); await db.query("UPDATE mock_exam_sessions SET deadline_at=clock_timestamp()-interval '1 second' WHERE id=$1",[room.session_id]);
    await as(alice); assert.equal((await rpc('save_mock_exam_answers',[room.session_id,{},1])).accepted,false);
    const r=await rpc('submit_mock_exam_session',[room.session_id,{},999]); assert.equal((await rpc('get_my_mock_exam_result',[x,r.attempt_id])).attempt.score,10);
    await as(bob); await assert.rejects(()=>rpc('get_my_mock_exam_result',[x,r.attempt_id]),/Không tìm thấy/);
    assert.deepEqual((await db.query('SELECT * FROM mock_exam_questions')).rows,[]);
    await assert.rejects(()=>rpc('flydo_exam_question_valid',[tf]),/permission denied/);
    await assert.rejects(()=>rpc('flydo_exam_validate_answers',[[],{}]),/permission denied/);
    await assert.rejects(()=>db.query('UPDATE mock_exam_attempts SET score=10'),/permission denied/);
    await owner(); const leaks=(await db.query(`SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND (proname LIKE 'flydo_exam_%' AND proname NOT IN ('flydo_exam_guard_question_write','flydo_exam_guard_scoring_write'))
      AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))`)).rows;
    assert.deepEqual(leaks,[]);
  });
  await test('catalog hides drafts, including anonymous readers, and session tables never reveal keys',async()=>{
    const x=await create(); await as(alice);
    assert.deepEqual((await db.query('SELECT id FROM mock_exams WHERE id=$1',[x])).rows,[]);
    await assert.rejects(()=>db.query('SELECT questions_snapshot FROM mock_exam_sessions'),/permission denied/);
    await as(null,'','anon');
    assert.deepEqual((await db.query('SELECT id FROM mock_exams WHERE id=$1',[x])).rows,[]);
    assert.equal((await db.query('SELECT id FROM mock_exams WHERE id=$1',[legacyId])).rows.length,1);
    await assert.rejects(()=>db.query('SELECT * FROM mock_exam_questions'),/permission denied/);
    await as(admin); assert.equal((await db.query('SELECT id FROM mock_exams WHERE id=$1',[x])).rows.length,1);
  });
  await test('ready flag alone cannot start an invalid allocation; stale race rejects one writer',async()=>{
    const x=await create(); let s=await imp(x,[mc],0); s=await save(x,points(10),{},s.revision,true);
    const before=s.revision;
    const race=await Promise.allSettled([save(x,points(10),{},before),save(x,points(10),{},before)]);
    assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(race.filter(r=>r.status==='rejected' && /CONFLICT/.test(r.reason.message)).length,1);
    assert.equal((await get(x)).revision,before+1);
    await owner(); await db.query('UPDATE mock_exam_questions SET max_points=9 WHERE exam_id=$1',[x]);
    await as(alice); await assert.rejects(()=>rpc('start_mock_exam_session',[x,null]),/sẵn sàng|phân điểm/);
    await owner(); await db.query('UPDATE mock_exam_questions SET max_points=10 WHERE exam_id=$1',[x]);
    await db.query('UPDATE mock_exams SET section_points=$1 WHERE id=$2',[JSON.stringify(points(9)),x]);
    await as(alice); await assert.rejects(()=>rpc('start_mock_exam_session',[x,null]),/sẵn sàng|phân điểm/);
  });
  await test('weighted score rounds once after sum; reports retain four private keys for ADMIN only',async()=>{
    const x=await create(); let s=await save(x,points(8,2),{},0);
    s=await imp(x,[mc,tf,tf,tf],s.revision); s=await save(x,points(8,2),{},s.revision,true);
    assert.deepEqual(s.questions.slice(1).map(q=>q.max_points),[0.6667,0.6667,0.6666]);
    await as(alice); const room=await rpc('start_mock_exam_session',[x,null]);
    const answers=Object.fromEntries(room.questions.slice(1).map(q=>[q.id,[true,true,false,true]]));
    const r=await rpc('submit_mock_exam_session',[room.session_id,answers,0]);
    const result=await rpc('get_my_mock_exam_result',[x,r.attempt_id]);
    assert.equal(result.attempt.score,0.2); assert.equal(result.section_scores.true_false.earned_points,0.2);
    const report=await rpc('submit_question_report',['mock_exam',room.questions[1].id,'solution','Check']);
    assert.deepEqual((await db.query('SELECT * FROM question_reports')).rows,[]);
    await as(admin); const snap=(await db.query('SELECT question_snapshot FROM question_reports WHERE id=$1',[report])).rows[0].question_snapshot;
    assert.deepEqual(snap.statements,tf.statements);
    s=await rpc('admin_delete_mock_exam_question',[x,room.questions[1].id,s.revision]);
    assert.deepEqual((await db.query('SELECT question_snapshot FROM question_reports WHERE id=$1',[report])).rows[0].question_snapshot,snap);
    // A third run after real sectioned writes must not change allocations/history.
    await owner(); const stateBefore=(await db.query('SELECT * FROM mock_exams WHERE id=$1',[x])).rows;
    const qsBefore=(await db.query('SELECT * FROM mock_exam_questions WHERE exam_id=$1 ORDER BY order_index,id',[x])).rows;
    await db.exec(sql(migration));
    assert.deepEqual((await db.query('SELECT * FROM mock_exams WHERE id=$1',[x])).rows,stateBefore);
    assert.deepEqual((await db.query('SELECT * FROM mock_exam_questions WHERE exam_id=$1 ORDER BY order_index,id',[x])).rows,qsBefore);
    await as(alice); assert.deepEqual(await rpc('get_my_mock_exam_result',[x,r.attempt_id]),result);
  });
  await test('explicit legacy conversion leaves an existing session on its original grading rule',async()=>{
    await as(admin);
    const x=(await db.query('INSERT INTO mock_exams(grade,title,duration,scoring_mode) VALUES(8,\'convert\',10,\'legacy_equal\') RETURNING id')).rows[0].id;
    await oldImp(x,[mc,sa]);
    await as(alice); const old=await rpc('start_mock_exam_session',[x,null]);
    await as(admin); let s=await get(x); s=await save(x,points(1,0,9),{},s.revision);
    assert.equal(s.exam.scoring_mode,'sectioned'); assert.equal(s.exam.scoring_ready,false);
    await as(alice); const resumed=await rpc('start_mock_exam_session',[x,old.session_id]);
    assert.equal(resumed.exam.scoring_mode,'legacy_equal'); assert.equal(resumed.questions[0].max_points,undefined);
    const r=await rpc('submit_mock_exam_session',[old.session_id,{[old.questions[0].id]:0},0]);
    const result=await rpc('get_my_mock_exam_result',[x,r.attempt_id]); assert.equal(result.attempt.score,5);
    assert.equal(result.section_scores,undefined); assert.equal(result.questions[0].earned_points,undefined);
    await as(bob); await assert.rejects(()=>rpc('start_mock_exam_session',[x,null]),/nháp|sẵn sàng/);
    await as(admin); s=await save(x,points(1,0,9),{},s.revision,true);
    await as(bob); const fresh=await rpc('start_mock_exam_session',[x,null]);
    const r2=await rpc('submit_mock_exam_session',[fresh.session_id,{[fresh.questions[0].id]:0},0]);
    assert.equal((await rpc('get_my_mock_exam_result',[x,r2.attempt_id])).attempt.score,1);
  });
  await test('removing a question preserves overrides; impossible all-fixed deletion rolls back',async()=>{
    const x=await create(); let s=await save(x,points(2),{},0); s=await imp(x,[mc,mc,mc],s.revision);
    const [a,b,c]=s.questions.map(q=>q.id);
    s=await save(x,points(2),{[a]:0.5},s.revision);
    s=await rpc('admin_delete_mock_exam_question',[x,c,s.revision]);
    assert.deepEqual(s.questions.map(q=>[q.points_override,q.max_points]),[[0.5,0.5],[null,1.5]]);
    s=await save(x,points(2),{[b]:1.5},s.revision); const before=s;
    await assert.rejects(()=>rpc('admin_delete_mock_exam_question',[x,a,s.revision]),/điểm/);
    assert.deepEqual(await get(x),before);
  });
  console.log(`GREEN: ${passed} isolated database behavior groups. Revision races serialized by PGlite; no multi-connection stress claim.`);
} finally { await db.close(); }
