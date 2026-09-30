-- STEP 1: Install before publishing the new web app. Safe with the old app.
-- STEP 2: Publish the new app, then run mock-exam-server-lockdown.sql.
-- Does not delete questions, progress or historical results. Rerunnable.
BEGIN;

CREATE TABLE IF NOT EXISTS public.mock_exam_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_id uuid NOT NULL REFERENCES public.mock_exams(id) ON DELETE CASCADE,
  exam_snapshot jsonb NOT NULL,
  questions_snapshot jsonb NOT NULL CHECK (jsonb_typeof(questions_snapshot) = 'array'),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deadline_at timestamptz NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision integer NOT NULL DEFAULT 0,
  attempt_id uuid UNIQUE REFERENCES public.mock_exam_attempts(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS mock_exam_sessions_active_idx
  ON public.mock_exam_sessions(user_id, exam_id) WHERE attempt_id IS NULL;
CREATE INDEX IF NOT EXISTS mock_exam_sessions_attempt_idx ON public.mock_exam_sessions(attempt_id);
ALTER TABLE public.mock_exam_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mock_exam_sessions FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.flydo_exam_public_session(p_session public.mock_exam_sessions)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('session_id', p_session.id, 'exam', p_session.exam_snapshot,
    'questions', (SELECT jsonb_agg(jsonb_build_object('id', q->>'id', 'content', q->'content',
      'options', q->'options', 'diagram', q->'diagram', 'order_index', q->'order_index') ORDER BY ord)
      FROM jsonb_array_elements(p_session.questions_snapshot) WITH ORDINALITY AS items(q, ord)),
    'answers', p_session.answers, 'revision', p_session.revision,
    'started_at', p_session.started_at, 'deadline_at', p_session.deadline_at,
    'server_now', clock_timestamp(), 'attempt_id', p_session.attempt_id);
$$;
REVOKE ALL ON FUNCTION public.flydo_exam_public_session(public.mock_exam_sessions) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.flydo_exam_validate_answers(p_questions jsonb, p_answers jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE v_key text; v_value jsonb; v_options jsonb; v_by_id jsonb;
BEGIN
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' OR pg_column_size(p_answers) > 65536 THEN
    RAISE EXCEPTION 'FLYDO: Đáp án gửi lên không hợp lệ.';
  END IF;
  SELECT jsonb_object_agg(q->>'id', q->'options') INTO v_by_id FROM jsonb_array_elements(p_questions) q;
  FOR v_key, v_value IN SELECT * FROM jsonb_each(p_answers) LOOP
    v_options := v_by_id->v_key;
    IF v_options IS NULL OR jsonb_typeof(v_value) <> 'number' OR v_value::text !~ '^[0-9]+$'
       OR length(v_value::text) > 2 THEN RAISE EXCEPTION 'FLYDO: Đáp án gửi lên không hợp lệ.'; END IF;
    IF v_value::text::integer >= jsonb_array_length(v_options) THEN
      RAISE EXCEPTION 'FLYDO: Đáp án gửi lên không hợp lệ.';
    END IF;
  END LOOP;
  RETURN p_answers;
END $$;
REVOKE ALL ON FUNCTION public.flydo_exam_validate_answers(jsonb, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.start_mock_exam_session(p_exam_id uuid, p_resume_session_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid := auth.uid(); v_session public.mock_exam_sessions%ROWTYPE;
  v_exam jsonb; v_questions jsonb; v_now timestamptz;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'FLYDO: Vui lòng đăng nhập để thi thử.'; END IF;
  -- Serialize starts, including duplicate requests / two browser tabs.
  PERFORM pg_advisory_xact_lock(hashtextextended('mock-exam:' || v_user::text || ':' || p_exam_id::text, 0));
  IF p_resume_session_id IS NOT NULL THEN
    SELECT * INTO v_session FROM public.mock_exam_sessions
      WHERE id = p_resume_session_id AND user_id = v_user AND exam_id = p_exam_id;
    IF FOUND THEN RETURN public.flydo_exam_public_session(v_session); END IF;
  END IF;
  SELECT * INTO v_session FROM public.mock_exam_sessions
    WHERE user_id = v_user AND exam_id = p_exam_id AND attempt_id IS NULL;
  -- An expired session must be submitted, not replaced with a fresh deadline.
  IF FOUND THEN RETURN public.flydo_exam_public_session(v_session); END IF;
  SELECT to_jsonb(e) INTO v_exam FROM public.mock_exams e WHERE id = p_exam_id;
  IF v_exam IS NULL THEN RAISE EXCEPTION 'FLYDO: Không tìm thấy đề thi.'; END IF;
  SELECT jsonb_agg(to_jsonb(q) ORDER BY q.order_index, q.id) INTO v_questions
    FROM public.mock_exam_questions q WHERE q.exam_id = p_exam_id;
  IF v_questions IS NULL THEN RAISE EXCEPTION 'FLYDO: Đề thi chưa có câu hỏi.'; END IF;
  IF jsonb_array_length(v_questions) > 1000 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_questions) q WHERE
      CASE WHEN jsonb_typeof(q->'options') = 'array' THEN jsonb_array_length(q->'options') NOT BETWEEN 2 AND 4 ELSE true END
      OR q->>'correct_answer' IS NULL OR (q->>'correct_answer')::integer < 0
      OR CASE WHEN jsonb_typeof(q->'options') = 'array' THEN (q->>'correct_answer')::integer >= jsonb_array_length(q->'options') ELSE true END
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(q->'options') = 'array' THEN q->'options' ELSE '[]'::jsonb END) opt
        WHERE jsonb_typeof(opt) <> 'string')
  ) THEN RAISE EXCEPTION 'FLYDO: Đề thi có câu hỏi chưa hợp lệ. Vui lòng báo ADMIN kiểm tra.'; END IF;
  v_now := clock_timestamp();
  INSERT INTO public.mock_exam_sessions(user_id, exam_id, exam_snapshot, questions_snapshot, started_at, deadline_at)
    VALUES (v_user, p_exam_id, v_exam, v_questions, v_now,
      v_now + make_interval(mins => (v_exam->>'duration')::integer)) RETURNING * INTO v_session;
  RETURN public.flydo_exam_public_session(v_session);
