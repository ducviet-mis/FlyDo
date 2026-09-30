'use client';
import { useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { fetchAllPages } from '@/features/practice/data/fetch-all-pages';
import { localStudyDate, studyDayBounds, useOnlineStudyStore } from '@/features/daily-goal/stores/online-study-store';
import type { StatsData, TimeFilter } from '../types';
export type { TimeFilter, StatsData } from '../types';
const EMPTY: StatsData = { totalQuestions: 0, correctCount: 0, wrongCount: 0, totalMinutes: 0, accuracy: 0 };

export function useStats(filter: TimeFilter): StatsData & { error: string } {
  const userId = useAuthStore((state) => state.user?.id);
  const online = useOnlineStudyStore();
  const today = localStudyDate();
  const [snapshot, setSnapshot] = useState<{ userId: string; filter: TimeFilter; data: StatsData; pastSeconds: number } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!userId) { setSnapshot(null); setError(''); return; }
    let cancelled = false;
    let sequence = 0;
    setError('');
    async function load() {
      const requestId = ++sequence;
      try {
        const db = getSupabaseClient();
        const days = filter === 'week' ? 6 : filter === 'month' ? 29 : 0;
        const date = localStudyDate(new Date(Date.parse(today + 'T00:00:00+07:00') - days * 86400000));
        const { start } = studyDayBounds(date);
        const { end } = studyDayBounds(today);
        const [progress, time] = await Promise.all([
          fetchAllPages<{ is_correct: boolean }>(async (from, to) => {
            let query = db.from('practice_progress').select('question_id, is_correct').eq('user_id', userId);
            if (filter !== 'all') query = query.gte('answered_at', start).lt('answered_at', end);
            return query.order('question_id').range(from, to);
          }),
          fetchAllPages<{ study_date: string; seconds: number }>(async (from, to) => {
            let query = db.from('user_daily_online_time').select('study_date, seconds').eq('user_id', userId).lte('study_date', today);
            if (filter !== 'all') query = query.gte('study_date', date);
            return query.order('study_date').range(from, to);
          }),
        ]);
        if (cancelled || requestId !== sequence) return;
        const correctCount = progress.filter((row) => row.is_correct).length;
        const pastSeconds = time.filter((row) => row.study_date !== today).reduce((total, row) => total + Number(row.seconds), 0);
        const seconds = time.reduce((total, row) => total + Number(row.seconds), 0);
        setError('');
        setSnapshot({ userId: userId!, filter, pastSeconds, data: {
          totalQuestions: progress.length, correctCount, wrongCount: progress.length - correctCount,
          accuracy: progress.length ? Math.round(correctCount / progress.length * 100) : 0,
          totalMinutes: Math.floor(seconds / 60),
        } });
      } catch { if (!cancelled && requestId === sequence) setError('Chưa thể tải đầy đủ thống kê học tập. Vui lòng thử lại khi có kết nối.'); }
    }
    void load();
    window.addEventListener('focus', load);
    window.addEventListener('flydo:practice-progress-updated', load);
    return () => { cancelled = true; window.removeEventListener('focus', load); window.removeEventListener('flydo:practice-progress-updated', load); };
  }, [filter, today, userId]);
  if (!userId || snapshot?.userId !== userId || snapshot.filter !== filter) return { ...EMPTY, error };
  const totalMinutes = online.userId === userId && online.date === today
    ? Math.floor((snapshot.pastSeconds + online.seconds) / 60) : snapshot.data.totalMinutes;
  return { ...snapshot.data, totalMinutes, error };
}
