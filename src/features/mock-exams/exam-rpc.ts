import { getSupabaseClient } from '@/lib/supabase/client';

type ExamRpcName = 'start_mock_exam_session' | 'save_mock_exam_answers' | 'submit_mock_exam_session' | 'get_my_mock_exam_result';

// A lost submission response is safe to retry: the server returns the same attempt.
export async function examRpc(name: ExamRpcName, args: Record<string, unknown>) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 20_000);
  try {
    return await getSupabaseClient().rpc(name, args).abortSignal(controller.signal);
  } finally {
    window.clearTimeout(timer);
  }
}
