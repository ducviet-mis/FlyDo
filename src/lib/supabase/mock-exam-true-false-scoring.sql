-- FlyDo: SQL FIRST, then deploy the web version and reload old tabs.
-- Run this WHOLE file after grading, lockdown, JSON import and short-answer SQL.
-- Rerunnable/additive. Never rerun older RPC migrations after this file.
-- No historical attempt/session rewrite. All allocations use integer 1e-4 units.
BEGIN;
DO $$ BEGIN
  IF to_regclass('public.mock_exam_sessions') IS NULL
    OR to_regprocedure('public.flydo_is_exam_admin()') IS NULL
    OR to_regprocedure('public.flydo_exam_normalize_short_answer(text)') IS NULL
    OR to_regprocedure('public.import_questions_json(text,text,uuid,smallint,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'FLYDO: Cần cài grading, lockdown, nhập JSON và trả lời ngắn trước.';
  END IF;
END $$;

-- Keep the database default legacy during SQL-first rollout: the old web omits
-- scoring columns. The new web explicitly creates sectioned drafts.
ALTER TABLE public.mock_exams ADD COLUMN IF NOT EXISTS scoring_mode text NOT NULL DEFAULT 'legacy_equal';
ALTER TABLE public.mock_exams ADD COLUMN IF NOT EXISTS section_points jsonb NOT NULL DEFAULT '{"multiple_choice":10,"true_false":0,"short_answer":0}';
ALTER TABLE public.mock_exams ADD COLUMN IF NOT EXISTS scoring_ready boolean NOT NULL DEFAULT false;
ALTER TABLE public.mock_exams ADD COLUMN IF NOT EXISTS scoring_revision integer NOT NULL DEFAULT 0;
ALTER TABLE public.mock_exams ALTER COLUMN scoring_mode SET DEFAULT 'legacy_equal';
ALTER TABLE public.mock_exam_questions ADD COLUMN IF NOT EXISTS statements jsonb NOT NULL DEFAULT '[]';
ALTER TABLE public.mock_exam_questions ADD COLUMN IF NOT EXISTS points_override numeric;
ALTER TABLE public.mock_exam_questions ADD COLUMN IF NOT EXISTS max_points numeric;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.mock_exams'::regclass AND conname='mock_exams_scoring_mode_check') THEN
    ALTER TABLE public.mock_exams ADD CONSTRAINT mock_exams_scoring_mode_check CHECK(scoring_mode IN ('legacy_equal','sectioned') AND scoring_revision>=0);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.flydo_exam_require_admin()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.flydo_is_exam_admin() THEN RAISE EXCEPTION 'FLYDO: Chỉ ADMIN đã xác nhận email có quyền quản lý phân điểm.'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.flydo_exam_point_valid(p_value jsonb,p_zero boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE v numeric;
BEGIN
  IF jsonb_typeof(p_value) IS DISTINCT FROM 'number' THEN RETURN false; END IF;
  v:=(p_value #>> '{}')::numeric;
  RETURN v>=CASE WHEN p_zero THEN 0 ELSE 0.0001 END AND v<=10 AND v*10000=trunc(v*10000);
END $$;

CREATE OR REPLACE FUNCTION public.flydo_exam_question_valid(p_q jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE v_type text; v_opts jsonb; v_key jsonb; v_answer jsonb; v_norm text; v_statement jsonb;
BEGIN
  IF p_q IS NULL OR jsonb_typeof(p_q)<>'object' OR jsonb_typeof(p_q->'content') IS DISTINCT FROM 'string'
    OR btrim(p_q->>'content')='' THEN RETURN false; END IF;
  v_type:=CASE WHEN p_q ? 'question_type' THEN p_q->>'question_type' ELSE 'multiple_choice' END;
  IF v_type IS NULL OR v_type NOT IN ('multiple_choice','short_answer','true_false') THEN RETURN false; END IF;
  IF p_q ? 'points' AND NOT public.flydo_exam_point_valid(p_q->'points') THEN RETURN false; END IF;
  IF v_type='true_false' THEN
    FOREACH v_norm IN ARRAY ARRAY['options','answers','accepted_answers'] LOOP
      IF p_q ? v_norm AND p_q->v_norm IS DISTINCT FROM '[]'::jsonb THEN RETURN false; END IF;
    END LOOP;
    FOREACH v_norm IN ARRAY ARRAY['correct_answer','correctAnswer','answer'] LOOP
      IF p_q ? v_norm AND p_q->v_norm IS DISTINCT FROM 'null'::jsonb THEN RETURN false; END IF;
    END LOOP;
    IF jsonb_typeof(p_q->'statements') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
    IF jsonb_array_length(p_q->'statements')<>4 THEN RETURN false; END IF;
    FOR v_statement IN SELECT value FROM jsonb_array_elements(p_q->'statements') LOOP
      IF jsonb_typeof(v_statement)<>'object' OR jsonb_typeof(v_statement->'content') IS DISTINCT FROM 'string'
        OR btrim(v_statement->>'content')='' OR jsonb_typeof(v_statement->'correct_answer') IS DISTINCT FROM 'boolean'
        OR (v_statement ? 'solution' AND jsonb_typeof(v_statement->'solution') IS DISTINCT FROM 'string') THEN RETURN false; END IF;
    END LOOP;
  ELSE
    IF p_q ? 'statements' AND p_q->'statements' IS DISTINCT FROM '[]'::jsonb THEN RETURN false; END IF;
    IF v_type='short_answer' THEN
      FOREACH v_norm IN ARRAY ARRAY['options','answers'] LOOP
        IF p_q ? v_norm AND p_q->v_norm IS DISTINCT FROM '[]'::jsonb THEN RETURN false; END IF;
      END LOOP;
      FOREACH v_norm IN ARRAY ARRAY['correct_answer','correctAnswer','answer'] LOOP
        IF p_q ? v_norm AND p_q->v_norm IS DISTINCT FROM 'null'::jsonb THEN RETURN false; END IF;
      END LOOP;
      v_key:=p_q->'accepted_answers';
      IF jsonb_typeof(v_key) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
      IF jsonb_array_length(v_key) NOT BETWEEN 1 AND 20 THEN RETURN false; END IF;
      FOR v_answer IN SELECT value FROM jsonb_array_elements(v_key) LOOP
        IF jsonb_typeof(v_answer)<>'string' OR char_length(v_answer #>> '{}')>200 THEN RETURN false; END IF;
        v_norm:=public.flydo_exam_normalize_short_answer(v_answer #>> '{}');
        IF char_length(v_norm) NOT BETWEEN 1 AND 100 THEN RETURN false; END IF;
      END LOOP;
    ELSE
      v_opts:=p_q->'options';
      IF jsonb_typeof(v_opts) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
      IF jsonb_array_length(v_opts) NOT BETWEEN 2 AND 4 THEN RETURN false; END IF;
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_opts) v WHERE jsonb_typeof(v)<>'string' OR btrim(v #>> '{}')='') THEN RETURN false; END IF;
      IF p_q ? 'accepted_answers' AND p_q->'accepted_answers' IS DISTINCT FROM '[]'::jsonb THEN RETURN false; END IF;
      IF jsonb_typeof(p_q->'correct_answer') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
      IF (p_q->>'correct_answer') !~ '^[0-3]$' THEN RETURN false; END IF;
      IF (p_q->>'correct_answer')::integer>=jsonb_array_length(v_opts) THEN RETURN false; END IF;
    END IF;
  END IF;
  RETURN true;
END $$;
ALTER TABLE public.mock_exam_questions DROP CONSTRAINT IF EXISTS mock_exam_questions_type_answer_check;
ALTER TABLE public.mock_exam_questions ADD CONSTRAINT mock_exam_questions_type_answer_check CHECK (
  (question_type='multiple_choice' AND correct_answer IS NOT NULL AND accepted_answers='[]'::jsonb AND statements='[]'::jsonb)
  OR (question_type='short_answer' AND correct_answer IS NULL AND options='[]'::jsonb AND statements='[]'::jsonb
    AND jsonb_typeof(accepted_answers)='array' AND jsonb_array_length(accepted_answers) BETWEEN 1 AND 20)
  OR (question_type='true_false' AND correct_answer IS NULL AND options='[]'::jsonb AND accepted_answers='[]'::jsonb
    AND jsonb_typeof(statements)='array' AND jsonb_array_length(statements)=4)
);

-- Guards are SECURITY INVOKER deliberately: current_user distinguishes an owner
-- RPC from a direct REST write. No caller-settable GUC can bypass this boundary.
CREATE OR REPLACE FUNCTION public.flydo_exam_guard_scoring_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_value jsonb; v_points numeric;
BEGIN
  IF current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid=TG_RELID)) THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF NOT public.flydo_is_exam_admin() THEN RAISE EXCEPTION 'FLYDO: Chỉ ADMIN có quyền sửa đề.'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.scoring_ready OR NEW.scoring_revision<>0 THEN
      RAISE EXCEPTION 'FLYDO: Hãy dùng RPC phân điểm để cấu hình hoặc đưa đề vào sử dụng.';
    END IF;
    IF NEW.scoring_mode='legacy_equal'
      AND NEW.section_points IS DISTINCT FROM '{"multiple_choice":10,"true_false":0,"short_answer":0}'::jsonb THEN
      RAISE EXCEPTION 'FLYDO: Hãy dùng RPC chuyển sang phân điểm trước khi đặt tổng điểm riêng.';
    END IF;
    -- Custom totals are allowed at creation. Validate inline because this guard
    -- intentionally runs as caller and allocation helpers have no client grants.
    IF jsonb_typeof(NEW.section_points) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'FLYDO: Tổng điểm phần không hợp lệ.'; END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(NEW.section_points))<>3
      OR NOT NEW.section_points ?& ARRAY['multiple_choice','true_false','short_answer'] THEN
      RAISE EXCEPTION 'FLYDO: Tổng điểm cần đúng ba phần.';
    END IF;
    FOR v_value IN SELECT value FROM jsonb_each(NEW.section_points) LOOP
      IF jsonb_typeof(v_value) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'FLYDO: Tổng điểm phần không hợp lệ.'; END IF;
      v_points:=(v_value #>> '{}')::numeric;
      IF v_points<0 OR v_points>10 OR v_points*10000<>trunc(v_points*10000) THEN RAISE EXCEPTION 'FLYDO: Tổng điểm phần không hợp lệ.'; END IF;
    END LOOP;
  ELSIF TG_OP='UPDATE' THEN
    IF (NEW.scoring_mode,NEW.section_points,NEW.scoring_ready,NEW.scoring_revision)
      IS DISTINCT FROM (OLD.scoring_mode,OLD.section_points,OLD.scoring_ready,OLD.scoring_revision) THEN
      RAISE EXCEPTION 'FLYDO: Hãy dùng RPC phân điểm để sửa cấu hình hoặc đưa đề vào sử dụng.';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
DROP TRIGGER IF EXISTS flydo_exam_guard_scoring_write ON public.mock_exams;
CREATE TRIGGER flydo_exam_guard_scoring_write BEFORE INSERT OR UPDATE OR DELETE ON public.mock_exams
  FOR EACH ROW EXECUTE FUNCTION public.flydo_exam_guard_scoring_write();

CREATE OR REPLACE FUNCTION public.flydo_exam_guard_question_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_exam uuid; v_mode text;
BEGIN
  IF current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid=TG_RELID)) THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF NOT public.flydo_is_exam_admin() THEN RAISE EXCEPTION 'FLYDO: Chỉ ADMIN có quyền sửa câu hỏi.'; END IF;
  IF TG_OP='UPDATE' AND NEW.exam_id IS DISTINCT FROM OLD.exam_id THEN RAISE EXCEPTION 'FLYDO: Không được chuyển câu giữa các đề.'; END IF;
  v_exam:=CASE WHEN TG_OP='DELETE' THEN OLD.exam_id ELSE NEW.exam_id END;
  SELECT scoring_mode INTO v_mode FROM public.mock_exams WHERE id=v_exam FOR UPDATE;
  -- Deleting an entire exam may cascade after its parent row has disappeared.
  IF TG_OP='DELETE' AND NOT FOUND THEN RETURN OLD; END IF;
  IF v_mode='sectioned' THEN RAISE EXCEPTION 'FLYDO: Câu hỏi theo phần phải sửa qua RPC phân điểm có revision.'; END IF;
  IF TG_OP<>'DELETE' AND (NEW.question_type='true_false' OR NEW.points_override IS NOT NULL OR NEW.max_points IS NOT NULL) THEN
    RAISE EXCEPTION 'FLYDO: Hãy chuyển đề sang phân điểm qua RPC trước.';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
DROP TRIGGER IF EXISTS flydo_exam_guard_question_write ON public.mock_exam_questions;
CREATE TRIGGER flydo_exam_guard_question_write BEFORE INSERT OR UPDATE OR DELETE ON public.mock_exam_questions
  FOR EACH ROW EXECUTE FUNCTION public.flydo_exam_guard_question_write();

-- Legacy direct editing is still supported and invalidates stale previews.
CREATE OR REPLACE FUNCTION public.flydo_exam_legacy_question_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.mock_exams SET scoring_revision=scoring_revision+1
    WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.exam_id ELSE NEW.exam_id END AND scoring_mode='legacy_equal';
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS flydo_exam_legacy_question_revision ON public.mock_exam_questions;
CREATE TRIGGER flydo_exam_legacy_question_revision AFTER INSERT OR UPDATE OR DELETE ON public.mock_exam_questions
  FOR EACH ROW EXECUTE FUNCTION public.flydo_exam_legacy_question_revision();

DROP POLICY IF EXISTS "Admin manage mock exams" ON public.mock_exams;
CREATE POLICY "Admin manage mock exams" ON public.mock_exams FOR ALL TO authenticated
  USING(public.flydo_is_exam_admin()) WITH CHECK(public.flydo_is_exam_admin());
DROP POLICY IF EXISTS "Sectioned catalog visibility" ON public.mock_exams;
CREATE POLICY "Sectioned catalog visibility" ON public.mock_exams AS RESTRICTIVE FOR SELECT TO authenticated
  USING(scoring_mode='legacy_equal' OR scoring_ready OR public.flydo_is_exam_admin());
DROP POLICY IF EXISTS "Anonymous sectioned catalog visibility" ON public.mock_exams;
CREATE POLICY "Anonymous sectioned catalog visibility" ON public.mock_exams AS RESTRICTIVE FOR SELECT TO anon
  USING(scoring_mode='legacy_equal' OR scoring_ready);
-- Restore private-table boundaries even if an installation granted tables broadly.
REVOKE ALL ON public.mock_exam_sessions FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.mock_exam_questions FROM PUBLIC,anon;
REVOKE ALL ON public.mock_exam_attempts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.mock_exam_attempts TO authenticated;

CREATE OR REPLACE FUNCTION public.flydo_exam_allocate(p_sections jsonb,p_questions jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE v_type text; v_budget bigint; v_fixed bigint; v_auto integer; v_count integer; v_remaining bigint;
  v_rank integer; v_q jsonb; v_result jsonb:='[]'; v_errors jsonb:='[]'; v_total bigint:=0; v_alloc jsonb:='{}'; v_units bigint;
BEGIN
  IF jsonb_typeof(p_sections) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'FLYDO: Tổng điểm phần không hợp lệ.'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_sections))<>3
    OR NOT p_sections ?& ARRAY['multiple_choice','true_false','short_answer'] THEN RAISE EXCEPTION 'FLYDO: Tổng điểm cần đúng ba phần.'; END IF;
  IF jsonb_typeof(p_questions) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'FLYDO: Danh sách câu không hợp lệ.'; END IF;
  IF jsonb_array_length(p_questions)>1000 THEN RAISE EXCEPTION 'FLYDO: Đề tối đa 1000 câu.'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_questions) q WHERE NOT public.flydo_exam_question_valid(q)) THEN
    RAISE EXCEPTION 'FLYDO: Câu hỏi hoặc đáp án không hợp lệ.';
  END IF;
  FOREACH v_type IN ARRAY ARRAY['multiple_choice','true_false','short_answer'] LOOP
    IF NOT public.flydo_exam_point_valid(p_sections->v_type,true) THEN RAISE EXCEPTION 'FLYDO: Tổng điểm phần không hợp lệ (0–10, tối đa bốn số lẻ).'; END IF;
    v_budget:=((p_sections->>v_type)::numeric*10000)::bigint; v_total:=v_total+v_budget;
    SELECT count(*),count(*) FILTER(WHERE q->>'points_override' IS NULL),
      coalesce(sum((q->>'points_override')::numeric*10000),0)::bigint
      INTO v_count,v_auto,v_fixed FROM jsonb_array_elements(p_questions) q WHERE coalesce(q->>'question_type','multiple_choice')=v_type;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_questions) q WHERE coalesce(q->>'question_type','multiple_choice')=v_type
      AND q->>'points_override' IS NOT NULL AND NOT public.flydo_exam_point_valid(q->'points_override')) THEN
      RAISE EXCEPTION 'FLYDO: Điểm cố định không hợp lệ.';
    END IF;
    IF v_count=0 THEN
      IF v_budget>0 THEN v_errors:=v_errors||jsonb_build_array('Phần '||v_type||' có điểm nhưng chưa có câu.'); END IF;
      CONTINUE;
    END IF;
    v_remaining:=v_budget-v_fixed;
    IF v_remaining<0 OR (v_auto=0 AND v_remaining<>0) OR (v_auto>0 AND v_remaining<v_auto) THEN
      RAISE EXCEPTION 'FLYDO: Điểm cố định/phần còn lại của % không đủ phân điểm dương cho mọi câu.',v_type;
    END IF;
    v_rank:=0;
    FOR v_q IN SELECT q FROM jsonb_array_elements(p_questions) q
      WHERE coalesce(q->>'question_type','multiple_choice')=v_type ORDER BY (q->>'order_index')::integer,q->>'id' LOOP
      IF v_q->>'points_override' IS NOT NULL THEN v_units:=((v_q->>'points_override')::numeric*10000)::bigint;
      ELSE
        v_rank:=v_rank+1; v_units:=v_remaining/v_auto+CASE WHEN v_rank<=v_remaining%v_auto THEN 1 ELSE 0 END;
      END IF;
      v_alloc:=v_alloc||jsonb_build_object(v_q->>'id',v_units::numeric/10000);
    END LOOP;
  END LOOP;
  IF v_total<>100000 THEN v_errors:=v_errors||jsonb_build_array('Tổng ba phần phải bằng 10 điểm.'); END IF;
  IF jsonb_array_length(p_questions)=0 THEN v_errors:=v_errors||jsonb_build_array('Đề chưa có câu hỏi.'); END IF;
  SELECT coalesce(jsonb_agg(q||jsonb_build_object('max_points',v_alloc->(q->>'id'))
    ORDER BY (q->>'order_index')::integer,q->>'id'),'[]'::jsonb) INTO v_result FROM jsonb_array_elements(p_questions) q;
  RETURN jsonb_build_object('questions',v_result,'errors',v_errors);
