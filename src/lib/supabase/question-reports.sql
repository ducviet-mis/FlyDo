-- FlyDo: Báo lỗi câu hỏi Tự luyện / Thi thử và phản hồi qua Thông báo.
-- Chạy TOÀN BỘ tệp trong Supabase > SQL Editor > New query > Run.
-- Yêu cầu các bảng Tự luyện, Thi thử và notifications.sql đã được cài đặt.
-- Không xóa / sửa dữ liệu câu hỏi, tiến độ, điểm thi hiện có. Có thể chạy lại.
BEGIN;

DO $$ BEGIN
  IF to_regclass('public.app_notifications') IS NULL
     OR to_regprocedure('public.flydo_is_notification_admin()') IS NULL THEN
    RAISE EXCEPTION 'Hãy chạy notifications.sql trước question-reports.sql';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.question_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reporter_name TEXT NOT NULL,
  reporter_email TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('practice', 'mock_exam')),
  question_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_title TEXT NOT NULL,
  grade INTEGER,
  chapter TEXT,
  question_snapshot JSONB NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('wrong_answer', 'solution', 'unclear', 'display', 'typo', 'other')),
  details TEXT NOT NULL DEFAULT '' CHECK (length(details) <= 2000),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'resolved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS question_reports_open_unique
  ON public.question_reports (reporter_id, source, question_id) WHERE status IN ('new', 'reviewing');
