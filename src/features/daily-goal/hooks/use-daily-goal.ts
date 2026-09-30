'use client';

import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { useGoalStore } from '../stores/goal-store';
import { localStudyDate, studyDayBounds, useOnlineStudyStore } from '../stores/online-study-store';
import { fetchAllPages } from '@/features/practice/data/fetch-all-pages';

export function useDailyGoal() {
  const [questions, setQuestions] = useState({ questionsCount: 0, correctCount: 0 });
  
  const goals = useGoalStore((state) => state.goals);
  const userId = useAuthStore((state) => state.user?.id);
  const online = useOnlineStudyStore();
  const studyDate = localStudyDate();
  const studyMinutes = online.userId === userId && online.date === studyDate
    ? Math.floor(online.seconds / 60)
    : 0;
  const progress = { ...questions, studyMinutes };

  useEffect(() => {
    if (!userId) {
      setQuestions({ questionsCount: 0, correctCount: 0 });
      return;
    }

    let cancelled = false;
    setQuestions({ questionsCount: 0, correctCount: 0 });
    const fetchTodayProgress = async () => {
      const supabase = getSupabaseClient();
      const { start, end } = studyDayBounds(studyDate);

      let data: { is_correct: boolean }[];
      try {
        data = await fetchAllPages(async (from, to) => supabase.from('practice_progress')
          .select('question_id, is_correct').eq('user_id', userId).gte('answered_at', start).lt('answered_at', end)
          .order('question_id').range(from, to));
      } catch { return; }

      if (data && !cancelled) {
        const questionsCount = data.length;
        const correctCount = data.filter((row: { is_correct: boolean }) => row.is_correct).length;
        setQuestions({ questionsCount, correctCount });
      }
    };

    void fetchTodayProgress();
    const onFocus = () => { void fetchTodayProgress(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('flydo:practice-progress-updated', onFocus);
    return () => { cancelled = true; window.removeEventListener('focus', onFocus); window.removeEventListener('flydo:practice-progress-updated', onFocus); };
  }, [studyDate, userId]);

  const currentAccuracy = progress.questionsCount > 0 
    ? Math.round((progress.correctCount / progress.questionsCount) * 100) 
    : 0;

  const percentages = {
    study: Math.min(100, Math.round((progress.studyMinutes / goals.studyMinutes) * 100)) || 0,
    questions: Math.min(100, Math.round((progress.questionsCount / goals.questionsCount) * 100)) || 0,
    accuracy: Math.min(100, Math.round((currentAccuracy / goals.accuracy) * 100)) || 0,
    overall: 0
  };
  
  percentages.overall = Math.round((percentages.study + percentages.questions + percentages.accuracy) / 3) || 0;

  return {
    progress,
    goals,
    currentAccuracy,
    percentages
  };
}
