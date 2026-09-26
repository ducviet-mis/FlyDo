'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, BookOpen, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StudyHeading } from '@/components/shared/study-heading';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { useWrongNotebook } from '@/features/wrong-notebook/hooks/use-wrong-notebook';
import { LESSON_META } from '@/features/practice/data/practice-data';
import { getSupabaseClient } from '@/lib/supabase/client';

type LessonInfo = { id: string; grade: number; chapter: string; title: string };

export default function WrongQuestionOverviewPage() {
  const { user, initialized, isLoading: authLoading } = useAuthStore();
  const { wrongQuestions, totalCount, loading } = useWrongNotebook();
  const [lessons, setLessons] = useState<LessonInfo[]>([]);
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const lessonIds = useMemo(() => Array.from(new Set(wrongQuestions.map((question) => question.lessonId).filter(Boolean))), [wrongQuestions]);

  useEffect(() => {
    let active = true;
    if (!lessonIds.length) {
      setLessons([]);
      setLessonsLoading(false);
      return;
    }
    setLessonsLoading(true);
    void getSupabaseClient().from('practice_lessons').select('id, grade, chapter, title').in('id', lessonIds)
      .then(({ data }: { data: LessonInfo[] | null }) => {
        if (active) {
          setLessons((data || []) as LessonInfo[]);
          setLessonsLoading(false);
        }
      });
    return () => { active = false; };
  }, [lessonIds]);

  const lessonMap = useMemo(() => new Map(lessons.map((lesson) => [lesson.id, lesson])), [lessons]);
  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    wrongQuestions.forEach((question) => {
      if (question.lessonId) counts.set(question.lessonId, (counts.get(question.lessonId) || 0) + 1);
    });
    return Array.from(counts, ([id, count]) => ({ id, count, lesson: lessonMap.get(id) || LESSON_META[id] }))
      .sort((a, b) => b.count - a.count || (a.lesson?.title || a.id).localeCompare(b.lesson?.title || b.id, 'vi'));
  }, [lessonMap, wrongQuestions]);

  const pageLoading = !initialized || authLoading || loading || lessonsLoading;

  return (
    <div className="study-page space-y-6">
      <Link href="/home" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Trang chủ</Link>
      <StudyHeading eyebrow="Tự luyện · Câu sai" title="Những bài cần làm lại" description="Chọn một bài để luyện lại đúng các câu bạn đã trả lời sai.">
        {!pageLoading && user && totalCount > 0 && <p className="text-sm font-semibold text-foreground"><span className="tabular-nums text-destructive">{totalCount}</span> câu sai trong <span className="tabular-nums">{groups.length}</span> bài học</p>}
      </StudyHeading>

      {pageLoading ? <div role="status" className="rounded-2xl border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">Đang tổng hợp câu sai...</div>
        : !user ? <Card><CardContent className="space-y-4 p-6 text-center"><p className="text-muted-foreground">Đăng nhập để xem các câu cần luyện lại.</p><Button asChild><Link href="/login">Đăng nhập</Link></Button></CardContent></Card>
        : groups.length === 0 ? <Card><CardContent className="space-y-4 p-6 text-center"><p className="font-semibold text-foreground">Bạn chưa có câu sai cần làm lại.</p><p className="text-sm text-muted-foreground">Tiếp tục tự luyện để theo dõi tiến bộ theo từng bài.</p><Button asChild variant="outline"><Link href="/practice">Đến Tự luyện</Link></Button></CardContent></Card>
        : <div className="grid gap-3 md:grid-cols-2">{groups.map(({ id, count, lesson }) => (
          <Card key={id} className="rounded-2xl border-border shadow-soft">
            <CardContent className="flex h-full flex-col gap-5 p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"><BookOpen className="h-5 w-5" aria-hidden="true" /></span>
                <div className="min-w-0 flex-1"><p className="text-xs font-medium text-muted-foreground">{lesson ? `Lớp ${lesson.grade} · ${lesson.chapter}` : 'Bài tự luyện'}</p><h2 className="mt-1 break-words text-lg font-bold leading-snug text-foreground">{lesson?.title || `Bài ${id}`}</h2></div>
              </div>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <p className="text-sm font-medium text-muted-foreground"><span className="mr-1 text-xl font-bold tabular-nums text-destructive">{count}</span> câu sai</p>
                <Button asChild className="min-h-11 gap-2"><Link href={`/practice/wrong/${encodeURIComponent(id)}`}><RotateCcw className="h-4 w-4" aria-hidden="true" />Làm lại<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></Button>
              </div>
            </CardContent>
          </Card>
        ))}</div>}
    </div>
  );
}