END $$;

CREATE OR REPLACE FUNCTION public.flydo_exam_admin_state(p_exam_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE v_exam jsonb; v_q jsonb; v_a jsonb;
BEGIN
  SELECT to_jsonb(e) INTO v_exam FROM public.mock_exams e WHERE id=p_exam_id;
  IF v_exam IS NULL THEN RAISE EXCEPTION 'FLYDO: Không tìm thấy đề thi.'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.order_index,q.id),'[]') INTO v_q FROM public.mock_exam_questions q WHERE exam_id=p_exam_id;
  IF v_exam->>'scoring_mode'='sectioned' THEN v_a:=public.flydo_exam_allocate(v_exam->'section_points',v_q);
  ELSE v_a:=jsonb_build_object('questions',v_q,'errors','[]'::jsonb); END IF;
  RETURN v_a||jsonb_build_object('exam',v_exam,'revision',(v_exam->>'scoring_revision')::integer);
END $$;

CREATE OR REPLACE FUNCTION public.flydo_exam_lock_revision(p_exam_id uuid,p_expected_revision integer)
RETURNS public.mock_exams LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_exam public.mock_exams%ROWTYPE;
BEGIN
  SELECT * INTO v_exam FROM public.mock_exams WHERE id=p_exam_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FLYDO: Không tìm thấy đề thi.'; END IF;
  IF p_expected_revision IS NULL OR p_expected_revision<>v_exam.scoring_revision THEN
    RAISE EXCEPTION 'FLYDO_CONFLICT: Đề đã được cập nhật. Hãy tải lại trước khi sửa hoặc nhập.';
  END IF;
  RETURN v_exam;
