'use client';

import Link from 'next/link';
import { CheckCircle2, Clock, Eye, FileText, History, Play, RotateCcw, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
      <h3 id={`exam-${exam.id}`} className="text-lg font-semibold leading-7 text-foreground [overflow-wrap:anywhere]">{exam.title}</h3>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="gap-1.5 border-primary/25 bg-primary-soft py-1 text-primary">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />{exam.duration} phút
        </Badge>
        <Badge variant="outline" className={hasAttempt ? 'gap-1.5 border-success/25 bg-success-soft py-1 text-success' : 'gap-1.5 border-border bg-muted py-1 text-muted-foreground'}>
          {hasAttempt ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <FileText className="h-3.5 w-3.5" aria-hidden="true" />}{hasAttempt ? 'Đã làm' : 'Chưa làm'}
        </Badge>
        {topicName && <Badge variant="outline" className="max-w-full border-border bg-muted py-1 font-medium leading-5 text-muted-foreground [overflow-wrap:anywhere]">{topicName}</Badge>}
      </div>

      <div className="mt-auto pt-5">
        <div className="mb-4 min-h-[88px] rounded-xl border border-border/70 bg-muted/40 px-3 py-3">
          {hasAttempt ? (
            <div>
              <dl className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                <div>
                  <dt className="mb-1 text-xs text-muted-foreground">Điểm gần nhất</dt>
                  <dd className="text-3xl font-bold tabular-nums text-primary">{latestAttempt.score.toFixed(2)}<span className="ml-1 text-sm font-normal text-muted-foreground">/10</span></dd>
                </div>
                <div>
                  <dt className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Trophy className="h-3.5 w-3.5 text-warning" aria-hidden="true" />Điểm cao nhất</dt>
                  <dd className="text-lg font-semibold tabular-nums text-foreground">{bestScore.toFixed(2)}<span className="ml-1 text-xs font-normal text-muted-foreground">/10</span></dd>
                </div>
              </dl>
              <div className="mt-3 flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-border/60 pt-2 text-xs leading-5 text-muted-foreground">
                <p className="font-medium text-foreground">Đã thi {attempts.length} lần</p>
                <p>Lần gần nhất: <time dateTime={latestAttempt.created_at}>{formatTimeAgo(latestAttempt.created_at)}</time></p>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[62px] items-center gap-3">
              <FileText className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div><p className="text-sm font-medium text-foreground">Chưa có kết quả</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Bắt đầu làm đề để xem điểm và lưu lịch sử thi.</p></div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button type="button" onClick={() => onStart(exam.id)} className="col-span-2 h-11 min-w-0 rounded-lg font-semibold">
            {hasAttempt ? <RotateCcw className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
            {hasAttempt ? 'Thi lại' : 'Bắt đầu'}
          </Button>
          {hasAttempt && (
            <>
              <Button asChild variant="outline" className="h-auto min-h-11 min-w-0 rounded-lg px-2 py-2">
                <Link href={`/mock-exams/${exam.id}/result?attemptId=${latestAttempt.id}`} aria-label={`Xem kết quả gần nhất: ${exam.title}`}><Eye className="h-4 w-4" aria-hidden="true" />Kết quả</Link>
              </Button>
              <Button type="button" variant="outline" className="h-auto min-h-11 min-w-0 flex-wrap gap-1.5 whitespace-normal rounded-lg px-2 py-2" aria-label={`Lịch sử ${attempts.length} lần thi: ${exam.title}`} onClick={() => onHistory(exam)}>
                <History className="h-4 w-4" aria-hidden="true" />Lịch sử <span className="tabular-nums">({attempts.length})</span>
              </Button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
