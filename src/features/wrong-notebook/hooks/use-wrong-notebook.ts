'use client';

import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { fetchAllPages } from '@/features/practice/data/fetch-all-pages';

export type WrongQuestionDetail = {
  id: string;
  questionId: string;
  content: string;
  options: string[];
  correctAnswer: number;
  selectedAnswer: number;
  lessonId: string;
  answeredAt: string;
};

export function useWrongNotebook() {
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestionDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { user } = useAuthStore();

  useEffect(() => {
    let active = true;
    setWrongQuestions([]); setError('');
    if (!user?.id) {
      setWrongQuestions([]);
      setLoading(false);
      return;
    }

    const fetchWrongQuestions = async () => {
      setLoading(true);
      try {
        const supabase = getSupabaseClient();
        const wrongProgress = await fetchAllPages<any>(async (from, to) => supabase
          .from('practice_progress').select('*').eq('user_id', user.id).eq('is_correct', false)
          .order('question_id').range(from, to));
        if (!wrongProgress?.length) {
          if (active) setWrongQuestions([]);
          return;
        }

        const questionIds = wrongProgress.map((p: any) => p.question_id);
        const questions: any[] = [];
        for (let offset = 0; offset < questionIds.length; offset += 100) {
          const { data, error: questionError } = await supabase.from('practice_questions').select('*').in('id', questionIds.slice(offset, offset + 100));
          if (questionError) throw questionError;
          questions.push(...(data ?? []));
          if (!active) return;
        }
        const questionsMap = new Map<string, { content: string; options: string[]; correct_answer: number }>(
          (questions || []).map((q: any) => [q.id, q])
        );
        const combined: WrongQuestionDetail[] = wrongProgress.filter((p: any) => questionsMap.has(p.question_id)).map((p: any) => {
            const q = questionsMap.get(p.question_id);
            return {
              id: p.id || `${p.user_id}-${p.question_id}`,
              questionId: p.question_id,
              content: q?.content || '',
              options: (q?.options as string[]) || [],
              correctAnswer: q?.correct_answer ?? 0,
              selectedAnswer: p.selected_answer,
              lessonId: p.lesson_id,
              answeredAt: p.answered_at,
            };
        });
        if (active) setWrongQuestions(combined);
      } catch (error) {
        console.error('Không thể tải câu sai:', error);
        if (active) setWrongQuestions([]);
        if (active) setError('Chưa thể tải câu sai. Vui lòng thử lại khi có kết nối.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchWrongQuestions();
    return () => { active = false; };
  }, [user?.id]);

  return {
    wrongQuestions,
    totalCount: wrongQuestions.length,
    loading,
    error
  };
}
