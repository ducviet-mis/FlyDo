'use client';

import { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { Question } from '../types';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/features/auth/stores/auth-store';

function userScope(lessonId: string, userId?: string) { return (userId || '') + ':' + lessonId; }

export function usePractice(questions: Question[], lessonId: string, initialAnsweredIds: string[] = [], saveProgress: boolean = true) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [showSolution, setShowSolution] = useState<Record<string, boolean>>({});
  const answeredRef = useRef(new Set<string>());
  const pendingProgress = useRef(new Map<string, Record<string, unknown>>());
  const savingIds = useRef(new Set<string>());
  const scope = userScope(lessonId, useAuthStore((state) => state.user?.id));
  const currentScope = useRef(scope);
  useLayoutEffect(() => { currentScope.current = scope; }, [scope]);
  const [saveError, setSaveError] = useState('');
  
  const supabase = getSupabaseClient();
  const { user } = useAuthStore();

  // Memoize initialAnsweredIds to avoid re-triggering on every render
  const answeredIdsStr = initialAnsweredIds.join(',');

  useEffect(() => {
    if (questions.length > 0) {
      const ids = answeredIdsStr ? answeredIdsStr.split(',') : [];
      const firstUnansweredIndex = questions.findIndex(q => !ids.includes(q.id));
      if (firstUnansweredIndex !== -1) {
        setCurrentQuestionIndex(firstUnansweredIndex);
      } else {
        setCurrentQuestionIndex(0);
      }
    }
    // Reset answers when questions change
    setAnswers({});
    setShowSolution({});
    answeredRef.current.clear();
    pendingProgress.current.clear();
    setSaveError('');
  }, [questions, answeredIdsStr, lessonId, user?.id]);

  const currentQuestion = questions[currentQuestionIndex];
  
  const selectedAnswer = answers[currentQuestion?.id] ?? null;
  const isAnswered = selectedAnswer !== null;
  const isCorrect = isAnswered ? selectedAnswer === currentQuestion?.correctAnswer : null;
  const isShowingSolution = !!showSolution[currentQuestion?.id];

  const persistProgress = useCallback(async (payload: Record<string, unknown>) => {
    const id = payload.question_id as string;
    const key = scope + ':' + id;
    if (savingIds.current.has(key) || currentScope.current !== scope) return;
    savingIds.current.add(key);
    try {
      const { error } = await supabase.from('practice_progress').upsert(payload, { onConflict: 'user_id,question_id' });
      if (error) {
        const fallback = await supabase.from('practice_progress').insert(payload);
        if (fallback.error) throw fallback.error;
      }
      if (currentScope.current === scope && useAuthStore.getState().user?.id === payload.user_id) {
        if (pendingProgress.current.get(id) === payload) pendingProgress.current.delete(id);
        if (!pendingProgress.current.size) setSaveError('');
        window.dispatchEvent(new Event('flydo:practice-progress-updated'));
      }
    } catch {
      if (currentScope.current === scope) setSaveError('Chưa lưu được tiến độ. Đừng rời bài; hãy kiểm tra kết nối rồi thử lưu lại.');
    } finally { savingIds.current.delete(key); }
  }, [scope, supabase]);

  const retrySaves = useCallback(async () => {
    if (currentScope.current !== scope) return;
    await Promise.all(Array.from(pendingProgress.current.values()).map(persistProgress));
  }, [persistProgress, scope]);

  useEffect(() => {
    const retry = () => { void retrySaves(); };
    window.addEventListener('online', retry);
    window.addEventListener('focus', retry);
    return () => { window.removeEventListener('online', retry); window.removeEventListener('focus', retry); };
  }, [retrySaves]);

  const selectAnswer = async (index: number) => {
    if (!currentQuestion || isAnswered || answeredRef.current.has(currentQuestion.id)
      || !Number.isInteger(index) || index < 0 || index >= currentQuestion.options.length) return;
    answeredRef.current.add(currentQuestion.id);
    setAnswers(prev => ({ ...prev, [currentQuestion.id]: index }));
    setShowSolution(prev => ({ ...prev, [currentQuestion.id]: true }));
    
    if (user?.id && currentQuestion && saveProgress) {
      const payload = {
        user_id: user.id, question_id: currentQuestion.id, lesson_id: lessonId,
        difficulty_level: currentQuestion.difficultyLevel || 1, selected_answer: index,
        is_correct: index === currentQuestion.correctAnswer, answered_at: new Date().toISOString(),
      };
      pendingProgress.current.set(currentQuestion.id, payload);
      await persistProgress(payload);
    }
  };

  const nextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const prevQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const progress = useMemo(() => {
    const ids = answeredIdsStr ? answeredIdsStr.split(',') : [];
    const existingIds = new Set(questions.filter((q) => ids.includes(q.id)).map((q) => q.id));
    let answered = existingIds.size;
    let correct = 0;
    questions.forEach(q => {
      if (answers[q.id] !== undefined) {
        if (!existingIds.has(q.id)) {
          answered++;
        }
        if (answers[q.id] === q.correctAnswer) correct++;
      }
    });
    return { answered, total: questions.length, correct };
  }, [answers, questions, answeredIdsStr]);

  return {
    currentQuestionIndex,
    currentQuestion,
    selectedAnswer,
    isAnswered,
    isCorrect,
    showSolution: isShowingSolution,
    selectAnswer,
    nextQuestion,
    prevQuestion,
    progress,
    saveError,
    retrySaves
  };
}
