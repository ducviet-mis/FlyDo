-- Run after mock-exam-true-false-scoring.sql, before deploying the new web code.
-- Additive RPC: old web clients retain their existing import behavior.
-- Does not change historical attempts, active session snapshots or grading rules.
BEGIN;

DO $$ BEGIN
  IF to_regprocedure('public.admin_import_mock_exam_questions(uuid,jsonb,integer)') IS NULL THEN
    RAISE EXCEPTION 'FLYDO: Hãy chạy mock-exam-true-false-scoring.sql trước.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_import_and_publish_mock_exam_questions(
  p_exam_id uuid, p_questions jsonb, p_expected_revision integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_exam public.mock_exams%ROWTYPE;
  v_q jsonb;
  v_a jsonb;
BEGIN
  PERFORM public.flydo_exam_require_admin();
  v_exam := public.flydo_exam_lock_revision(p_exam_id, p_expected_revision);
  v_q := public.flydo_exam_import_candidates(v_exam, p_questions, false);
  IF v_exam.scoring_mode = 'sectioned' THEN
    v_a := public.flydo_exam_allocate(v_exam.section_points, v_q);
    IF jsonb_array_length(v_a->'errors') <> 0 THEN
      RAISE EXCEPTION 'FLYDO: Chưa nhập câu nào. Cấu trúc điểm chưa hợp lệ: %. Hãy sửa tổng điểm từng phần trong Điểm & cấu trúc rồi nhập lại JSON.',
        (SELECT string_agg(message, '; ') FROM jsonb_array_elements_text(v_a->'errors') AS errors(message));
    END IF;
  ELSE
    v_a := jsonb_build_object('questions', v_q);
  END IF;

  INSERT INTO public.mock_exam_questions(
    id, exam_id, content, question_type, options, correct_answer, accepted_answers,
    statements, solution, diagram, order_index, points_override, max_points
  )
  SELECT (q->>'id')::uuid, p_exam_id, q->>'content', q->>'question_type', q->'options',
    (q->>'correct_answer')::integer, q->'accepted_answers', q->'statements', q->>'solution',
    nullif(q->'diagram', 'null'::jsonb), (q->>'order_index')::integer,
    (q->>'points_override')::numeric, (q->>'max_points')::numeric
  FROM jsonb_array_elements(v_a->'questions') q
  WHERE NOT EXISTS(SELECT 1 FROM public.mock_exam_questions old WHERE old.id::text = q->>'id');

  IF v_exam.scoring_mode = 'sectioned' THEN
    PERFORM public.flydo_exam_apply_allocation(p_exam_id, v_a, true);
  END IF;
  RETURN public.flydo_exam_admin_state(p_exam_id)
    || jsonb_build_object('count', jsonb_array_length(p_questions));
END $$;

REVOKE ALL ON FUNCTION public.admin_import_and_publish_mock_exam_questions(uuid,jsonb,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_import_and_publish_mock_exam_questions(uuid,jsonb,integer) TO authenticated;

COMMIT;