END $$;

CREATE OR REPLACE FUNCTION public.save_mock_exam_answers(p_session_id uuid, p_answers jsonb, p_expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_session public.mock_exam_sessions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'FLYDO: Vui lòng đăng nhập để lưu bài.'; END IF;
  SELECT * INTO v_session FROM public.mock_exam_sessions WHERE id = p_session_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FLYDO: Không tìm thấy phiên thi của bạn.'; END IF;
  IF v_session.attempt_id IS NOT NULL OR clock_timestamp() >= v_session.deadline_at THEN
    RETURN jsonb_build_object('accepted', false, 'revision', v_session.revision, 'answers', v_session.answers,
      'attempt_id', v_session.attempt_id, 'server_now', clock_timestamp());
  END IF;
  IF p_expected_revision IS NULL OR p_expected_revision <> v_session.revision THEN
    RAISE EXCEPTION 'FLYDO_CONFLICT: Bài làm đã được cập nhật ở cửa sổ khác. Hãy tải lại để đồng bộ.';
  END IF;
  PERFORM public.flydo_exam_validate_answers(v_session.questions_snapshot, p_answers);
  UPDATE public.mock_exam_sessions SET answers = p_answers, revision = revision + 1
    WHERE id = v_session.id RETURNING * INTO v_session;
  RETURN jsonb_build_object('accepted', true, 'revision', v_session.revision, 'answers', v_session.answers,
    'attempt_id', v_session.attempt_id, 'server_now', clock_timestamp());
END $$;

CREATE OR REPLACE FUNCTION public.submit_mock_exam_session(p_session_id uuid, p_answers jsonb, p_expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_session public.mock_exam_sessions%ROWTYPE; v_now timestamptz;
  v_correct integer; v_total integer; v_attempt uuid; v_duration integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'FLYDO: Vui lòng đăng nhập để nộp bài.'; END IF;
  SELECT * INTO v_session FROM public.mock_exam_sessions WHERE id = p_session_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FLYDO: Không tìm thấy phiên thi của bạn.'; END IF;
  IF v_session.attempt_id IS NOT NULL THEN RETURN jsonb_build_object('attempt_id', v_session.attempt_id); END IF;
  v_now := clock_timestamp();
  IF v_now < v_session.deadline_at THEN
    IF p_expected_revision IS NULL OR p_expected_revision <> v_session.revision THEN
      RAISE EXCEPTION 'FLYDO_CONFLICT: Bài làm đã được cập nhật ở cửa sổ khác. Hãy tải lại để đồng bộ.';
    END IF;
    v_session.answers := public.flydo_exam_validate_answers(v_session.questions_snapshot, p_answers);
  END IF;
  -- After the server deadline only answers already received on time are graded.
  SELECT count(*), count(*) FILTER (WHERE v_session.answers->>(q->>'id') = q->>'correct_answer')
    INTO v_total, v_correct FROM jsonb_array_elements(v_session.questions_snapshot) q;
  v_duration := greatest(0, least((v_session.exam_snapshot->>'duration')::integer * 60,
    floor(extract(epoch FROM v_now - v_session.started_at))::integer));
  INSERT INTO public.mock_exam_attempts(user_id, exam_id, score, correct_count, total_questions, answers, duration_used)
    VALUES (v_session.user_id, v_session.exam_id, round(10.0 * v_correct / v_total, 2), v_correct,
      v_total, v_session.answers, v_duration) RETURNING id INTO v_attempt;
  UPDATE public.mock_exam_sessions SET answers = v_session.answers, attempt_id = v_attempt, revision = revision + 1
    WHERE id = v_session.id;
  RETURN jsonb_build_object('attempt_id', v_attempt);
END $$;

CREATE OR REPLACE FUNCTION public.get_my_mock_exam_result(p_exam_id uuid, p_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_attempt public.mock_exam_attempts%ROWTYPE; v_session public.mock_exam_sessions%ROWTYPE;
  v_exam jsonb; v_questions jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'FLYDO: Vui lòng đăng nhập để xem kết quả.'; END IF;
  SELECT * INTO v_attempt FROM public.mock_exam_attempts
    WHERE id = p_attempt_id AND exam_id = p_exam_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'FLYDO: Không tìm thấy bài làm của bạn trong đề thi này.'; END IF;
  SELECT * INTO v_session FROM public.mock_exam_sessions WHERE attempt_id = v_attempt.id AND user_id = auth.uid();
  IF FOUND THEN v_exam := v_session.exam_snapshot; v_questions := v_session.questions_snapshot;
  ELSE
    -- Historical results stay readable. They predate server-verified grading.
    SELECT to_jsonb(e) INTO v_exam FROM public.mock_exams e WHERE id = p_exam_id;
    SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.order_index, q.id), '[]'::jsonb) INTO v_questions
      FROM public.mock_exam_questions q WHERE q.exam_id = p_exam_id;
  END IF;
  RETURN jsonb_build_object('attempt', to_jsonb(v_attempt), 'exam', v_exam, 'questions', v_questions,
    'server_graded', v_session.id IS NOT NULL);
END $$;

REVOKE ALL ON FUNCTION public.start_mock_exam_session(uuid, uuid), public.save_mock_exam_answers(uuid, jsonb, integer),
  public.submit_mock_exam_session(uuid, jsonb, integer), public.get_my_mock_exam_result(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_mock_exam_session(uuid, uuid), public.save_mock_exam_answers(uuid, jsonb, integer),
  public.submit_mock_exam_session(uuid, jsonb, integer), public.get_my_mock_exam_result(uuid, uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
