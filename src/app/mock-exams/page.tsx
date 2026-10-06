'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { MobileGradePicker } from '@/components/layout/mobile-grade-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TooltipProvider } from '@/components/ui/tooltip';
import { getSupabaseClient } from '@/lib/supabase/client';
import { FileText, ChevronDown, FolderTree, Search, WandSparkles, X } from 'lucide-react';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { getMockExamCategoryLabel, isMockExamCategory, MOCK_EXAM_CATEGORIES, type MockExamCategory } from '@/features/mock-exams/exam-categories';
import { ExamCatalogCard } from '@/features/mock-exams/components/exam-catalog-card';
import { ExamHistoryDialog } from '@/features/mock-exams/components/exam-history-dialog';
import type { MockExamSummary, MockExamAttempt } from '@/features/mock-exams/types';

interface MockExamTopic { id: string; name: string; grade: number; }
type ExamStatus = 'all' | 'unattempted' | 'attempted';

function searchKey(value: string) {
  return value.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim();
}

function ExamCatalogLoading() {
  return <div role="status" className="py-12 text-center text-sm text-muted-foreground">Đang tải danh sách đề thi...</div>;
}

function MockExamsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const grade = searchParams.get('grade') || '8';
  const requestedCategory = searchParams.get('category');
  const category: MockExamCategory = isMockExamCategory(requestedCategory) ? requestedCategory : 'midterm_1';
  const selectedTopicId = category === 'topic' ? searchParams.get('topic') : null;
  const { user } = useAuthStore();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const [exams, setExams] = useState<MockExamSummary[]>([]);
  const [topics, setTopics] = useState<MockExamTopic[]>([]);
  const [attemptsByExam, setAttemptsByExam] = useState<Record<string, MockExamAttempt[]>>({});
  const [selectedExamForHistory, setSelectedExamForHistory] = useState<MockExamSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [topicsOpen, setTopicsOpen] = useState(category === 'topic');

  const topicNameById = useMemo(() => Object.fromEntries(topics.map((topic) => [topic.id, topic.name])), [topics]);

  useEffect(() => { if (category === 'topic') setTopicsOpen(true); }, [category]);

  const changeCategory = (nextCategory: MockExamCategory, topicId?: string | null) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set('grade', grade);
    next.set('category', nextCategory);
    if (nextCategory === 'topic' && topicId) next.set('topic', topicId);
    else next.delete('topic');
    router.replace(`/mock-exams?${next.toString()}`);
  };

  const startExamInFullscreen = (examId: string) => {
    try {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      window.sessionStorage.setItem('flydo-open-exam-fullscreen', 'true');
      void document.documentElement.requestFullscreen?.().catch(() => undefined);
    } else {
      window.sessionStorage.removeItem('flydo-open-exam-fullscreen');
    }
    } catch { /* Storage/fullscreen is optional; always open the exam. */ }
    router.push(`/mock-exams/${examId}`);
  };

  useEffect(() => {
    async function loadExams() {
      setLoading(true);
      setAttemptsByExam({});
      const supabase = getSupabaseClient();
      let examsQuery = supabase.from('mock_exams').select('*').eq('grade', parseInt(grade)).eq('category', category).order('created_at', { ascending: false });
      if (category === 'topic' && selectedTopicId) examsQuery = examsQuery.eq('topic_id', selectedTopicId);

      const [examsResult, topicsResult] = await Promise.all([
        examsQuery,
        supabase.from('mock_exam_topics').select('id, name, grade').eq('grade', parseInt(grade)).order('sort_order').order('name'),
      ]);

      // Publication is also rechecked on the server when a new session starts.
      // Missing mode is a legacy exam, not an unpublished new draft.
      const examsData = (examsResult.data || []).filter((exam: MockExamSummary) => exam.scoring_mode !== 'sectioned' || exam.scoring_ready === true);
      setExams(examsData);
      setTopics((topicsResult.data || []) as MockExamTopic[]);
      if (examsResult.error) console.error('Không thể tải đề thi thử:', examsResult.error);
      if (topicsResult.error && topicsResult.error.code !== '42P01') console.error('Không thể tải chuyên đề:', topicsResult.error);

      if (user && examsData.length > 0) {
        const { data: attemptsData } = await supabase.from('mock_exam_attempts').select('id, exam_id, score, correct_count, total_questions, duration_used, created_at').eq('user_id', user.id).in('exam_id', examsData.map((exam: any) => exam.id)).order('created_at', { ascending: false });
        if (attemptsData) {
          const grouped: Record<string, MockExamAttempt[]> = {};
          attemptsData.forEach((attempt: any) => { (grouped[attempt.exam_id] ||= []).push(attempt as MockExamAttempt); });
          setAttemptsByExam(grouped);
        }
      }
      setLoading(false);
    }
    void loadExams();
  }, [grade, category, selectedTopicId, user]);

  const formatTimeAgo = (dateStr: string) => {
    try {
      const diffMin = Math.floor((now - new Date(dateStr).getTime()) / 60000);
      if (diffMin < 1) return 'Vừa xong';
      if (diffMin < 60) return `${diffMin} phút trước`;
      if (diffMin < 1440) return `${Math.floor(diffMin / 60)} giờ trước`;
      if (diffMin < 10080) return `${Math.floor(diffMin / 1440)} ngày trước`;
      return format(new Date(dateStr), 'dd/MM/yyyy');
    } catch { return dateStr; }
  };
  const formatDateTime = (dateStr: string) => { try { return format(new Date(dateStr), 'HH:mm - dd/MM/yyyy'); } catch { return dateStr; } };
  const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)}p ${seconds % 60}s`;
  const selectedAttempts = selectedExamForHistory ? (attemptsByExam[selectedExamForHistory.id] || []) : [];
  const selectedBestScore = selectedAttempts.length > 0 ? Math.max(...selectedAttempts.map((attempt) => attempt.score)) : 0;
  const selectedTopicName = selectedTopicId ? topicNameById[selectedTopicId] : null;
  const activeCategoryLabel = category === 'topic' && selectedTopicName ? selectedTopicName : getMockExamCategoryLabel(category);

  const [filters, setFilters] = useState({ context: '', query: '', status: 'all' as ExamStatus });
  const filterContext = JSON.stringify([grade, category, selectedTopicId]);
  const query = filters.context === filterContext ? filters.query : '';
  const status = filters.context === filterContext ? filters.status : 'all';
  const updateFilters = (next: { query?: string; status?: ExamStatus }) => {
    setFilters({ context: filterContext, query, status, ...next });
  };
  const attemptedCount = exams.filter(exam => (attemptsByExam[exam.id]?.length || 0) > 0).length;
  const visibleExams = useMemo(() => {
    const key = searchKey(query);
    return exams.filter(exam => {
      const attempted = (attemptsByExam[exam.id]?.length || 0) > 0;
      if (status === 'attempted' && !attempted) return false;
      if (status === 'unattempted' && attempted) return false;
      return searchKey(exam.title + ' ' + (topicNameById[exam.topic_id || ''] || '')).includes(key);
    });
  }, [exams, query, status, attemptsByExam, topicNameById]);
  const statusFilters: { id: ExamStatus; label: string; count: number }[] = [
    { id: 'all', label: 'Tất cả', count: exams.length },
    { id: 'unattempted', label: 'Chưa thi', count: exams.length - attemptedCount },
    { id: 'attempted', label: 'Đã thi', count: attemptedCount },
  ];

  return (
    <div className="study-page">
      <header className="mb-6 flex flex-col gap-4 border-b border-border pb-6 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-primary">THI THỬ</p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Thi thử lớp {grade}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Luyện đề theo học kỳ hoặc chuyên đề. Xem lại kết quả để tiến bộ.</p>
        </div>
        <Button asChild variant="outline" className="w-fit shrink-0"><Link href="/personal-exams?source=mock-exams"><WandSparkles className="h-4 w-4" aria-hidden="true" />Tạo đề cá nhân</Link></Button>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[224px_minmax(0,1fr)] lg:gap-7">
        <aside className="min-w-0 space-y-5 lg:sticky lg:top-24" aria-label="Chọn lớp và loại đề">
          <div className="[&_a]:min-w-0 [&_a]:whitespace-nowrap [&_a]:px-2 lg:[&_nav>div]:grid lg:[&_nav>div]:grid-cols-2">
            <MobileGradePicker allSizes currentGrade={Number(grade)} hrefForGrade={selectedGrade => '/mock-exams?grade=' + selectedGrade} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
            <div>
              <label htmlFor="mock-exam-category" className="mb-2 block text-xs font-semibold text-muted-foreground">Loại đề thi</label>
              <select id="mock-exam-category" value={category} onChange={event => changeCategory(event.target.value as MockExamCategory)} className="h-11 w-full min-w-0 rounded-xl border border-border bg-card px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {MOCK_EXAM_CATEGORIES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </div>
            {category === 'topic' && (
              <div>
                <label htmlFor="mock-exam-topic" className="mb-2 block text-xs font-semibold text-muted-foreground">Chuyên đề</label>
                <select id="mock-exam-topic" value={selectedTopicId || 'all'} onChange={event => changeCategory('topic', event.target.value === 'all' ? null : event.target.value)} className="h-11 w-full min-w-0 rounded-xl border border-border bg-card px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <option value="all">Tất cả chuyên đề</option>
                  {selectedTopicId && !selectedTopicName && <option value={selectedTopicId}>Chuyên đề đã chọn</option>}
                  {topics.map(topic => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
                </select>
              </div>
            )}
          </div>

          <nav className="hidden rounded-2xl border border-border bg-card p-2 lg:block" aria-label="Danh mục đề thi thử">
            <p className="flex items-center gap-2 px-3 pb-3 pt-2 text-xs font-semibold text-muted-foreground"><FileText className="h-4 w-4" aria-hidden="true" />LOẠI ĐỀ THI</p>
            <div className="space-y-1">
              {MOCK_EXAM_CATEGORIES.filter(item => item.id !== 'topic').map(item => (
                <button key={item.id} type="button" aria-pressed={category === item.id} onClick={() => changeCategory(item.id)} className="study-chapter-button w-full rounded-xl px-3 py-3 text-left text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{item.label}</button>
              ))}
              <div>
                <button type="button" onClick={() => { if (category === 'topic') setTopicsOpen(open => !open); else { setTopicsOpen(true); changeCategory('topic'); } }} aria-expanded={topicsOpen} aria-controls="mock-exam-topics" aria-pressed={category === 'topic'} className="study-chapter-button flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="flex items-center gap-2"><FolderTree className="h-4 w-4" aria-hidden="true" />Chuyên đề</span>
                  <ChevronDown className={cn('h-4 w-4 shrink-0 motion-safe:transition-transform', topicsOpen && 'rotate-180')} aria-hidden="true" />
                </button>
                <div id="mock-exam-topics" hidden={!topicsOpen} className="ml-3 mt-2 space-y-1 border-l border-border pl-2">
                  <button type="button" aria-pressed={category === 'topic' && !selectedTopicId} onClick={() => changeCategory('topic')} className="study-chapter-button min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Tất cả chuyên đề</button>
                  {topics.map(topic => (
                    <button key={topic.id} type="button" aria-pressed={category === 'topic' && selectedTopicId === topic.id} onClick={() => changeCategory('topic', topic.id)} className="study-chapter-button min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm leading-5 [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{topic.name}</button>
                  ))}
                  {topics.length === 0 && <p className="px-3 py-2 text-xs leading-5 text-muted-foreground">Chưa có chuyên đề cho lớp này.</p>}
                </div>
              </div>
            </div>
          </nav>
        </aside>

        <section className="min-w-0" aria-labelledby="mock-exam-list-title">
          <div className="mb-5">
            <p className="mb-1 text-xs text-muted-foreground">Lớp {grade} · Các đề mới nhất trước</p>
            <h2 id="mock-exam-list-title" className="text-xl font-semibold leading-7 text-foreground [overflow-wrap:anywhere]">{activeCategoryLabel}</h2>
          </div>
          <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="min-w-0 flex-1">
              <label htmlFor="mock-exam-search" className="sr-only">Tìm đề trong danh mục</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id="mock-exam-search" type="search" value={query} onChange={event => updateFilters({ query: event.target.value })} placeholder="Tìm tên đề hoặc chuyên đề..." className="h-11 pl-9 pr-11 text-base [&::-webkit-search-cancel-button]:appearance-none" />
                {query && <button type="button" aria-label="Xóa tìm kiếm" onClick={() => updateFilters({ query: '' })} className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="h-4 w-4" aria-hidden="true" /></button>}
              </div>
            </div>
            <div role="group" aria-label="Lọc theo trạng thái làm bài" className="flex shrink-0 flex-wrap gap-2">
              {statusFilters.map(item => (
                <button key={item.id} type="button" aria-pressed={status === item.id} disabled={loading} onClick={() => updateFilters({ status: item.id })} className={cn('flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-50', status === item.id ? 'border-primary/35 bg-primary-soft text-primary' : 'border-border bg-card text-muted-foreground hover:bg-muted')}>
                  {item.label}<span className="text-xs tabular-nums">{loading ? '…' : item.count}</span>
                </button>
              ))}
            </div>
          </div>

          {loading ? <ExamCatalogLoading /> : exams.length === 0 ? (
            <div role="status" className="rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center">
              <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="font-medium text-foreground">Chưa có đề trong danh mục này</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{category === 'topic' ? 'Thử chọn chuyên đề khác hoặc xem tất cả chuyên đề của lớp.' : 'Bạn có thể chọn loại đề khác để tiếp tục luyện thi.'}</p>
              {category === 'topic' && selectedTopicId && <Button variant="outline" className="mt-4" onClick={() => changeCategory('topic')}>Xem tất cả chuyên đề</Button>}
            </div>
          ) : visibleExams.length === 0 ? (
            <div role="status" className="rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center">
              <p className="font-medium text-foreground">Không có đề phù hợp với bộ lọc</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Thử tên ngắn hơn, gõ không dấu hoặc đổi trạng thái làm bài.</p>
              <Button variant="outline" className="mt-4" onClick={() => updateFilters({ query: '', status: 'all' })}>Hiện tất cả đề trong danh mục</Button>
            </div>
          ) : (
            <>
              {(query || status !== 'all') && <p role="status" className="mb-3 text-xs text-muted-foreground">Hiển thị {visibleExams.length}/{exams.length} đề trong danh mục</p>}
              <TooltipProvider delayDuration={200}>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {visibleExams.map(exam => (
                    <ExamCatalogCard key={exam.id} exam={exam} attempts={attemptsByExam[exam.id] || []} topicName={exam.topic_id ? topicNameById[exam.topic_id] : null} formatTimeAgo={formatTimeAgo} onStart={startExamInFullscreen} onHistory={setSelectedExamForHistory} />
                  ))}
                </div>
              </TooltipProvider>
            </>
          )}
        </section>
      </div>

      <ExamHistoryDialog exam={selectedExamForHistory} attempts={selectedAttempts} bestScore={selectedBestScore} onClose={() => setSelectedExamForHistory(null)} formatDateTime={formatDateTime} formatDuration={formatDuration} />
    </div>
  );
}

export default function MockExamsPage() {
  return <Suspense fallback={<div className="study-page"><ExamCatalogLoading /></div>}><MockExamsContent /></Suspense>;
}
