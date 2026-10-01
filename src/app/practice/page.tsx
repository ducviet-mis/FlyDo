'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { usePracticeData } from '@/features/practice/hooks/use-practice-data';
import { LessonList } from '@/features/practice/components/lesson-list';
import { MobileGradePicker } from '@/components/layout/mobile-grade-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BookOpen, ChevronRight, RotateCcw, Search, WandSparkles, X } from 'lucide-react';

function searchKey(value: string) {
  return value.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim();
}

function PracticeLoading() {
  return <div role="status" className="study-page py-12 text-center text-sm text-muted-foreground">Đang tải bài luyện...</div>;
}

function PracticeContent() {
  const searchParams = useSearchParams();
  const gradeQuery = searchParams?.get('grade');
  const { grades, loading, progress, wrongCounts, savedCounts } = usePracticeData();
  const selectedGrade = gradeQuery ? grades.find(g => g.id === parseInt(gradeQuery)) : null;
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [search, setSearch] = useState({ chapterId: '', value: '' });
  // Keep chapter selection when its data refreshes; fall back to the first chapter in a new grade.
  const activeChapter = selectedGrade?.chapters.find(c => c.id === activeChapterId) ?? selectedGrade?.chapters[0];
  const query = search.chapterId === activeChapter?.id ? search.value : '';
  const visibleLessons = activeChapter?.lessons.filter(lesson => searchKey(lesson.title).includes(searchKey(query))) ?? [];
  const selectChapter = (id: string) => {
    setActiveChapterId(id);
    setSearch({ chapterId: id, value: '' });
  };

  if (loading) return <PracticeLoading />;

  if (!selectedGrade) {
    return (
      <div className="study-page">
        <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-6 sm:p-8">
          <BookOpen className="mb-5 h-6 w-6 text-primary" aria-hidden="true" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Tự luyện Toán</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Chọn lớp, tìm bài học và luyện tập theo từng mức độ.</p>
          <div className="mt-6"><MobileGradePicker allSizes grades={grades.length ? grades.map(grade => grade.id) : [6, 7, 8, 9]} hrefForGrade={grade => '/practice?grade=' + grade} /></div>
          <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-5">
            <Button asChild variant="outline"><Link href="/practice/wrong"><RotateCcw className="h-4 w-4" aria-hidden="true" />Ôn câu sai</Link></Button>
            <Button asChild variant="outline"><Link href="/personal-exams?source=practice"><WandSparkles className="h-4 w-4" aria-hidden="true" />Tạo đề cá nhân</Link></Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="study-page">
      <header className="mb-6 flex flex-col gap-4 border-b border-border pb-6 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-primary">TỰ LUYỆN</p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Toán {selectedGrade.label}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Chọn chương → bài học → mức độ. Tiến độ của bạn luôn được lưu lại.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href="/practice/wrong"><RotateCcw className="h-4 w-4" aria-hidden="true" />Ôn câu sai</Link></Button>
          <Button asChild variant="outline"><Link href="/personal-exams?source=practice"><WandSparkles className="h-4 w-4" aria-hidden="true" />Tạo đề cá nhân</Link></Button>
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[224px_minmax(0,1fr)] lg:gap-7">
        <aside className="min-w-0 space-y-5 lg:sticky lg:top-24" aria-label="Chọn lớp và chương">
          <div className="[&_a]:min-w-0 [&_a]:whitespace-nowrap [&_a]:px-2 lg:[&_nav>div]:grid lg:[&_nav>div]:grid-cols-2"><MobileGradePicker allSizes currentGrade={selectedGrade.id} grades={grades.map(grade => grade.id)} hrefForGrade={grade => '/practice?grade=' + grade} /></div>
          <div className="lg:hidden">
            <label htmlFor="practice-chapter" className="mb-2 block text-xs font-semibold text-muted-foreground">Chọn chương</label>
            <select id="practice-chapter" value={activeChapter?.id ?? ''} disabled={selectedGrade.chapters.length === 0} onChange={event => selectChapter(event.target.value)} className="h-11 w-full min-w-0 rounded-xl border border-border bg-card px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
              {selectedGrade.chapters.length === 0 && <option value="">Chưa có chương học</option>}
              {selectedGrade.chapters.map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
            </select>
          </div>
          <nav className="hidden rounded-2xl border border-border bg-card p-2 lg:block" aria-label="Chương học">
            <p className="flex items-center gap-2 px-3 pb-3 pt-2 text-xs font-semibold text-muted-foreground"><BookOpen className="h-4 w-4" aria-hidden="true" />CHƯƠNG HỌC</p>
            <div className="space-y-1">
              {selectedGrade.chapters.map(chapter => (
                <button key={chapter.id} type="button" aria-pressed={chapter.id === activeChapter?.id} onClick={() => selectChapter(chapter.id)} className="study-chapter-button flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="min-w-0 flex-1"><span className="block text-sm leading-5">{chapter.title}</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{chapter.lessons.length} bài học</span></span>
                  {chapter.id === activeChapter?.id && <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />}
                </button>
              ))}
            </div>
          </nav>
        </aside>

        <div className="min-w-0">
          {activeChapter ? (
            <>
              <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div className="min-w-0">
                  <p className="mb-1 text-xs text-muted-foreground">{activeChapter.lessons.length} bài học · Chọn level để bắt đầu</p>
                  <h2 className="text-xl font-semibold leading-7 text-foreground">{activeChapter.title}</h2>
                </div>
                <div className="w-full shrink-0 xl:w-64">
                  <label htmlFor="practice-search" className="sr-only">Tìm bài trong chương</label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input id="practice-search" type="search" value={query} onChange={event => setSearch({ chapterId: activeChapter.id, value: event.target.value })} placeholder="Tìm bài trong chương..." className="h-11 pl-9 pr-11 text-base [&::-webkit-search-cancel-button]:appearance-none" />
                    {query && <button type="button" aria-label="Xóa tìm kiếm" onClick={() => setSearch({ chapterId: activeChapter.id, value: '' })} className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="h-4 w-4" aria-hidden="true" /></button>}
                  </div>
                </div>
              </div>
              {visibleLessons.length > 0 ? (
                <LessonList lessons={visibleLessons} lessonNumbers={Object.fromEntries(activeChapter.lessons.map((lesson, index) => [lesson.id, index + 1]))} progress={progress} wrongCounts={wrongCounts} savedCounts={savedCounts} />
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center sm:p-10" role="status">
                  <p className="font-medium text-foreground">{query ? 'Không tìm thấy bài phù hợp' : 'Chương này chưa có bài học'}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{query ? 'Thử tên ngắn hơn, gõ không dấu hoặc chọn một chương khác.' : 'Bạn có thể chọn chương khác để tiếp tục luyện tập.'}</p>
                  {query && <Button variant="outline" className="mt-4" onClick={() => setSearch({ chapterId: activeChapter.id, value: '' })}>Hiện tất cả bài trong chương</Button>}
                </div>
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">Lớp này chưa có chương để luyện tập. Bạn có thể chọn lớp khác.</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PracticePage() {
  return <Suspense fallback={<PracticeLoading />}><PracticeContent /></Suspense>;
}