CREATE INDEX IF NOT EXISTS question_reports_inbox_idx ON public.question_reports (status, created_at DESC, id);
CREATE INDEX IF NOT EXISTS question_reports_reporter_idx ON public.question_reports (reporter_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.question_report_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.question_reports(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES auth.users(id),
  request_id UUID NOT NULL UNIQUE,
  body TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 1500),
  status TEXT NOT NULL CHECK (status IN ('new', 'reviewing', 'resolved', 'rejected')),
  notification_id UUID NOT NULL REFERENCES public.app_notifications(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS question_report_responses_report_idx ON public.question_report_responses (report_id, created_at);

ALTER TABLE public.question_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_report_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin read question reports" ON public.question_reports;
CREATE POLICY "Admin read question reports" ON public.question_reports FOR SELECT TO authenticated
  USING (public.flydo_is_notification_admin());
DROP POLICY IF EXISTS "Admin read report responses" ON public.question_report_responses;
CREATE POLICY "Admin read report responses" ON public.question_report_responses FOR SELECT TO authenticated
  USING (public.flydo_is_notification_admin());
-- Students never read snapshots / answers through this API. All writes use checked RPCs.
REVOKE ALL ON public.question_reports, public.question_report_responses FROM anon, authenticated;
GRANT SELECT ON public.question_reports, public.question_report_responses TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_question_report(p_source TEXT, p_question_id TEXT, p_reason TEXT, p_details TEXT DEFAULT '')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_question JSONB;
  v_context JSONB;
  v_id UUID;
  v_name TEXT;
  v_email TEXT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'FLYDO: Vui lòng đăng nhập để báo lỗi.'; END IF;
  IF p_source IS NULL OR p_source NOT IN ('practice', 'mock_exam')
     OR p_reason IS NULL OR p_reason NOT IN ('wrong_answer', 'solution', 'unclear', 'display', 'typo', 'other') THEN
    RAISE EXCEPTION 'FLYDO: Nguồn câu hỏi hoặc lý do không hợp lệ.';
  END IF;
  IF length(coalesce(p_details, '')) > 2000 OR (p_reason = 'other' AND btrim(coalesce(p_details, '')) = '') THEN
    RAISE EXCEPTION 'FLYDO: Hãy nhập mô tả hợp lệ, tối đa 2.000 ký tự.';
  END IF;
  -- Serialize submissions per account to enforce deduplication and the daily limit.
  PERFORM pg_advisory_xact_lock(hashtextextended('question-report:' || v_user::text, 0));
  SELECT id INTO v_id FROM public.question_reports WHERE reporter_id = v_user
    AND source = p_source AND question_id = p_question_id AND status IN ('new', 'reviewing');
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  IF (SELECT count(*) FROM public.question_reports WHERE reporter_id = v_user
      AND created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh') >= 20 THEN
    RAISE EXCEPTION 'FLYDO: Bạn đã gửi 20 báo lỗi hôm nay. Vui lòng thử lại ngày mai.';
  END IF;
  -- Snapshot comes from canonical database rows, never client-provided answers.
  IF p_source = 'practice' THEN
    SELECT to_jsonb(q), coalesce(to_jsonb(l), jsonb_build_object('id', q.lesson_id, 'title', q.lesson_id))
      INTO v_question, v_context
      FROM public.practice_questions q LEFT JOIN public.practice_lessons l ON l.id = q.lesson_id
      WHERE q.id = p_question_id;
  ELSE
    SELECT to_jsonb(q), to_jsonb(e) INTO v_question, v_context
      FROM public.mock_exam_questions q JOIN public.mock_exams e ON e.id = q.exam_id
      WHERE q.id::text = p_question_id;
  END IF;
  IF v_question IS NULL THEN RAISE EXCEPTION 'FLYDO: Câu hỏi không còn tồn tại. Hãy tải lại bài học.'; END IF;
  SELECT coalesce(nullif(p.name, ''), 'Học sinh'), coalesce(u.email, '') INTO v_name, v_email
    FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id WHERE u.id = v_user;
  INSERT INTO public.question_reports (reporter_id, reporter_name, reporter_email, source, question_id,
    source_id, source_title, grade, chapter, question_snapshot, reason, details)
  VALUES (v_user, v_name, v_email, p_source, p_question_id, v_context->>'id', v_context->>'title',
    (v_context->>'grade')::integer, v_context->>'chapter', v_question, p_reason, btrim(coalesce(p_details, '')))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.respond_question_report(p_report_id UUID, p_status TEXT,
  p_response TEXT, p_request_id UUID, p_expected_updated_at TIMESTAMPTZ)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_report public.question_reports%ROWTYPE;
  v_notification UUID;
  v_prior public.question_report_responses%ROWTYPE;
  v_status_label TEXT;
BEGIN
  IF NOT public.flydo_is_notification_admin() THEN RAISE EXCEPTION 'FLYDO: Chỉ ADMIN được xử lý báo lỗi.'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('new', 'reviewing', 'resolved', 'rejected') OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'FLYDO: Trạng thái không hợp lệ.';
  END IF;
  IF length(coalesce(p_response, '')) > 1500 THEN RAISE EXCEPTION 'FLYDO: Phản hồi tối đa 1.500 ký tự.'; END IF;
  IF p_status IN ('resolved', 'rejected') AND btrim(coalesce(p_response, '')) = '' THEN
    RAISE EXCEPTION 'FLYDO: Hãy viết phản hồi trước khi kết thúc báo lỗi.';
  END IF;
  SELECT * INTO v_report FROM public.question_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FLYDO: Báo lỗi không còn tồn tại.'; END IF;
  SELECT * INTO v_prior FROM public.question_report_responses WHERE request_id = p_request_id;
  IF FOUND THEN
    IF v_prior.report_id <> p_report_id OR v_prior.admin_id <> auth.uid()
       OR v_prior.body <> btrim(coalesce(p_response, '')) OR v_prior.status <> p_status THEN
      RAISE EXCEPTION 'FLYDO: Mã yêu cầu đã được sử dụng. Hãy tải lại.';
    END IF;
    RETURN v_prior.notification_id;
  END IF;
  IF p_expected_updated_at IS NULL OR v_report.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'FLYDO: Báo lỗi đã được cập nhật. Hãy làm mới trước khi xử lý.';
  END IF;
  UPDATE public.question_reports SET status = p_status, updated_at = clock_timestamp() WHERE id = p_report_id;
  IF btrim(coalesce(p_response, '')) <> '' THEN
    v_status_label := CASE p_status WHEN 'new' THEN 'Mới' WHEN 'reviewing' THEN 'Đang kiểm tra'
      WHEN 'resolved' THEN 'Đã xử lý' ELSE 'Không xác nhận lỗi' END;
    INSERT INTO public.app_notifications (title, body, target_user_id, target_email, created_by, action_url)
    VALUES ('Phản hồi báo lỗi câu hỏi',
      'Bài/đề: ' || left(v_report.source_title, 150) || E'\nMã báo lỗi: ' || left(v_report.id::text, 8)
      || E'\nTình trạng: ' || v_status_label || E'\n\nPhản hồi từ ADMIN:\n' || btrim(p_response),
      v_report.reporter_id, v_report.reporter_email, auth.uid(), NULL)
    RETURNING id INTO v_notification;
    INSERT INTO public.question_report_responses (report_id, admin_id, request_id, body, status, notification_id)
      VALUES (p_report_id, auth.uid(), p_request_id, btrim(p_response), p_status, v_notification);
  END IF;
  -- Notification, response history and status commit together, or all roll back.
  RETURN v_notification;
END $$;

REVOKE ALL ON FUNCTION public.submit_question_report(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_question_report(UUID, TEXT, TEXT, UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_question_report(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_question_report(UUID, TEXT, TEXT, UUID, TIMESTAMPTZ) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
