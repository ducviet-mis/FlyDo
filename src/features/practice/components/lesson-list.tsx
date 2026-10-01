'use client';

import React, { useState } from 'react';
import { Lesson } from '../types';
import { CheckCircle2, RotateCcw, ShoppingBasket, Trash2, Loader2, Check, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { cn } from '@/lib/utils';
import { MixModeDialog } from './mix-mode-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Portal as TooltipPortal } from '@radix-ui/react-tooltip';

interface LessonListProps {
  lessons: Lesson[];
  lessonNumbers?: Record<string, number>;
  progress: Record<string, { answered: number, total: number }>;
  wrongCounts?: Record<string, number>;
  savedCounts?: Record<string, number>;
  onProgressReset?: () => void;
}

const LEVELS = [
  { id: 1, name: 'Nhận biết' },
  { id: 2, name: 'Thông hiểu' },
  { id: 3, name: 'Vận dụng' },
  { id: 4, name: 'Vận dụng cao' },
];

export function LessonList({ lessons, lessonNumbers = {}, progress, wrongCounts = {}, savedCounts = {}, onProgressReset }: LessonListProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const [resettingId, setResettingId] = useState<string | null>(null);

  const handleReset = async (e: React.MouseEvent, lessonId: string, level?: number) => {
    e.stopPropagation();
    if (!user?.id) return;

    const msg = level
      ? `Xóa toàn bộ tiến độ Level ${level} của bài này?`
      : `Xóa toàn bộ tiến độ bài này?`;

    const confirmed = window.confirm(msg);
    if (!confirmed) return;

    const resetKey = level ? `${lessonId}_${level}` : lessonId;
    setResettingId(resetKey);
    const supabase = getSupabaseClient();

    try {
      let progQuery = supabase.from('practice_progress').delete().eq('user_id', user.id).eq('lesson_id', lessonId);
      let savedQuery = supabase.from('saved_questions').delete().eq('user_id', user.id).eq('lesson_id', lessonId);

      if (level) {
        progQuery = progQuery.eq('difficulty_level', level);
        savedQuery = savedQuery.eq('difficulty_level', level);
      }

      await progQuery;
      await savedQuery;

      if (onProgressReset) onProgressReset();
      router.refresh();
      window.location.reload();
    } catch (err) {
      console.error('Reset progress error:', err);
      alert('Lỗi khi xóa tiến độ');
    } finally {
      setResettingId(null);
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
    <div className="space-y-8">
      {lessons.map((lesson, lessonIndex) => {
        const availableLevels = LEVELS.filter((level) => {
          const levelKey = `${lesson.id}_${level.id}`;
          return (progress[levelKey]?.total || 0) > 0;
        });

        return (
          <section key={lesson.id} aria-labelledby={`lesson-${lesson.id}`} className="w-full">
            {/* Tên bài học */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-5">
              <div className="flex min-w-0 items-start gap-3">
                <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-sm font-semibold tabular-nums text-primary">{String(lessonNumbers[lesson.id] ?? lessonIndex + 1).padStart(2, '0')}</span>
                <div className="min-w-0">
                  <h3 id={`lesson-${lesson.id}`} className="text-base font-semibold leading-6 text-foreground sm:text-lg">{lesson.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{progress[lesson.id]?.total || 0} câu hỏi · {availableLevels.length} mức độ</p>
                </div>
              </div>
              {availableLevels.length > 1 && <MixModeDialog lessonId={lesson.id} lessonTitle={lesson.title} totalQuestions={progress[lesson.id]?.total || 0} />}
            </div>

            {/* Chỉ hiển thị những Level đã có câu hỏi. */}
            {availableLevels.length > 0 ? (
              <div
                className={cn(
                  'grid grid-cols-1 gap-3 md:gap-4',
                  availableLevels.length === 1 && 'max-w-sm',
                  availableLevels.length === 2 && 'sm:grid-cols-2',
                  availableLevels.length === 3 && 'sm:grid-cols-2 xl:grid-cols-3',
                  availableLevels.length >= 4 && 'sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4',
                )}
              >
                {availableLevels.map(level => {
                const levelKey = `${lesson.id}_${level.id}`;
                const levelProg = progress[levelKey] || { answered: 0, total: 0 };
                const wrongCount = Math.min(wrongCounts[levelKey] || 0, levelProg.answered);
                const savedCount = savedCounts[levelKey] || 0;
                const isCompleted = levelProg.answered === levelProg.total && levelProg.total > 0;
                const hasProgress = levelProg.answered > 0;
                const correctCount = Math.max(0, levelProg.answered - wrongCount);
                const completionPercent = levelProg.total > 0 ? Math.round((levelProg.answered / levelProg.total) * 100) : 0;
                const accuracyPercent = hasProgress ? Math.round((correctCount / levelProg.answered) * 100) : 0;

                const isResetting = resettingId === levelKey;

                return (
                  <div
                    key={level.id}
                    className="study-lesson-card group flex flex-col rounded-xl border p-4 transition-colors md:p-5"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <h4 className="min-w-0 font-semibold leading-snug text-foreground text-base">
                          <span className="mb-2 block text-xs font-medium tracking-wide text-muted-foreground">Level {level.id}</span>
                          {level.name}
                          {isCompleted && (
                            <>
                              <CheckCircle2 aria-hidden="true" className="ml-1.5 inline h-4 w-4 align-[-2px] text-success" />
                              <span className="sr-only">Đã hoàn thành</span>
                            </>
                          )}
                        </h4>
                        <span className="shrink-0 text-xs font-bold tabular-nums text-primary">{completionPercent}%</span>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
                          <span>Tiến độ</span>
                          <span className="shrink-0 tabular-nums text-foreground">{levelProg.answered}/{levelProg.total} câu</span>
                        </div>
                        <div
                          role="progressbar"
                          aria-label={`Tiến độ Level ${level.id}`}
                          aria-valuemin={0}
                          aria-valuemax={levelProg.total}
                          aria-valuenow={levelProg.answered}
                          className="h-2 overflow-hidden rounded-full bg-track"
                        >
                          <div className="h-full rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-220 ease-out" style={{ width: `${completionPercent}%` }} />
                        </div>
                      </div>

                      {hasProgress ? (
                        <div className="border-t border-border/70 pt-3">
                          <div className="flex items-center justify-between gap-3 text-xs">
                            <span className="font-medium text-muted-foreground">Độ chính xác</span>
                            <span className="font-bold tabular-nums text-foreground">{accuracyPercent}%</span>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-3 text-xs font-semibold tabular-nums">
                            <span className="inline-flex items-center gap-1 text-success"><Check aria-hidden="true" className="h-3.5 w-3.5" />{correctCount} đúng</span>
                            <span className="inline-flex items-center gap-1 text-destructive"><X aria-hidden="true" className="h-3.5 w-3.5" />{wrongCount} sai</span>
                          </div>
                        </div>
                      ) : (
                        <p className="min-h-[57px] border-t border-border/70 pt-3 text-xs leading-5 text-muted-foreground">Chưa luyện · Bắt đầu khi bạn sẵn sàng.</p>
                      )}
                    </div>

                    <div className="mt-auto pt-4">
                      <Button
                        onClick={() => router.push(`/practice/${lesson.id}?level=${level.id}`)}
                        className="h-11 w-full rounded-lg font-semibold"
                      >
                        Luyện tập
                      </Button>

                      <div className="mt-3 flex items-center gap-2" role="group" aria-label={`Công cụ ôn tập Level ${level.id}`}>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={`Thi lại câu sai (${wrongCount})`}
                            aria-disabled={wrongCount === 0}
                            onClick={() => { if (wrongCount > 0) router.push(`/practice/wrong/${lesson.id}?level=${level.id}`); }}
                            className={cn('relative h-11 w-11 rounded-md border-border', wrongCount > 0 ? 'border-destructive/35 bg-destructive-soft text-destructive hover:bg-destructive-soft/80' : 'cursor-not-allowed bg-muted/40 text-muted-foreground')}
                          >
                            <RotateCcw aria-hidden="true" className="h-4 w-4" />
                            <span aria-hidden="true" className={cn('absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-card px-0.5 text-[10px] font-bold leading-none tabular-nums', wrongCount > 0 ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground')}>
                              {wrongCount > 99 ? '99+' : wrongCount}
                            </span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipPortal><TooltipContent side="top">{wrongCount > 0 ? `Thi lại ${wrongCount} câu sai` : 'Chưa có câu sai'}</TooltipContent></TooltipPortal>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={`Câu hỏi đã lưu (${savedCount})`}
                            aria-disabled={savedCount === 0}
                            onClick={() => { if (savedCount > 0) router.push(`/practice/saved/${lesson.id}?level=${level.id}`); }}
                            className={cn('relative h-11 w-11 rounded-md border-border', savedCount > 0 ? 'border-primary/30 bg-primary-soft text-primary hover:bg-primary-soft/80' : 'cursor-not-allowed bg-muted/40 text-muted-foreground')}
                          >
                            <ShoppingBasket aria-hidden="true" className="h-4 w-4" />
                            <span aria-hidden="true" className={cn('absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-card px-0.5 text-[10px] font-bold leading-none tabular-nums', savedCount > 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                              {savedCount > 99 ? '99+' : savedCount}
                            </span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipPortal><TooltipContent side="top">{savedCount > 0 ? `${savedCount} câu hỏi đã lưu` : 'Chưa có câu hỏi đã lưu'}</TooltipContent></TooltipPortal>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label="Xóa tiến độ Level này"
                            aria-disabled={!hasProgress || isResetting}
                            onClick={(e) => { if (hasProgress && !isResetting) void handleReset(e, lesson.id, level.id); }}
                            className={cn('ml-auto h-11 w-11 rounded-md border-border text-muted-foreground', hasProgress ? 'hover:border-destructive/35 hover:bg-destructive-soft hover:text-destructive' : 'cursor-not-allowed opacity-50')}
                          >
                            {isResetting ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Trash2 aria-hidden="true" className="h-4 w-4" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipPortal><TooltipContent side="top">{hasProgress ? 'Xóa tiến độ Level này' : 'Chưa có tiến độ để xóa'}</TooltipContent></TooltipPortal>
                      </Tooltip>
                      </div>
                    </div>
                  </div>
                );
                })}
              </div>
            ) : (
              <div className="mb-4 rounded-xl border border-dashed border-border bg-card/60 px-4 py-5 text-sm text-muted-foreground">
                Bài này chưa có câu hỏi để luyện tập.
              </div>
            )}

          </section>
        );
      })}
    </div>
    </TooltipProvider>
  );
}
