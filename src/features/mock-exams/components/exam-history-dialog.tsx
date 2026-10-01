'use client';

import Link from 'next/link';
import { ArrowRight, Clock, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { MockExamAttempt, MockExamSummary } from '../types';

interface ExamHistoryDialogProps {
  exam: MockExamSummary | null;
  attempts: MockExamAttempt[];
  bestScore: number;
  onClose: () => void;
  formatDateTime: (date: string) => string;
  formatDuration: (seconds: number) => string;
}

export function ExamHistoryDialog({ exam, attempts, bestScore, onClose, formatDateTime, formatDuration }: ExamHistoryDialogProps) {
  return (
    <Dialog open={!!exam} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl"><History className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />Lịch sử làm bài</DialogTitle>
          <DialogDescription className="leading-6 [overflow-wrap:anywhere]">{exam?.title}</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-muted/40 p-4">
          <div><dt className="text-xs text-muted-foreground">Số lượt thi</dt><dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">{attempts.length}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Điểm cao nhất</dt><dd className="mt-1 text-lg font-semibold tabular-nums text-primary">{bestScore.toFixed(2)}<span className="text-xs font-normal text-muted-foreground"> /10</span></dd></div>
        </dl>
        <ol className="space-y-3" aria-label="Các lần làm bài, mới nhất trước">
          {attempts.map((attempt, index) => {
            const isLatest = index === 0;
            const isBest = attempt.score === bestScore;
            return (
              <li key={attempt.id} className={cn('min-w-0 rounded-xl border p-4', isLatest ? 'border-primary/35 bg-primary-soft/40' : 'border-border bg-card')}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">Lượt thi #{attempts.length - index}</h3>
                  {isLatest && <Badge>Mới nhất</Badge>}
                  {isBest && <Badge variant="warning">Cao nhất</Badge>}
                </div>
                <p className="text-xs leading-5 text-muted-foreground">{formatDateTime(attempt.created_at)}</p>
                <div className="mt-3 flex items-end justify-between gap-3 border-t border-border/70 pt-3">
                  <div>
                    <p className="text-xl font-bold tabular-nums text-foreground">{attempt.score.toFixed(2)}<span className="ml-1 text-xs font-normal text-muted-foreground">/10</span></p>
                    <p className="mt-1 text-xs tabular-nums text-muted-foreground">{attempt.correct_count}/{attempt.total_questions} câu đúng</p>
                    <p className="mt-1 flex items-center gap-1 text-xs tabular-nums text-muted-foreground"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{formatDuration(attempt.duration_used)}</p>
                  </div>
                  <Button asChild variant="outline" className="h-11 shrink-0 rounded-lg px-3 text-sm"><Link href={`/mock-exams/${exam?.id}/result?attemptId=${attempt.id}`}>Xem chi tiết<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></Button>
                </div>
              </li>
            );
          })}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
