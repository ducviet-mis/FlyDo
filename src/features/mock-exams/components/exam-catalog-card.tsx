'use client';

import Link from 'next/link';
import { Clock, Eye, FileText, History, Play, RotateCcw, Trophy } from 'lucide-react';
import { Portal as TooltipPortal } from '@radix-ui/react-tooltip';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { MockExamAttempt, MockExamSummary } from '../types';

interface ExamCatalogCardProps {
  exam: MockExamSummary;
  attempts: MockExamAttempt[];
  topicName?: string | null;
  formatTimeAgo: (date: string) => string;
  onStart: (id: string) => void;
  onHistory: (exam: MockExamSummary) => void;
}

export function ExamCatalogCard({ exam, attempts, topicName, formatTimeAgo, onStart, onHistory }: ExamCatalogCardProps) {
  const hasAttempt = attempts.length > 0;
  const latestAttempt = attempts[0];
  const bestScore = hasAttempt ? Math.max(...attempts.map(attempt => attempt.score)) : 0;

  return (
    <article aria-labelledby={`exam-${exam.id}`} className="group flex h-full min-w-0 flex-col rounded-2xl border border-border bg-card p-5 shadow-soft transition-colors hover:border-primary/40 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="gap-1.5 border-primary/25 bg-primary-soft py-1 text-primary">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />{exam.duration} phút
        </Badge>
        {topicName && <Badge variant="outline" className="max-w-full border-border bg-muted py-1 font-medium leading-5 text-muted-foreground [overflow-wrap:anywhere]">{topicName}</Badge>}
      </div>
      <h3 id={`exam-${exam.id}`} className="text-lg font-semibold leading-7 text-foreground [overflow-wrap:anywhere]">{exam.title}</h3>

      <div className="mt-auto pt-5">
        <div className="mb-4 min-h-[88px] rounded-xl border border-border/70 bg-muted/40 px-3 py-3">
          {hasAttempt ? (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Trophy className="h-3.5 w-3.5 text-warning" aria-hidden="true" />Điểm cao nhất</p>
                <p className="text-2xl font-bold tabular-nums text-primary">{bestScore.toFixed(2)}<span className="ml-1 text-sm font-normal text-muted-foreground">/10</span></p>
              </div>
              <div className="min-w-0 text-xs leading-5 text-muted-foreground">
                <p className="font-medium text-foreground">Đã thi {attempts.length} lần</p>
                <p>Lần gần nhất: {formatTimeAgo(latestAttempt.created_at)}</p>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[62px] items-center gap-3">
              <FileText className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div><p className="text-sm font-medium text-foreground">Chưa làm bài</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Thử sức và xem kết quả sau khi nộp bài.</p></div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" onClick={() => onStart(exam.id)} className="h-11 min-w-0 flex-1 rounded-lg font-semibold">
            {hasAttempt ? <RotateCcw className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
            {hasAttempt ? 'Thi lại' : 'Bắt đầu'}
          </Button>
          {hasAttempt && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button asChild variant="outline" size="icon" className="h-11 w-11 shrink-0 rounded-lg">
                    <Link href={`/mock-exams/${exam.id}/result?attemptId=${latestAttempt.id}`} aria-label={`Xem kết quả gần nhất: ${exam.title}`}><Eye className="h-4 w-4" aria-hidden="true" /></Link>
                  </Button>
                </TooltipTrigger>
                <TooltipPortal><TooltipContent>Xem kết quả gần nhất</TooltipContent></TooltipPortal>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="outline" size="icon" className="relative h-11 w-11 shrink-0 rounded-lg" aria-label={`Lịch sử ${attempts.length} lần thi: ${exam.title}`} onClick={() => onHistory(exam)}>
                    <History className="h-4 w-4" aria-hidden="true" />
                    <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-card bg-primary px-0.5 text-[10px] font-bold leading-none tabular-nums text-primary-foreground">{attempts.length > 99 ? '99+' : attempts.length}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipPortal><TooltipContent>Lịch sử ({attempts.length} lần thi)</TooltipContent></TooltipPortal>
              </Tooltip>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
