-- FlyDo: run this WHOLE file before deploying the short-answer web version.
-- Requires mock-exam-server-grading.sql AND mock-exam-server-lockdown.sql.
-- Rerunnable; keeps old questions, attempts, scores and session snapshots.
BEGIN;
DO $$ BEGIN
  IF to_regclass('public.mock_exam_sessions') IS NULL
    OR to_regprocedure('public.flydo_is_exam_admin()') IS NULL
    OR to_regprocedure('public.import_questions_json(text,text,uuid,smallint,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'FLYDO: Cần cài chấm thi máy chủ, lockdown và nhập JSON trước.';
  END IF;
END $$;

ALTER TABLE public.mock_exam_questions ADD COLUMN IF NOT EXISTS question_type text NOT NULL DEFAULT 'multiple_choice';
ALTER TABLE public.mock_exam_questions ADD COLUMN IF NOT EXISTS accepted_answers jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.mock_exam_questions ALTER COLUMN correct_answer DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.flydo_exam_normalize_short_answer(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT btrim(regexp_replace(p_value, '[' || chr(32)||chr(9)||chr(10)||chr(13)||chr(12)||chr(11)||chr(160) || ']+', ' ', 'g'), ' ');
$$;

CREATE OR REPLACE FUNCTION public.flydo_exam_question_valid(p_q jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE v_type text; v_opts jsonb; v_key jsonb; v_answer jsonb; v_norm text;
BEGIN
  IF p_q IS NULL OR jsonb_typeof(p_q) <> 'object' OR jsonb_typeof(p_q->'content') IS DISTINCT FROM 'string'
    OR btrim(p_q->>'content') = '' THEN RETURN false; END IF;
  v_type := CASE WHEN p_q ? 'question_type' THEN p_q->>'question_type' ELSE 'multiple_choice' END;
  IF v_type IS NULL OR v_type NOT IN ('multiple_choice','short_answer') THEN RETURN false; END IF;
  IF v_type = 'short_answer' THEN
    FOREACH v_norm IN ARRAY ARRAY['options','answers'] LOOP
      IF p_q ? v_norm AND (jsonb_typeof(p_q->v_norm) IS DISTINCT FROM 'array' OR p_q->v_norm <> '[]'::jsonb) THEN RETURN false; END IF;
    END LOOP;
    FOREACH v_norm IN ARRAY ARRAY['correct_answer','correctAnswer','answer'] LOOP
      IF p_q ? v_norm AND p_q->v_norm <> 'null'::jsonb THEN RETURN false; END IF;
    END LOOP;
    v_key := p_q->'accepted_answers';
    IF jsonb_typeof(v_key) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
    IF jsonb_array_length(v_key) NOT BETWEEN 1 AND 20 THEN RETURN false; END IF;
    FOR v_answer IN SELECT value FROM jsonb_array_elements(v_key) LOOP
      IF jsonb_typeof(v_answer) <> 'string' OR char_length(v_answer #>> '{}') > 200 THEN RETURN false; END IF;
      v_norm := public.flydo_exam_normalize_short_answer(v_answer #>> '{}');
      IF char_length(v_norm) NOT BETWEEN 1 AND 100 THEN RETURN false; END IF;
    END LOOP;
  ELSE
    v_opts := p_q->'options';
    IF jsonb_typeof(v_opts) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
    IF jsonb_array_length(v_opts) NOT BETWEEN 2 AND 4 THEN RETURN false; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_opts) v WHERE jsonb_typeof(v) <> 'string' OR btrim(v #>> '{}') = '') THEN RETURN false; END IF;
    IF p_q ? 'accepted_answers' AND p_q->'accepted_answers' <> '[]'::jsonb THEN RETURN false; END IF;
    IF jsonb_typeof(p_q->'correct_answer') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
    IF (p_q->>'correct_answer') !~ '^[0-3]$' THEN RETURN false; END IF;
    IF (p_q->>'correct_answer')::integer >= jsonb_array_length(v_opts) THEN RETURN false; END IF;
  END IF;
  RETURN true;
END $$;

-- Trigger executes as owner so revoked private helpers do not break ADMIN edits.
CREATE OR REPLACE FUNCTION public.flydo_exam_check_question()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.flydo_exam_question_valid(to_jsonb(NEW)) THEN
    RAISE EXCEPTION 'FLYDO: Câu hỏi hoặc đáp án không hợp lệ.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS flydo_exam_check_question ON public.mock_exam_questions;
CREATE TRIGGER flydo_exam_check_question BEFORE INSERT OR UPDATE ON public.mock_exam_questions
  FOR EACH ROW EXECUTE FUNCTION public.flydo_exam_check_question();
ALTER TABLE public.mock_exam_questions DROP CONSTRAINT IF EXISTS mock_exam_questions_type_answer_check;
ALTER TABLE public.mock_exam_questions ADD CONSTRAINT mock_exam_questions_type_answer_check CHECK (
  (question_type = 'multiple_choice' AND correct_answer IS NOT NULL AND accepted_answers = '[]'::jsonb)
  OR (question_type = 'short_answer' AND correct_answer IS NULL AND options = '[]'::jsonb
    AND jsonb_typeof(accepted_answers) = 'array' AND jsonb_array_length(accepted_answers) BETWEEN 1 AND 20)
);

CREATE OR REPLACE FUNCTION public.flydo_exam_answer_correct(p_q jsonb, p_answer jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE v_text text;
BEGIN
  IF coalesce(p_q->>'question_type','multiple_choice') = 'short_answer' THEN
    IF jsonb_typeof(p_answer) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
    v_text := public.flydo_exam_normalize_short_answer(p_answer #>> '{}');
    IF v_text = '' OR char_length(p_answer #>> '{}') > 100 THEN RETURN false; END IF;
    RETURN EXISTS(SELECT 1 FROM jsonb_array_elements(p_q->'accepted_answers') a
      WHERE public.flydo_exam_normalize_short_answer(a #>> '{}') = v_text);
  END IF;
  RETURN coalesce(jsonb_typeof(p_answer) = 'number' AND p_answer = p_q->'correct_answer', false);
END $$;

CREATE OR REPLACE FUNCTION public.flydo_exam_validate_answers(p_questions jsonb, p_answers jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE v_key text; v_value jsonb; v_q jsonb; v_by_id jsonb; v_result jsonb := '{}'::jsonb; v_text text;
BEGIN
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' OR pg_column_size(p_answers) > 65536 THEN
    RAISE EXCEPTION 'FLYDO: Đáp án gửi lên không hợp lệ.';
  END IF;
  SELECT jsonb_object_agg(q->>'id', q) INTO v_by_id FROM jsonb_array_elements(p_questions) q;
  FOR v_key, v_value IN SELECT * FROM jsonb_each(p_answers) LOOP
    v_q := v_by_id->v_key;
    IF v_q IS NULL THEN RAISE EXCEPTION 'FLYDO: Đáp án gửi lên không hợp lệ.'; END IF;
    IF coalesce(v_q->>'question_type','multiple_choice') = 'short_answer' THEN
      IF jsonb_typeof(v_value) <> 'string' THEN RAISE EXCEPTION 'FLYDO: Đáp án gửi lên không hợp lệ.'; END IF;
      v_text := v_value #>> '{}';
      IF char_length(v_text) > 100 THEN RAISE EXCEPTION 'FLYDO: Đáp án gửi lên không hợp lệ.'; END IF;
      IF public.flydo_exam_normalize_short_answer(v_text) = '' THEN CONTINUE; END IF;
    ELSE
      IF jsonb_typeof(v_value) <> 'number' OR v_value::text !~ '^[0-3]$' THEN
        RAISE EXCEPTION 'FLYDO: Đáp án gửi lên không hợp lệ.';
      END IF;
      IF v_value::text::integer >= jsonb_array_length(v_q->'options') THEN RAISE EXCEPTION 'FLYDO: Đáp án gửi lên không hợp lệ.'; END IF;
    END IF;
    v_result := v_result || jsonb_build_object(v_key, v_value);
  END LOOP;
  RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.flydo_exam_public_session(p_session public.mock_exam_sessions)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('session_id', p_session.id, 'exam', p_session.exam_snapshot,
    'questions', (SELECT jsonb_agg(jsonb_build_object('id', q->>'id', 'content', q->'content',
      'question_type', coalesce(q->>'question_type','multiple_choice'), 'options', q->'options',
      'diagram', q->'diagram', 'order_index', q->'order_index') ORDER BY ord)
      FROM jsonb_array_elements(p_session.questions_snapshot) WITH ORDINALITY AS items(q,ord)),
    'answers', p_session.answers, 'revision', p_session.revision, 'started_at', p_session.started_at,
    'deadline_at', p_session.deadline_at, 'server_now', clock_timestamp(), 'attempt_id', p_session.attempt_id);
$$;

CREATE OR REPLACE FUNCTION public.start_mock_exam_session(p_exam_id uuid, p_resume_session_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid := auth.uid(); v_session public.mock_exam_sessions%ROWTYPE; v_exam jsonb; v_questions jsonb; v_now timestamptz;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'FLYDO: Vui lòng đăng nhập để thi thử.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('mock-exam:' || v_user::text || ':' || p_exam_id::text,0));
  IF p_resume_session_id IS NOT NULL THEN
    SELECT * INTO v_session FROM public.mock_exam_sessions WHERE id=p_resume_session_id AND user_id=v_user AND exam_id=p_exam_id;
    IF FOUND THEN RETURN public.flydo_exam_public_session(v_session); END IF;
  END IF;
  SELECT * INTO v_session FROM public.mock_exam_sessions WHERE user_id=v_user AND exam_id=p_exam_id AND attempt_id IS NULL;
  IF FOUND THEN RETURN public.flydo_exam_public_session(v_session); END IF;
  SELECT to_jsonb(e) INTO v_exam FROM public.mock_exams e WHERE id=p_exam_id;
  IF v_exam IS NULL THEN RAISE EXCEPTION 'FLYDO: Không tìm thấy đề thi.'; END IF;
  SELECT jsonb_agg(to_jsonb(q) ORDER BY q.order_index,q.id) INTO v_questions FROM public.mock_exam_questions q WHERE q.exam_id=p_exam_id;
  IF v_questions IS NULL THEN RAISE EXCEPTION 'FLYDO: Đề thi chưa có câu hỏi.'; END IF;
  IF jsonb_array_length(v_questions)>1000 OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_questions) q WHERE NOT public.flydo_exam_question_valid(q)) THEN
    RAISE EXCEPTION 'FLYDO: Đề thi có câu hỏi chưa hợp lệ. Vui lòng báo ADMIN kiểm tra.';
  END IF;
  v_now:=clock_timestamp();
  INSERT INTO public.mock_exam_sessions(user_id,exam_id,exam_snapshot,questions_snapshot,started_at,deadline_at)
    VALUES(v_user,p_exam_id,v_exam,v_questions,v_now,v_now+make_interval(mins=>(v_exam->>'duration')::integer)) RETURNING * INTO v_session;
  RETURN public.flydo_exam_public_session(v_session);
END $$;

CREATE OR REPLACE FUNCTION public.save_mock_exam_answers(p_session_id uuid,p_answers jsonb,p_expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_session public.mock_exam_sessions%ROWTYPE; v_answers jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'FLYDO: Vui lòng đăng nhập để lưu bài.'; END IF;
  SELECT * INTO v_session FROM public.mock_exam_sessions WHERE id=p_session_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FLYDO: Không tìm thấy phiên thi của bạn.'; END IF;
  IF v_session.attempt_id IS NOT NULL OR clock_timestamp()>=v_session.deadline_at THEN
    RETURN jsonb_build_object('accepted',false,'revision',v_session.revision,'answers',v_session.answers,'attempt_id',v_session.attempt_id,'server_now',clock_timestamp());
  END IF;
  IF p_expected_revision IS NULL OR p_expected_revision<>v_session.revision THEN
    RAISE EXCEPTION 'FLYDO_CONFLICT: Bài làm đã được cập nhật ở cửa sổ khác. Hãy tải lại để đồng bộ.';
  END IF;
  v_answers:=public.flydo_exam_validate_answers(v_session.questions_snapshot,p_answers);
  UPDATE public.mock_exam_sessions SET answers=v_answers,revision=revision+1 WHERE id=v_session.id RETURNING * INTO v_session;
  RETURN jsonb_build_object('accepted',true,'revision',v_session.revision,'answers',v_session.answers,'attempt_id',v_session.attempt_id,'server_now',clock_timestamp());
END $$;

CREATE OR REPLACE FUNCTION public.submit_mock_exam_session(p_session_id uuid,p_answers jsonb,p_expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_session public.mock_exam_sessions%ROWTYPE; v_now timestamptz; v_correct integer; v_total integer; v_attempt uuid; v_duration integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'FLYDO: Vui lòng đăng nhập để nộp bài.'; END IF;
  SELECT * INTO v_session FROM public.mock_exam_sessions WHERE id=p_session_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FLYDO: Không tìm thấy phiên thi của bạn.'; END IF;
  IF v_session.attempt_id IS NOT NULL THEN RETURN jsonb_build_object('attempt_id',v_session.attempt_id); END IF;
  v_now:=clock_timestamp();
  IF v_now<v_session.deadline_at THEN
    IF p_expected_revision IS NULL OR p_expected_revision<>v_session.revision THEN
      RAISE EXCEPTION 'FLYDO_CONFLICT: Bài làm đã được cập nhật ở cửa sổ khác. Hãy tải lại để đồng bộ.';
    END IF;
    v_session.answers:=public.flydo_exam_validate_answers(v_session.questions_snapshot,p_answers);
  END IF;
  SELECT count(*),count(*) FILTER(WHERE public.flydo_exam_answer_correct(q,v_session.answers->(q->>'id')))
    INTO v_total,v_correct FROM jsonb_array_elements(v_session.questions_snapshot) q;
  v_duration:=greatest(0,least((v_session.exam_snapshot->>'duration')::integer*60,floor(extract(epoch FROM v_now-v_session.started_at))::integer));
  INSERT INTO public.mock_exam_attempts(user_id,exam_id,score,correct_count,total_questions,answers,duration_used)
    VALUES(v_session.user_id,v_session.exam_id,round(10.0*v_correct/v_total,2),v_correct,v_total,v_session.answers,v_duration) RETURNING id INTO v_attempt;
  UPDATE public.mock_exam_sessions SET answers=v_session.answers,attempt_id=v_attempt,revision=revision+1 WHERE id=v_session.id;
  RETURN jsonb_build_object('attempt_id',v_attempt);
END $$;

CREATE OR REPLACE FUNCTION public.get_my_mock_exam_result(p_exam_id uuid,p_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_attempt public.mock_exam_attempts%ROWTYPE; v_session public.mock_exam_sessions%ROWTYPE; v_exam jsonb; v_questions jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'FLYDO: Vui lòng đăng nhập để xem kết quả.'; END IF;
  SELECT * INTO v_attempt FROM public.mock_exam_attempts WHERE id=p_attempt_id AND exam_id=p_exam_id AND user_id=auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'FLYDO: Không tìm thấy bài làm của bạn trong đề thi này.'; END IF;
  SELECT * INTO v_session FROM public.mock_exam_sessions WHERE attempt_id=v_attempt.id AND user_id=auth.uid();
  IF FOUND THEN v_exam:=v_session.exam_snapshot; v_questions:=v_session.questions_snapshot;
  ELSE
    -- Snapshotless attempts predate short answers. Never disclose newly appended
    -- keys through a historical result while a new session is still in progress.
    SELECT to_jsonb(e) INTO v_exam FROM public.mock_exams e WHERE id=p_exam_id;
    SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.order_index,q.id),'[]'::jsonb) INTO v_questions
      FROM public.mock_exam_questions q WHERE q.exam_id=p_exam_id AND q.question_type='multiple_choice'
        AND q.created_at <= v_attempt.created_at;
  END IF;
  SELECT coalesce(jsonb_agg(q || jsonb_build_object('is_correct',public.flydo_exam_answer_correct(q,v_attempt.answers->(q->>'id'))) ORDER BY ord),'[]'::jsonb)
    INTO v_questions FROM jsonb_array_elements(v_questions) WITH ORDINALITY AS items(q,ord);
  RETURN jsonb_build_object('attempt',to_jsonb(v_attempt),'exam',v_exam,'questions',v_questions,'server_graded',v_session.id IS NOT NULL);
END $$;

CREATE OR REPLACE FUNCTION public.import_questions_json(p_target text,p_lesson_id text DEFAULT NULL,p_exam_id uuid DEFAULT NULL,p_level smallint DEFAULT NULL,p_questions jsonb DEFAULT '[]'::jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_q jsonb; v_type text; v_order integer; v_n integer:=0; v_opts jsonb; v_accepted jsonb;
BEGIN
  IF NOT public.flydo_is_exam_admin() THEN RAISE EXCEPTION 'Bạn không có quyền nhập câu hỏi'; END IF;
  IF p_target IS NULL OR p_target NOT IN ('practice','mock_exam') THEN RAISE EXCEPTION 'Loại nội dung không hợp lệ'; END IF;
  IF p_questions IS NULL OR jsonb_typeof(p_questions)<>'array' THEN RAISE EXCEPTION 'Danh sách câu hỏi không hợp lệ'; END IF;
  IF jsonb_array_length(p_questions) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Mỗi lượt nhập 1–100 câu'; END IF;
  IF p_target='practice' THEN
    IF p_level IS NULL OR p_level NOT BETWEEN 1 AND 4 THEN RAISE EXCEPTION 'Level tự luyện phải từ 1 đến 4'; END IF;
    PERFORM 1 FROM public.practice_lessons WHERE id=p_lesson_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy bài tự luyện đã chọn'; END IF;
    SELECT coalesce(max(order_index),-1)+1 INTO v_order FROM public.practice_questions WHERE lesson_id=p_lesson_id AND difficulty_level=p_level;
  ELSE
    PERFORM 1 FROM public.mock_exams WHERE id=p_exam_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy đề thi thử đã chọn'; END IF;
    SELECT coalesce(max(order_index),-1)+1 INTO v_order FROM public.mock_exam_questions WHERE exam_id=p_exam_id;
  END IF;
  FOR v_q IN SELECT value FROM jsonb_array_elements(p_questions) LOOP
    v_n:=v_n+1;
    IF NOT public.flydo_exam_question_valid(v_q) THEN RAISE EXCEPTION 'Câu %: nội dung hoặc đáp án không hợp lệ',v_n; END IF;
    v_type:=coalesce(v_q->>'question_type','multiple_choice');
    v_opts:=coalesce(v_q->'options','[]'::jsonb);
    IF p_target='practice' AND v_type='short_answer' THEN RAISE EXCEPTION 'Câu %: trả lời ngắn chỉ dùng trong Thi thử',v_n; END IF;
    IF v_type='multiple_choice' AND jsonb_array_length(v_opts)<>4 THEN RAISE EXCEPTION 'Câu %: cần đúng 4 phương án',v_n; END IF;
    IF v_type='short_answer' THEN
      SELECT jsonb_agg(answer ORDER BY ord) INTO v_accepted FROM (
        SELECT DISTINCT ON(public.flydo_exam_normalize_short_answer(answer #>> '{}')) answer,ord
        FROM jsonb_array_elements(v_q->'accepted_answers') WITH ORDINALITY AS x(answer,ord)
        ORDER BY public.flydo_exam_normalize_short_answer(answer #>> '{}'),ord
      ) dedup;
    ELSE v_accepted:='[]'::jsonb; END IF;
    IF p_target='practice' THEN
      INSERT INTO public.practice_questions(lesson_id,content,options,correct_answer,solution,has_math,difficulty_level,order_index,diagram)
        VALUES(p_lesson_id,btrim(v_q->>'content'),v_opts,(v_q->>'correct_answer')::integer,coalesce(v_q->>'solution',''),
          (v_q->>'content') ~ '\$|\\|\^|_' OR coalesce(v_q->>'solution','') ~ '\$|\\|\^|_',p_level,v_order,v_q->'diagram');
    ELSE
      INSERT INTO public.mock_exam_questions(exam_id,content,options,correct_answer,solution,order_index,diagram,question_type,accepted_answers)
        VALUES(p_exam_id,btrim(v_q->>'content'),v_opts,(v_q->>'correct_answer')::integer,coalesce(v_q->>'solution',''),v_order,v_q->'diagram',v_type,v_accepted);
    END IF;
    v_order:=v_order+1;
  END LOOP;
  RETURN v_n;
END $$;

REVOKE ALL ON FUNCTION public.flydo_exam_normalize_short_answer(text),public.flydo_exam_question_valid(jsonb),
  public.flydo_exam_answer_correct(jsonb,jsonb),public.flydo_exam_check_question(),public.flydo_exam_validate_answers(jsonb,jsonb),
  public.flydo_exam_public_session(public.mock_exam_sessions) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.import_questions_json(text,text,uuid,smallint,jsonb),public.start_mock_exam_session(uuid,uuid),
  public.save_mock_exam_answers(uuid,jsonb,integer),public.submit_mock_exam_session(uuid,jsonb,integer),public.get_my_mock_exam_result(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_questions_json(text,text,uuid,smallint,jsonb),public.start_mock_exam_session(uuid,uuid),
  public.save_mock_exam_answers(uuid,jsonb,integer),public.submit_mock_exam_session(uuid,jsonb,integer),public.get_my_mock_exam_result(uuid,uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
