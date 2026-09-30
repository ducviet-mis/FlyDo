'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { fetchAllPages } from '../data/fetch-all-pages';

export function useSavedQuestions(lessonId?: string) {
  const userId = useAuthStore((state) => state.user?.id);
  const scope = (userId || '') + ':' + (lessonId || '');
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const [state, setState] = useState<{ scope: string; ids: string[] }>({ scope: '', ids: [] });
  const savedRef = useRef<{ scope: string; ids: string[] }>({ scope: '', ids: [] });
  const pending = useRef(new Set<string>());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const supabase = getSupabaseClient();

  const fetchSavedIds = useCallback(async (lesson: string) => {
    if (!userId) return [];
    const rows = await fetchAllPages<{ question_id: string }>(async (from, to) => supabase
      .from('saved_questions').select('question_id').eq('lesson_id', lesson).eq('user_id', userId)
      .order('question_id').range(from, to));
    return rows.map((row) => row.question_id);
  }, [supabase, userId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    savedRef.current = { scope, ids: [] };
    setState(savedRef.current);
    async function load() {
      try {
        const ids = lessonId && userId ? await fetchSavedIds(lessonId) : [];
        if (!cancelled) { savedRef.current = { scope, ids }; setState(savedRef.current); }
      } catch { if (!cancelled) setError('Chưa thể tải câu đã lưu. Vui lòng thử lại.'); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [fetchSavedIds, lessonId, scope, userId]);

  const toggleSave = async (questionId: string, currentLessonId: string, difficultyLevel = 1) => {
    if (!userId || loading) return;
    const key = userId + ':' + questionId;
    if (pending.current.has(key)) return;
    pending.current.add(key);
    const wasSaved = savedRef.current.scope === scope && savedRef.current.ids.includes(questionId);
    const update = (saved: boolean) => {
      if (currentScope.current !== scope || useAuthStore.getState().user?.id !== userId) return;
      const ids = savedRef.current.ids.filter((id) => id !== questionId);
      savedRef.current = { scope, ids: saved ? [...ids, questionId] : ids };
      setState(savedRef.current);
    };
    setError(''); update(!wasSaved);
    try {
      const result = wasSaved
        ? await supabase.from('saved_questions').delete().match({ user_id: userId, question_id: questionId })
        : await supabase.from('saved_questions').insert({ user_id: userId, question_id: questionId,
          lesson_id: currentLessonId, difficulty_level: difficultyLevel });
      if (result.error && !(result.error.code === '23505' && !wasSaved)) throw result.error;
    } catch {
      update(wasSaved);
      if (currentScope.current === scope) setError('Chưa lưu được thay đổi. Hãy kiểm tra kết nối và thử lại.');
    } finally { pending.current.delete(key); }
  };

  const fetchAllSavedCount = async () => {
    if (!userId) return 0;
    const { count, error: requestError } = await supabase.from('saved_questions')
      .select('*', { count: 'exact', head: true }).eq('user_id', userId);
    if (requestError) throw requestError;
    return count || 0;
  };
  const fetchSavedByLesson = async () => {
    if (!userId) return {};
    const rows = await fetchAllPages<{ lesson_id: string }>(async (from, to) => supabase
      .from('saved_questions').select('lesson_id, question_id').eq('user_id', userId)
      .order('question_id').range(from, to));
    const counts: Record<string, number> = {};
    rows.forEach((row) => { counts[row.lesson_id] = (counts[row.lesson_id] || 0) + 1; });
    return counts;
  };
  return { savedIds: state.scope === scope ? state.ids : [], loading: state.scope === scope ? loading : true,
    error, toggleSave, fetchSavedIds, fetchAllSavedCount, fetchSavedByLesson };
}
