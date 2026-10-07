'use client';

import { BookX, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useWrongNotebook } from '../hooks/use-wrong-notebook';
import Link from 'next/link';
import { MathRenderer } from '@/features/practice/components/math-renderer';

export function WrongNotebookCard({ compact = false }: { compact?: boolean }) {
  const { wrongQuestions, totalCount, loading, error } = useWrongNotebook();

  if (compact) return (
    <Card level="compact" className="h-full">
      <CardContent className="flex h-full flex-col items-start gap-3 p-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground"><BookX aria-hidden="true" className="h-4 w-4 text-special" />Việc nên làm tiếp</h2>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : <p className="text-sm leading-6 text-muted-foreground">
          {loading ? 'Đang xem lại buổi học của bạn…' : totalCount > 0 ? <><strong className="font-semibold text-foreground">{totalCount} câu sai</strong> cần ôn lại. Làm chắc kiến thức trước khi học bài mới.</> : 'Bạn không còn câu sai cần ôn. Chọn một bài tự luyện để tiếp tục.'}
        </p>}
        <Button asChild={!loading && !error} disabled={loading || Boolean(error)} variant="outline" className="mt-auto min-h-11 gap-2">
          {!loading && !error ? totalCount > 0 ? <Link href="/practice/wrong">Luyện lại ngay<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
            : <a href="#practice-heading">Chọn bài để luyện<ArrowRight aria-hidden="true" className="h-4 w-4" /></a>
            : <span>{loading ? 'Đang tải…' : 'Chưa thể tải gợi ý'}</span>}
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <Card level="compact">
      <CardContent className="p-6 flex flex-col gap-5">
        
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-md bg-special-soft shrink-0">
            <BookX className="w-5 h-5 text-special" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-end gap-1.5">
              <span className="text-3xl leading-none font-bold tabular-nums text-foreground">
                {loading ? '...' : totalCount}
              </span>
              <span className="text-sm font-bold text-muted-foreground mb-1">câu sai</span>
            </div>
            <span className="text-sm font-medium text-muted-foreground">cần làm lại</span>
          </div>
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!loading && !error && totalCount === 0 && (
          <div className="px-4 py-3 bg-success-soft rounded-md">
            <p className="text-sm font-medium text-success">Tuyệt vời! Bạn không có câu hỏi nào bị sai.</p>
          </div>
        )}
        
        {!loading && totalCount > 0 && (
          <div className="px-4 py-3 bg-muted rounded-md border border-border overflow-hidden">
            <div className="text-sm font-medium text-muted-foreground line-clamp-2">
              <MathRenderer content={wrongQuestions[0]?.content || ''} />
            </div>
          </div>
        )}
        
        <Button asChild={totalCount > 0} disabled={totalCount === 0} variant="outline" className="w-full">
          {totalCount > 0 ? <Link href="/practice/wrong">Luyện lại ngay <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" /></Link> : <span>Luyện lại ngay <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" /></span>}
        </Button>
      </CardContent>
    </Card>
  );
}