END $$;

CREATE OR REPLACE FUNCTION public.flydo_exam_import_candidates(p_exam public.mock_exams,p_questions jsonb,p_preview boolean)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_q jsonb; v_old jsonb; v_new jsonb:='[]'; v_type text; v_id text; v_order integer; v_n integer:=0; v_answers jsonb; v_s jsonb;
BEGIN
  IF jsonb_typeof(p_questions) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'FLYDO: Danh sách câu hỏi không hợp lệ.'; END IF;
  IF jsonb_array_length(p_questions) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'FLYDO: Mỗi lượt nhập 1–100 câu.'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.order_index,q.id),'[]'),coalesce(max(order_index),-1)+1
    INTO v_old,v_order FROM public.mock_exam_questions q WHERE exam_id=p_exam.id;
  IF jsonb_array_length(v_old)+jsonb_array_length(p_questions)>1000 THEN RAISE EXCEPTION 'FLYDO: Đề tối đa 1000 câu.'; END IF;
  FOR v_q IN SELECT value FROM jsonb_array_elements(p_questions) LOOP
    v_n:=v_n+1;
    IF NOT public.flydo_exam_question_valid(v_q) THEN RAISE EXCEPTION 'FLYDO: Câu %: nội dung, đáp án hoặc điểm không hợp lệ.',v_n; END IF;
    v_type:=coalesce(v_q->>'question_type','multiple_choice');
    IF p_exam.scoring_mode='legacy_equal' AND (v_type='true_false' OR v_q ? 'points') THEN
      RAISE EXCEPTION 'FLYDO: Hãy chuyển đề sang phân điểm theo phần trước khi nhập đúng/sai hoặc points.';
    END IF;
    IF v_type='multiple_choice' AND jsonb_array_length(v_q->'options')<>4 THEN RAISE EXCEPTION 'FLYDO: Câu % cần đúng 4 phương án.',v_n; END IF;
    v_id:=CASE WHEN p_preview THEN coalesce(v_q->>'id','preview-'||v_n) ELSE gen_random_uuid()::text END;
    IF p_preview AND v_id !~ '^(preview-[0-9]+|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$' THEN
      RAISE EXCEPTION 'FLYDO: ID câu xem trước không hợp lệ.';
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_old||v_new) q WHERE q->>'id'=v_id) THEN RAISE EXCEPTION 'FLYDO: ID câu bị trùng.'; END IF;
    v_answers:='[]'; v_s:='[]';
    IF v_type='short_answer' THEN
      SELECT jsonb_agg(answer ORDER BY ord) INTO v_answers FROM (
        SELECT DISTINCT ON(public.flydo_exam_normalize_short_answer(answer #>> '{}')) answer,ord
        FROM jsonb_array_elements(v_q->'accepted_answers') WITH ORDINALITY AS x(answer,ord)
        ORDER BY public.flydo_exam_normalize_short_answer(answer #>> '{}'),ord) dedup;
    ELSIF v_type='true_false' THEN
      SELECT jsonb_agg(jsonb_build_object('content',btrim(s->>'content'),'correct_answer',s->'correct_answer')
        ||CASE WHEN s ? 'solution' THEN jsonb_build_object('solution',s->'solution') ELSE '{}'::jsonb END ORDER BY ord)
        INTO v_s FROM jsonb_array_elements(v_q->'statements') WITH ORDINALITY AS items(s,ord);
    END IF;
    v_new:=v_new||jsonb_build_array(jsonb_build_object('id',v_id,'exam_id',p_exam.id,'content',btrim(v_q->>'content'),
      'question_type',v_type,'options',CASE WHEN v_type='multiple_choice' THEN v_q->'options' ELSE '[]'::jsonb END,
      'correct_answer',CASE WHEN v_type='multiple_choice' THEN v_q->'correct_answer' ELSE 'null'::jsonb END,
      'accepted_answers',v_answers,'statements',v_s,'solution',coalesce(v_q->>'solution',''),
      'diagram',nullif(v_q->'diagram','null'::jsonb),'order_index',v_order,'points_override',v_q->'points','max_points',NULL));
    v_order:=v_order+1;
  END LOOP;
  RETURN v_old||v_new;
END $$;

CREATE OR REPLACE FUNCTION public.flydo_exam_apply_allocation(p_exam_id uuid,p_allocation jsonb,p_publish boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF p_publish AND jsonb_array_length(p_allocation->'errors')<>0 THEN RAISE EXCEPTION 'FLYDO: Đề chưa sẵn sàng; tổng phải bằng 10 và các phần phải có câu hợp lệ.'; END IF;
  UPDATE public.mock_exam_questions q SET max_points=(x->>'max_points')::numeric,points_override=(x->>'points_override')::numeric
    FROM jsonb_array_elements(p_allocation->'questions') x WHERE q.exam_id=p_exam_id AND q.id::text=x->>'id';
  UPDATE public.mock_exams SET scoring_ready=(scoring_ready OR p_publish) AND jsonb_array_length(p_allocation->'errors')=0,
    scoring_revision=scoring_revision+1 WHERE id=p_exam_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_get_mock_exam_scoring(p_exam_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.flydo_exam_require_admin();
  -- A lock keeps exam/configuration and all question rows in one consistent view.
  PERFORM 1 FROM public.mock_exams WHERE id=p_exam_id FOR UPDATE;
  RETURN public.flydo_exam_admin_state(p_exam_id);
END $$;

CREATE OR REPLACE FUNCTION public.admin_preview_mock_exam_import(p_exam_id uuid,p_questions jsonb,p_expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_exam public.mock_exams%ROWTYPE; v_q jsonb; v_a jsonb;
BEGIN
  PERFORM public.flydo_exam_require_admin(); v_exam:=public.flydo_exam_lock_revision(p_exam_id,p_expected_revision);
  v_q:=public.flydo_exam_import_candidates(v_exam,p_questions,true);
  IF v_exam.scoring_mode='sectioned' THEN v_a:=public.flydo_exam_allocate(v_exam.section_points,v_q);
  ELSE v_a:=jsonb_build_object('questions',v_q,'errors','[]'::jsonb); END IF;
  RETURN v_a||jsonb_build_object('exam',to_jsonb(v_exam),'revision',v_exam.scoring_revision,'count',jsonb_array_length(p_questions));
END $$;

CREATE OR REPLACE FUNCTION public.admin_save_mock_exam_scoring(p_exam_id uuid,p_section_points jsonb,p_overrides jsonb,p_expected_revision integer,p_publish boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_exam public.mock_exams%ROWTYPE; v_q jsonb; v_a jsonb; v_id text; v_value jsonb;
BEGIN
  PERFORM public.flydo_exam_require_admin(); v_exam:=public.flydo_exam_lock_revision(p_exam_id,p_expected_revision);
  IF p_publish IS NULL OR jsonb_typeof(p_overrides) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'FLYDO: Điểm cố định không hợp lệ.'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.order_index,q.id),'[]') INTO v_q FROM public.mock_exam_questions q WHERE exam_id=p_exam_id;
  FOR v_id,v_value IN SELECT * FROM jsonb_each(p_overrides) LOOP
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_q) q WHERE q->>'id'=v_id) THEN RAISE EXCEPTION 'FLYDO: ID câu không thuộc đề.'; END IF;
    IF v_value<>'null'::jsonb AND NOT public.flydo_exam_point_valid(v_value) THEN RAISE EXCEPTION 'FLYDO: Điểm cố định không hợp lệ.'; END IF;
  END LOOP;
  SELECT coalesce(jsonb_agg(CASE WHEN p_overrides ? (q->>'id') THEN q||jsonb_build_object('points_override',p_overrides->(q->>'id')) ELSE q END),'[]')
    INTO v_q FROM jsonb_array_elements(v_q) q;
  v_a:=public.flydo_exam_allocate(p_section_points,v_q);
  -- This RPC is the explicit, revision-checked conversion from legacy to sectioned.
  UPDATE public.mock_exams SET scoring_mode='sectioned',section_points=p_section_points WHERE id=p_exam_id;
  PERFORM public.flydo_exam_apply_allocation(p_exam_id,v_a,p_publish);
  RETURN public.flydo_exam_admin_state(p_exam_id);
END $$;

CREATE OR REPLACE FUNCTION public.admin_delete_mock_exam_question(p_exam_id uuid,p_question_id uuid,p_expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_exam public.mock_exams%ROWTYPE; v_q jsonb; v_a jsonb;
BEGIN
  PERFORM public.flydo_exam_require_admin(); v_exam:=public.flydo_exam_lock_revision(p_exam_id,p_expected_revision);
  PERFORM 1 FROM public.mock_exam_questions WHERE id=p_question_id AND exam_id=p_exam_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FLYDO: ID câu không thuộc đề.'; END IF;
  IF v_exam.scoring_mode='sectioned' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.order_index,q.id),'[]') INTO v_q FROM public.mock_exam_questions q WHERE exam_id=p_exam_id AND id<>p_question_id;
    v_a:=public.flydo_exam_allocate(v_exam.section_points,v_q);
  END IF;
  DELETE FROM public.mock_exam_questions WHERE exam_id=p_exam_id AND id=p_question_id;
  IF v_exam.scoring_mode='sectioned' THEN PERFORM public.flydo_exam_apply_allocation(p_exam_id,v_a); END IF;
  RETURN public.flydo_exam_admin_state(p_exam_id);
END $$;

CREATE OR REPLACE FUNCTION public.admin_import_mock_exam_questions(p_exam_id uuid,p_questions jsonb,p_expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_exam public.mock_exams%ROWTYPE; v_q jsonb; v_a jsonb;
BEGIN
  PERFORM public.flydo_exam_require_admin(); v_exam:=public.flydo_exam_lock_revision(p_exam_id,p_expected_revision);
  v_q:=public.flydo_exam_import_candidates(v_exam,p_questions,false);
  IF v_exam.scoring_mode='sectioned' THEN v_a:=public.flydo_exam_allocate(v_exam.section_points,v_q); ELSE v_a:=jsonb_build_object('questions',v_q); END IF;
  INSERT INTO public.mock_exam_questions(id,exam_id,content,question_type,options,correct_answer,accepted_answers,statements,solution,diagram,order_index,points_override,max_points)
    SELECT (q->>'id')::uuid,p_exam_id,q->>'content',q->>'question_type',q->'options',(q->>'correct_answer')::integer,
      q->'accepted_answers',q->'statements',q->>'solution',nullif(q->'diagram','null'::jsonb),(q->>'order_index')::integer,
      (q->>'points_override')::numeric,(q->>'max_points')::numeric FROM jsonb_array_elements(v_a->'questions') q
      WHERE NOT EXISTS(SELECT 1 FROM public.mock_exam_questions old WHERE old.id::text=q->>'id');
  IF v_exam.scoring_mode='sectioned' THEN PERFORM public.flydo_exam_apply_allocation(p_exam_id,v_a); END IF;
  RETURN public.flydo_exam_admin_state(p_exam_id)||jsonb_build_object('count',jsonb_array_length(p_questions));
END $$;

-- Preserve the old practice/legacy importer privately; reruns must not rename the wrapper.
DO $$ BEGIN
  IF to_regprocedure('public.flydo_exam_legacy_import(text,text,uuid,smallint,jsonb)') IS NULL THEN
    ALTER FUNCTION public.import_questions_json(text,text,uuid,smallint,jsonb) RENAME TO flydo_exam_legacy_import;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.import_questions_json(p_target text,p_lesson_id text DEFAULT NULL,p_exam_id uuid DEFAULT NULL,p_level smallint DEFAULT NULL,p_questions jsonb DEFAULT '[]'::jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_q jsonb; v_mode text;
BEGIN
  PERFORM public.flydo_exam_require_admin();
  IF jsonb_typeof(p_questions) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'FLYDO: Danh sách câu không hợp lệ.'; END IF;
  IF p_target='mock_exam' THEN
    SELECT scoring_mode INTO v_mode FROM public.mock_exams WHERE id=p_exam_id FOR UPDATE;
    IF v_mode='sectioned' THEN RAISE EXCEPTION 'FLYDO: Hãy dùng RPC phân điểm có revision để nhập đề theo phần.'; END IF;
  END IF;
  FOR v_q IN SELECT value FROM jsonb_array_elements(p_questions) LOOP
    IF p_target='practice' AND coalesce(v_q->>'question_type','multiple_choice')<>'multiple_choice' THEN
      RAISE EXCEPTION 'FLYDO: Đúng/sai và trả lời ngắn chỉ dùng trong Thi thử.';
    END IF;
    IF coalesce(v_q->>'question_type','multiple_choice')='true_false' OR v_q ? 'points' THEN
      RAISE EXCEPTION 'FLYDO: Hãy chuyển đề sang phân điểm theo phần trước.';
    END IF;
  END LOOP;
  RETURN public.flydo_exam_legacy_import(p_target,p_lesson_id,p_exam_id,p_level,p_questions);
END $$;

CREATE OR REPLACE FUNCTION public.flydo_exam_correct_statement_count(p_q jsonb,p_answer jsonb)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT count(*)::integer FROM jsonb_array_elements(coalesce(p_q->'statements','[]')) WITH ORDINALITY AS items(s,ord)
    WHERE jsonb_typeof(p_answer->(ord::integer-1))='boolean' AND p_answer->(ord::integer-1)=s->'correct_answer';
$$;

CREATE OR REPLACE FUNCTION public.flydo_exam_answer_correct(p_q jsonb,p_answer jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE v_text text;
BEGIN
  IF coalesce(p_q->>'question_type','multiple_choice')='true_false' THEN
    RETURN public.flydo_exam_correct_statement_count(p_q,p_answer)=4;
  ELSIF coalesce(p_q->>'question_type','multiple_choice')='short_answer' THEN
    IF jsonb_typeof(p_answer) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
    v_text:=public.flydo_exam_normalize_short_answer(p_answer #>> '{}');
    IF v_text='' OR char_length(p_answer #>> '{}')>100 THEN RETURN false; END IF;
    RETURN EXISTS(SELECT 1 FROM jsonb_array_elements(p_q->'accepted_answers') a WHERE public.flydo_exam_normalize_short_answer(a #>> '{}')=v_text);
  END IF;
  RETURN coalesce(jsonb_typeof(p_answer)='number' AND p_answer=p_q->'correct_answer',false);
END $$;

CREATE OR REPLACE FUNCTION public.flydo_exam_earned_points(p_q jsonb,p_answer jsonb)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT (p_q->>'max_points')::numeric * CASE WHEN p_q->>'question_type'='true_false' THEN
    (ARRAY[0::numeric,0.10,0.25,0.50,1])[public.flydo_exam_correct_statement_count(p_q,p_answer)+1]
    WHEN public.flydo_exam_answer_correct(p_q,p_answer) THEN 1 ELSE 0 END;
$$;

CREATE OR REPLACE FUNCTION public.flydo_exam_validate_answers(p_questions jsonb,p_answers jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE v_key text; v_value jsonb; v_q jsonb; v_by_id jsonb; v_result jsonb:='{}'; v_text text;
BEGIN
  IF p_answers IS NULL OR jsonb_typeof(p_answers)<>'object' OR pg_column_size(p_answers)>65536 THEN RAISE EXCEPTION 'FLYDO: Đáp án gửi lên không hợp lệ.'; END IF;
  SELECT jsonb_object_agg(q->>'id',q) INTO v_by_id FROM jsonb_array_elements(p_questions) q;
  FOR v_key,v_value IN SELECT * FROM jsonb_each(p_answers) LOOP
    v_q:=v_by_id->v_key;
    IF v_q IS NULL THEN RAISE EXCEPTION 'FLYDO: Đáp án gửi lên không hợp lệ.'; END IF;
    IF coalesce(v_q->>'question_type','multiple_choice')='true_false' THEN
      IF jsonb_typeof(v_value)<>'array' THEN RAISE EXCEPTION 'FLYDO: Đáp án gửi lên không hợp lệ.'; END IF;
      IF jsonb_array_length(v_value)<>4 OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_value) a WHERE jsonb_typeof(a) NOT IN ('boolean','null')) THEN
        RAISE EXCEPTION 'FLYDO: Đáp án gửi lên không hợp lệ.';
      END IF;
      IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_value) a WHERE jsonb_typeof(a)='boolean') THEN CONTINUE; END IF;
    ELSIF coalesce(v_q->>'question_type','multiple_choice')='short_answer' THEN
      IF jsonb_typeof(v_value)<>'string' THEN RAISE EXCEPTION 'FLYDO: Đáp án gửi lên không hợp lệ.'; END IF;
      v_text:=v_value #>> '{}';
      IF char_length(v_text)>100 THEN RAISE EXCEPTION 'FLYDO: Đáp án gửi lên không hợp lệ.'; END IF;
      IF public.flydo_exam_normalize_short_answer(v_text)='' THEN CONTINUE; END IF;
    ELSE
      IF jsonb_typeof(v_value)<>'number' OR v_value::text !~ '^[0-3]$' THEN RAISE EXCEPTION 'FLYDO: Đáp án gửi lên không hợp lệ.'; END IF;
      IF v_value::text::integer>=jsonb_array_length(v_q->'options') THEN RAISE EXCEPTION 'FLYDO: Đáp án gửi lên không hợp lệ.'; END IF;
    END IF;
    v_result:=v_result||jsonb_build_object(v_key,v_value);
  END LOOP;
  RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.flydo_exam_public_session(p_session public.mock_exam_sessions)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('session_id',p_session.id,'exam',p_session.exam_snapshot,
    'questions',(SELECT jsonb_agg(jsonb_build_object('id',q->>'id','content',q->'content',
      'question_type',coalesce(q->>'question_type','multiple_choice'),'options',q->'options','diagram',q->'diagram','order_index',q->'order_index')
      ||CASE WHEN q->>'question_type'='true_false' THEN jsonb_build_object('statements',
        (SELECT jsonb_agg(jsonb_build_object('content',s->'content') ORDER BY i) FROM jsonb_array_elements(q->'statements') WITH ORDINALITY AS ss(s,i)))
        ELSE '{}'::jsonb END
      ||CASE WHEN p_session.exam_snapshot->>'scoring_mode'='sectioned' THEN jsonb_build_object('max_points',q->'max_points') ELSE '{}'::jsonb END ORDER BY ord)
      FROM jsonb_array_elements(p_session.questions_snapshot) WITH ORDINALITY AS items(q,ord)),
    'answers',p_session.answers,'revision',p_session.revision,'started_at',p_session.started_at,'deadline_at',p_session.deadline_at,
    'server_now',clock_timestamp(),'attempt_id',p_session.attempt_id);
$$;

CREATE OR REPLACE FUNCTION public.start_mock_exam_session(p_exam_id uuid,p_resume_session_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid:=auth.uid(); v_session public.mock_exam_sessions%ROWTYPE; v_exam jsonb; v_questions jsonb; v_now timestamptz; v_a jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'FLYDO: Vui lòng đăng nhập để thi thử.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('mock-exam:'||v_user::text||':'||p_exam_id::text,0));
  IF p_resume_session_id IS NOT NULL THEN
    SELECT * INTO v_session FROM public.mock_exam_sessions WHERE id=p_resume_session_id AND user_id=v_user AND exam_id=p_exam_id;
    IF FOUND THEN RETURN public.flydo_exam_public_session(v_session); END IF;
  END IF;
  SELECT * INTO v_session FROM public.mock_exam_sessions WHERE user_id=v_user AND exam_id=p_exam_id AND attempt_id IS NULL;
  IF FOUND THEN RETURN public.flydo_exam_public_session(v_session); END IF;
  SELECT to_jsonb(e) INTO v_exam FROM public.mock_exams e WHERE id=p_exam_id FOR UPDATE;
  IF v_exam IS NULL THEN RAISE EXCEPTION 'FLYDO: Không tìm thấy đề thi.'; END IF;
  IF v_exam->>'scoring_mode'='sectioned' AND NOT (v_exam->>'scoring_ready')::boolean THEN RAISE EXCEPTION 'FLYDO: Đề nháp chưa sẵn sàng để thi.'; END IF;
  SELECT jsonb_agg(to_jsonb(q) ORDER BY q.order_index,q.id) INTO v_questions FROM public.mock_exam_questions q WHERE exam_id=p_exam_id;
  IF v_questions IS NULL THEN RAISE EXCEPTION 'FLYDO: Đề thi chưa có câu hỏi.'; END IF;
  IF jsonb_array_length(v_questions)>1000 OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_questions) q WHERE NOT public.flydo_exam_question_valid(q)) THEN
    RAISE EXCEPTION 'FLYDO: Đề thi có câu hỏi chưa hợp lệ.';
  END IF;
  IF v_exam->>'scoring_mode'='sectioned' THEN
    v_a:=public.flydo_exam_allocate(v_exam->'section_points',v_questions);
    IF jsonb_array_length(v_a->'errors')<>0 OR v_a->'questions'<>v_questions THEN RAISE EXCEPTION 'FLYDO: Đề chưa sẵn sàng; cần kiểm tra lại phân điểm.'; END IF;
  ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(v_questions) q WHERE q->>'question_type'='true_false' OR q->>'points_override' IS NOT NULL OR q->>'max_points' IS NOT NULL) THEN
    RAISE EXCEPTION 'FLYDO: Đề cũ cần chuyển sang phân điểm trước.';
  END IF;
  v_now:=clock_timestamp();
  INSERT INTO public.mock_exam_sessions(user_id,exam_id,exam_snapshot,questions_snapshot,started_at,deadline_at)
    VALUES(v_user,p_exam_id,v_exam,v_questions,v_now,v_now+make_interval(mins=>(v_exam->>'duration')::integer)) RETURNING * INTO v_session;
  RETURN public.flydo_exam_public_session(v_session);
END $$;

-- save_mock_exam_answers already locks the owned session, checks revision/deadline,
-- and replaces the entire draft using flydo_exam_validate_answers. Keep its body.
CREATE OR REPLACE FUNCTION public.submit_mock_exam_session(p_session_id uuid,p_answers jsonb,p_expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_session public.mock_exam_sessions%ROWTYPE; v_now timestamptz; v_correct integer; v_total integer; v_attempt uuid; v_duration integer; v_score numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'FLYDO: Vui lòng đăng nhập để nộp bài.'; END IF;
  SELECT * INTO v_session FROM public.mock_exam_sessions WHERE id=p_session_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FLYDO: Không tìm thấy phiên thi của bạn.'; END IF;
  IF v_session.attempt_id IS NOT NULL THEN RETURN jsonb_build_object('attempt_id',v_session.attempt_id); END IF;
  v_now:=clock_timestamp();
  IF v_now<v_session.deadline_at THEN
    IF p_expected_revision IS NULL OR p_expected_revision<>v_session.revision THEN RAISE EXCEPTION 'FLYDO_CONFLICT: Bài làm đã được cập nhật. Hãy tải lại.'; END IF;
    v_session.answers:=public.flydo_exam_validate_answers(v_session.questions_snapshot,p_answers);
  END IF;
  SELECT count(*),count(*) FILTER(WHERE public.flydo_exam_answer_correct(q,v_session.answers->(q->>'id')))
    INTO v_total,v_correct FROM jsonb_array_elements(v_session.questions_snapshot) q;
  IF coalesce(v_session.exam_snapshot->>'scoring_mode','legacy_equal')='sectioned' THEN
    SELECT round(sum(public.flydo_exam_earned_points(q,v_session.answers->(q->>'id'))),2) INTO v_score FROM jsonb_array_elements(v_session.questions_snapshot) q;
  ELSE v_score:=round(10.0*v_correct/v_total,2); END IF;
  v_duration:=greatest(0,least((v_session.exam_snapshot->>'duration')::integer*60,floor(extract(epoch FROM v_now-v_session.started_at))::integer));
  INSERT INTO public.mock_exam_attempts(user_id,exam_id,score,correct_count,total_questions,answers,duration_used)
    VALUES(v_session.user_id,v_session.exam_id,v_score,v_correct,v_total,v_session.answers,v_duration) RETURNING id INTO v_attempt;
  UPDATE public.mock_exam_sessions SET answers=v_session.answers,attempt_id=v_attempt,revision=revision+1 WHERE id=v_session.id;
  RETURN jsonb_build_object('attempt_id',v_attempt);
END $$;

CREATE OR REPLACE FUNCTION public.get_my_mock_exam_result(p_exam_id uuid,p_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_attempt public.mock_exam_attempts%ROWTYPE; v_session public.mock_exam_sessions%ROWTYPE; v_exam jsonb; v_questions jsonb;
  v_sectioned boolean:=false; v_sections jsonb; v_partial integer; v_answered integer; v_correct_statements integer; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'FLYDO: Vui lòng đăng nhập để xem kết quả.'; END IF;
  SELECT * INTO v_attempt FROM public.mock_exam_attempts WHERE id=p_attempt_id AND exam_id=p_exam_id AND user_id=auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'FLYDO: Không tìm thấy bài làm của bạn trong đề thi này.'; END IF;
  SELECT * INTO v_session FROM public.mock_exam_sessions WHERE attempt_id=v_attempt.id AND user_id=auth.uid();
  IF FOUND THEN
    v_exam:=v_session.exam_snapshot; v_questions:=v_session.questions_snapshot;
    v_sectioned:=coalesce(v_exam->>'scoring_mode','legacy_equal')='sectioned';
  ELSE
    SELECT to_jsonb(e)-ARRAY['scoring_mode','section_points','scoring_ready','scoring_revision'] INTO v_exam FROM public.mock_exams e WHERE id=p_exam_id;
    SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.order_index,q.id),'[]') INTO v_questions FROM public.mock_exam_questions q
      WHERE exam_id=p_exam_id AND q.question_type='multiple_choice' AND q.created_at<=v_attempt.created_at;
  END IF;
  SELECT coalesce(jsonb_agg((CASE WHEN v_sectioned THEN q ELSE q-ARRAY['max_points','points_override'] END)
    ||jsonb_build_object('is_correct',public.flydo_exam_answer_correct(q,v_attempt.answers->(q->>'id')))
    ||CASE WHEN v_sectioned THEN jsonb_build_object('earned_points',public.flydo_exam_earned_points(q,v_attempt.answers->(q->>'id'))) ELSE '{}'::jsonb END
    ||CASE WHEN q->>'question_type'='true_false' THEN jsonb_build_object('correct_statement_count',public.flydo_exam_correct_statement_count(q,v_attempt.answers->(q->>'id')),
      'answered_statement_count',(SELECT count(*) FROM jsonb_array_elements(coalesce(v_attempt.answers->(q->>'id'),'[]')) a WHERE jsonb_typeof(a)='boolean')) ELSE '{}'::jsonb END
    ORDER BY ord),'[]') INTO v_questions FROM jsonb_array_elements(v_questions) WITH ORDINALITY AS items(q,ord);
  v_result:=jsonb_build_object('attempt',to_jsonb(v_attempt),'exam',v_exam,'questions',v_questions,'server_graded',v_session.id IS NOT NULL);
  IF v_sectioned THEN
    SELECT jsonb_object_agg(t,jsonb_build_object('max_points',coalesce((SELECT sum((q->>'max_points')::numeric) FROM jsonb_array_elements(v_questions) q WHERE q->>'question_type'=t),0),
      'earned_points',coalesce((SELECT sum((q->>'earned_points')::numeric) FROM jsonb_array_elements(v_questions) q WHERE q->>'question_type'=t),0),
      'question_count',(SELECT count(*) FROM jsonb_array_elements(v_questions) q WHERE q->>'question_type'=t))) INTO v_sections
      FROM unnest(ARRAY['multiple_choice','true_false','short_answer']) AS types(t);
    SELECT count(*) FILTER(WHERE (q->>'earned_points')::numeric>0 AND NOT (q->>'is_correct')::boolean),
      coalesce(sum((q->>'answered_statement_count')::integer),0),coalesce(sum((q->>'correct_statement_count')::integer),0)
      INTO v_partial,v_answered,v_correct_statements FROM jsonb_array_elements(v_questions) q;
    v_result:=v_result||jsonb_build_object('section_scores',v_sections,'partial_count',v_partial,'answered_statement_count',v_answered,'correct_statement_count',v_correct_statements);
  END IF;
  RETURN v_result;
END $$;

-- Every implementation helper is private, including the renamed old importer.
REVOKE ALL ON FUNCTION public.flydo_exam_require_admin(),public.flydo_exam_point_valid(jsonb,boolean),public.flydo_exam_allocate(jsonb,jsonb),
  public.flydo_exam_admin_state(uuid),public.flydo_exam_lock_revision(uuid,integer),public.flydo_exam_import_candidates(public.mock_exams,jsonb,boolean),
  public.flydo_exam_apply_allocation(uuid,jsonb,boolean),public.flydo_exam_legacy_import(text,text,uuid,smallint,jsonb),
  public.flydo_exam_correct_statement_count(jsonb,jsonb),public.flydo_exam_earned_points(jsonb,jsonb),
  public.flydo_exam_guard_question_write(),public.flydo_exam_guard_scoring_write(),public.flydo_exam_legacy_question_revision(),
  public.flydo_exam_question_valid(jsonb),public.flydo_exam_answer_correct(jsonb,jsonb),public.flydo_exam_validate_answers(jsonb,jsonb),
  public.flydo_exam_public_session(public.mock_exam_sessions) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_get_mock_exam_scoring(uuid),public.admin_preview_mock_exam_import(uuid,jsonb,integer),
  public.admin_save_mock_exam_scoring(uuid,jsonb,jsonb,integer,boolean),public.admin_delete_mock_exam_question(uuid,uuid,integer),
  public.admin_import_mock_exam_questions(uuid,jsonb,integer),public.import_questions_json(text,text,uuid,smallint,jsonb),
  public.start_mock_exam_session(uuid,uuid),public.submit_mock_exam_session(uuid,jsonb,integer),public.get_my_mock_exam_result(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_get_mock_exam_scoring(uuid),public.admin_preview_mock_exam_import(uuid,jsonb,integer),
  public.admin_save_mock_exam_scoring(uuid,jsonb,jsonb,integer,boolean),public.admin_delete_mock_exam_question(uuid,uuid,integer),
  public.admin_import_mock_exam_questions(uuid,jsonb,integer),public.import_questions_json(text,text,uuid,smallint,jsonb),
  public.start_mock_exam_session(uuid,uuid),public.submit_mock_exam_session(uuid,jsonb,integer),public.get_my_mock_exam_result(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
