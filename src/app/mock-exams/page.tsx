'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { StudyHeading } from '@/components/shared/study-heading';
import { MobileGradePicker } from '@/components/layout/mobile-grade-picker';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getSupabaseClient } from '@/lib/supabase/client';
import { FileText, Clock, Trophy, Play, RotateCcw, Eye, History, ArrowRight, Menu, ChevronDown, FolderTree, ListFilter, WandSparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { getMockExamCategoryLabel, isMockExamCategory, MOCK_EXAM_CATEGORIES, type MockExamCategory } from '@/features/mock-exams/exam-categories';

interface MockExamAttempt { id: string; exam_id: string; score: number; correct_count: number; total_questions: number; duration_used: number; created_at: string; }
interface MockExamTopic { id: string; name: string; grade: number; }

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
  const [exams, setExams] = useState<any[]>([]);
  const [topics, setTopics] = useState<MockExamTopic[]>([]);
  const [attemptsByExam, setAttemptsByExam] = useState<Record<string, MockExamAttempt[]>>({});
  const [selectedExamForHistory, setSelectedExamForHistory] = useState<any | null>(null);
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

      const examsData = examsResult.data || [];
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

  return (
    <div className="study-page">
      <StudyHeading eyebrow="Thi thử · Tự tin vào phòng thi" title={`Thi thử lớp ${grade}`} description="Chọn đề phù hợp, tập trung làm bài và nhìn lại những gì đã học.">
        <Button asChild variant="outline"><Link href="/personal-exams?source=mock-exams"><WandSparkles className="h-4 w-4" aria-hidden="true" />Tạo đề cá nhân</Link></Button>
      </StudyHeading>
      <div className="mb-5 md:hidden"><MobileGradePicker currentGrade={Number(grade)} hrefForGrade={(selectedGrade) => `/mock-exams?grade=${selectedGrade}`} /></div>

      <div className="mt-6 lg:hidden">
        <Card className="border-border bg-card shadow-soft"><CardContent className="space-y-3 p-4"><div className="flex items-center gap-2 text-sm font-bold text-foreground"><ListFilter className="h-4 w-4 text-primary" />Danh mục đề</div>
          <Select value={category} onValueChange={(value) => changeCategory(value as MockExamCategory)}><SelectTrigger className="h-11 bg-surface"><SelectValue /></SelectTrigger><SelectContent>{MOCK_EXAM_CATEGORIES.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select>
          {category === 'topic' && <Select value={selectedTopicId || 'all'} onValueChange={(value) => changeCategory('topic', value === 'all' ? null : value)}><SelectTrigger className="h-11 bg-surface"><SelectValue placeholder="Chọn chuyên đề" /></SelectTrigger><SelectContent><SelectItem value="all">Tất cả chuyên đề</SelectItem>{topics.map((topic) => <SelectItem key={topic.id} value={topic.id}>{topic.name}</SelectItem>)}</SelectContent></Select>}
        </CardContent></Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
        <aside className="hidden lg:block"><div className="sticky top-24 rounded-2xl border border-border bg-card p-3 shadow-soft"><p className="px-3 pb-2 pt-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Danh mục đề</p><nav className="space-y-1" aria-label="Danh mục đề thi thử">
          {MOCK_EXAM_CATEGORIES.filter((item) => item.id !== 'topic').map((item) => <button key={item.id} type="button" onClick={() => changeCategory(item.id)} className={cn('min-h-11 w-full rounded-xl px-3 text-left text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', category === item.id ? 'bg-primary text-primary-foreground shadow-card' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>{item.label}</button>)}
          <div><button type="button" onClick={() => { if (category === 'topic') setTopicsOpen((open) => !open); else { setTopicsOpen(true); changeCategory('topic'); } }} aria-expanded={topicsOpen} className={cn('flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', category === 'topic' ? 'bg-primary text-primary-foreground shadow-card' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}><span className="flex items-center gap-2"><FolderTree className="h-4 w-4" aria-hidden="true" />Chuyên đề</span><ChevronDown className={cn('h-4 w-4 transition-transform', topicsOpen && 'rotate-180')} aria-hidden="true" /></button>
            {topicsOpen && <div className="mt-1 space-y-1 border-l border-border pl-3"><button type="button" onClick={() => changeCategory('topic')} className={cn('min-h-10 w-full rounded-lg px-2 text-left text-sm font-medium transition-colors', category === 'topic' && !selectedTopicId ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}>Tất cả chuyên đề</button>{topics.map((topic) => <button key={topic.id} type="button" onClick={() => changeCategory('topic', topic.id)} className={cn('min-h-10 w-full rounded-lg px-2 text-left text-sm font-medium transition-colors', selectedTopicId === topic.id ? 'bg-primary-soft text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>{topic.name}</button>)}{topics.length === 0 && <p className="px-2 py-2 text-xs text-muted-foreground">Chưa có chuyên đề cho lớp này.</p>}</div>}
          </div>
        </nav></div></aside>

        <section className="min-w-0"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-foreground sm:text-2xl">{activeCategoryLabel}</h2><p className="mt-1 text-sm text-muted-foreground">{category === 'topic' && !selectedTopicId ? 'Chọn chuyên đề để lọc nhanh theo chương.' : 'Các đề được sắp xếp mới nhất trước.'}</p></div><Badge variant="outline" className="border-primary bg-primary-soft px-3 py-1.5 text-primary">{exams.length} đề</Badge></div>
          {loading ? <div className="py-20 text-center text-muted-foreground animate-pulse">Đang tải danh sách đề thi...</div> : exams.length === 0 ? <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center text-muted-foreground"><FileText className="mx-auto mb-4 h-12 w-12 opacity-25" /><p className="text-lg font-medium">Chưa có đề {activeCategoryLabel} cho Lớp {grade}.</p>{category === 'topic' && <p className="mt-2 text-sm">Bạn có thể chọn một chuyên đề khác hoặc quay lại sau.</p>}</div> : <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-2">
            {exams.map((exam) => {
              const examAttempts = attemptsByExam[exam.id] || [];
              const hasAttempt = examAttempts.length > 0;
              const bestScore = hasAttempt ? Math.max(...examAttempts.map((attempt) => attempt.score)) : 0;
              const latestAttempt = examAttempts[0];
              const topicName = exam.topic_id ? topicNameById[exam.topic_id] : null;
              return <Card key={exam.id} className="group flex h-full overflow-hidden rounded-2xl border-border bg-card shadow-soft transition-shadow hover:border-primary hover:shadow-card"><CardContent className="flex h-full w-full flex-col p-0"><div className="flex-1 p-5 sm:p-6"><div className="mb-4 flex flex-wrap items-center gap-2"><Badge variant="outline" className="border-primary bg-primary-soft px-2.5 py-1 text-primary"><Clock className="mr-1.5 h-3.5 w-3.5" />{exam.duration} phút</Badge>{topicName && <Badge variant="outline" className="border-border bg-muted px-2.5 py-1 text-muted-foreground">{topicName}</Badge>}</div><h3 className="text-lg font-bold leading-snug text-foreground transition-colors group-hover:text-primary sm:text-xl">{exam.title}</h3></div><div className="mt-auto flex items-center justify-between gap-3 border-t border-border bg-muted/60 p-4 sm:p-5">{hasAttempt ? <div className="min-w-0 pr-1"><div className="flex items-center gap-1.5 text-sm font-bold text-success"><Trophy className="h-4 w-4 shrink-0 text-warning" /><span className="truncate">Điểm cao nhất: {bestScore.toFixed(2)}</span></div><p className="mt-0.5 text-xs font-medium text-muted-foreground">Đã thi {examAttempts.length} lần · {formatTimeAgo(latestAttempt.created_at)}</p></div> : <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><FileText className="h-4 w-4 opacity-60" />Chưa làm bài</div>}<div className="flex shrink-0 items-center gap-2"><Button type="button" onClick={() => startExamInFullscreen(exam.id)} className="h-11 rounded-md bg-primary px-3 font-bold text-primary-foreground shadow-card sm:px-4">{hasAttempt ? <RotateCcw className="mr-1.5 h-4 w-4" /> : <Play className="mr-1.5 h-4 w-4 fill-current" />}<span>{hasAttempt ? 'Thi lại' : 'Bắt đầu'}</span></Button>{hasAttempt && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="icon" className="h-11 w-11 rounded-md border-border text-muted-foreground" aria-label="Tùy chọn đề thi"><Menu className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-56 rounded-xl border-border p-1.5 shadow-card"><DropdownMenuItem onClick={() => router.push(`/mock-exams/${exam.id}/result?attemptId=${latestAttempt.id}`)} className="cursor-pointer gap-2.5 rounded-lg px-3 py-2.5 font-semibold"><Eye className="h-4 w-4 text-primary" />Xem lần thi gần nhất</DropdownMenuItem><DropdownMenuItem onClick={() => setSelectedExamForHistory(exam)} className="cursor-pointer gap-2.5 rounded-lg px-3 py-2.5 font-semibold"><History className="h-4 w-4 text-muted-foreground" />Lịch sử ({examAttempts.length} lần)</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}</div></div></CardContent></Card>;
            })}
          </div>}
        </section>
      </div>

      <Dialog open={!!selectedExamForHistory} onOpenChange={(open) => !open && setSelectedExamForHistory(null)}><DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto rounded-2xl p-6"><DialogHeader><DialogTitle className="flex items-center gap-2 text-xl font-bold text-foreground"><History className="h-5 w-5 text-primary" />Lịch sử làm bài</DialogTitle><DialogDescription>{selectedExamForHistory?.title}</DialogDescription></DialogHeader><div className="mt-4 space-y-3">{selectedAttempts.map((attempt, index) => { const isLatest = index === 0; const isBest = attempt.score === selectedBestScore; return <div key={attempt.id} className={cn('flex flex-col justify-between gap-4 rounded-xl border p-4 sm:flex-row sm:items-center', isLatest ? 'border-primary bg-primary-soft' : 'border-border bg-muted')}><div><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-bold text-foreground">Lượt thi #{selectedAttempts.length - index}</span>{isLatest && <Badge className="border-0 bg-primary text-xs text-primary-foreground">Mới nhất</Badge>}{isBest && <Badge className="border-0 bg-warning-soft text-xs text-warning">Cao nhất</Badge>}</div><p className="mt-1 text-xs text-muted-foreground">{formatDateTime(attempt.created_at)} · {formatDuration(attempt.duration_used)}</p></div><div className="flex items-center justify-between gap-4 border-t border-border pt-3 sm:border-0 sm:pt-0"><div className="text-right"><p className="text-xl font-bold text-foreground">{attempt.score.toFixed(2)}<span className="text-xs font-normal text-muted-foreground">/10</span></p><p className="text-xs font-medium text-success">{attempt.correct_count}/{attempt.total_questions} câu đúng</p></div><Link href={`/mock-exams/${selectedExamForHistory.id}/result?attemptId=${attempt.id}`}><Button size="sm" className="h-11 rounded-md bg-muted px-3 font-semibold text-foreground hover:bg-muted">Xem chi tiết <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button></Link></div></div>; })}</div></DialogContent></Dialog>
    </div>
  );
}

export default function MockExamsPage() {
  return <Suspense fallback={<div className="container max-w-6xl py-8"><p>Đang tải danh sách bài thi...</p></div>}><MockExamsContent /></Suspense>;
}
