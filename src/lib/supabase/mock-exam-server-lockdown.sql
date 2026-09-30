-- STEP 3: Run ONLY AFTER the web app uses server exam sessions.
-- Old browser tabs need a reload. Keep mock-exam-server-grading.sql installed.
BEGIN;
DO $$ BEGIN
  IF to_regprocedure('public.submit_mock_exam_session(uuid,jsonb,integer)') IS NULL THEN
    RAISE EXCEPTION 'Install mock-exam-server-grading.sql first';
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.flydo_is_exam_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL
    AND lower(u.email) IN ('vietdang293.vn@gmail.com', 'vietdang293@gmail.com'));
$$;
REVOKE ALL ON FUNCTION public.flydo_is_exam_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.flydo_is_exam_admin() TO authenticated;
DROP POLICY IF EXISTS "Authenticated read mock exam questions" ON public.mock_exam_questions;
DROP POLICY IF EXISTS "Admin manage mock exam questions" ON public.mock_exam_questions;
CREATE POLICY "Admin manage mock exam questions" ON public.mock_exam_questions FOR ALL TO authenticated
  USING (public.flydo_is_exam_admin()) WITH CHECK (public.flydo_is_exam_admin());
-- Restrictive guards also defeat forgotten permissive policies in older installations.
DROP POLICY IF EXISTS "Server exam answer key guard" ON public.mock_exam_questions;
CREATE POLICY "Server exam answer key guard" ON public.mock_exam_questions AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.flydo_is_exam_admin()) WITH CHECK (public.flydo_is_exam_admin());
REVOKE ALL ON public.mock_exam_questions FROM PUBLIC, anon;
DROP POLICY IF EXISTS "Users create own mock exam attempts" ON public.mock_exam_attempts;
REVOKE ALL ON public.mock_exam_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.mock_exam_attempts TO authenticated;
DROP POLICY IF EXISTS "Server exam attempt insert guard" ON public.mock_exam_attempts;
CREATE POLICY "Server exam attempt insert guard" ON public.mock_exam_attempts AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (false);
DROP POLICY IF EXISTS "Server exam attempt owner guard" ON public.mock_exam_attempts;
CREATE POLICY "Server exam attempt owner guard" ON public.mock_exam_attempts AS RESTRICTIVE FOR SELECT TO authenticated
  USING (user_id = auth.uid());
NOTIFY pgrst, 'reload schema';
COMMIT;
