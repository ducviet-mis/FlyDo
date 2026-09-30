'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowLeft, BookOpen, Check, Clock3, Crown, FilePlus2, Layers3, LockKeyhole, Save, Sparkles, WandSparkles } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { getEffectiveAccountTier } from '@/features/subscription/utils';
import {
  DEFAULT_LEVEL_WEIGHTS,
  LEVEL_META,
  buildPersonalExam,
  createPersonalExamSession,
  formatMinutes,
  getEstimatedSeconds,
  getLevelQuestionNeeds,
  personalExamStorageKey,
  sumWeights,
} from '@/features/personal-exams/utils';
import type { ChapterWeight, LevelWeights, PersonalExamConfig, PersonalExamLevel, PersonalExamMode, PersonalExamQuestion, PersonalExamTemplate } from '@/features/personal-exams/types';
import { cn } from '@/lib/utils';

type PracticeLessonRow = { id: string; grade: number; chapter: string; title: string; chapter_sort_order?: number | null; sort_order?: number | null };
type PracticeQuestionCountRow = { lesson_id: string; difficulty_level: number };

function equalChapterWeights(chapters: string[]): ChapterWeight[] {
  if (chapters.length === 0) return [];
  const base = Math.floor(100 / chapters.length);
  return chapters.map((chapter, index) => ({
    chapter,
    weight: base + (index === chapters.length - 1 ? 100 - base * chapters.length : 0),
  }));
}

function parseTemplate(row: any): PersonalExamTemplate | null {
  if (!row?.id || !Array.isArray(row.chapter_weights) || !row.level_weights) return null;
  const levelWeights = row.level_weights as LevelWeights;
  if (![1, 2, 3, 4].every((level) => Number.isFinite(Number(levelWeights[level as PersonalExamLevel])))) return null;
  return {
    id: row.id,
    title: row.name || 'Mẫu đề chưa đặt tên',
    grade: Number(row.grade),
    mode: row.mode === 'practice' ? 'practice' : 'exam',
    chapterWeights: row.chapter_weights as ChapterWeight[],
    levelWeights: {
      1: Number(levelWeights[1]),
      2: Number(levelWeights[2]),
      3: Number(levelWeights[3]),
      4: Number(levelWeights[4]),
    },
    questionCount: Number(row.question_count),
    durationMinutes: Number(row.duration_minutes),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function PersonalExamBuilder() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, initialized } = useAuthStore();
  const accountTier = getEffectiveAccountTier(user);
  const hasAccess = accountTier === 'flymax' || accountTier === 'flyinfinity';
  const source = searchParams.get('source') === 'practice' ? 'practice' : 'mock-exams';
  const initialGrade = Number(searchParams.get('grade')) || 8;

  const [grade, setGrade] = useState(initialGrade);
  const [mode, setMode] = useState<PersonalExamMode>(source === 'practice' ? 'practice' : 'exam');
  const [title, setTitle] = useState('Đề cá nhân của tôi');
  const [questionCount, setQuestionCount] = useState(30);
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [chapterWeights, setChapterWeights] = useState<ChapterWeight[]>([]);
  const [levelWeights, setLevelWeights] = useState<LevelWeights>(DEFAULT_LEVEL_WEIGHTS);
  const [lessons, setLessons] = useState<PracticeLessonRow[]>([]);
  const [questionCounts, setQuestionCounts] = useState<PracticeQuestionCountRow[]>([]);
  const [loadingBank, setLoadingBank] = useState(false);
  const [templates, setTemplates] = useState<PersonalExamTemplate[]>([]);
  const [templatesAvailable, setTemplatesAvailable] = useState(true);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success' | 'info'; text: string } | null>(null);
  const pendingTemplateRef = useRef<PersonalExamTemplate | null>(null);

  const loadTemplates = useCallback(async () => {
    if (!user?.id || !hasAccess) return;
    setLoadingTemplates(true);
    const { data, error } = await getSupabaseClient()
      .from('personal_exam_templates')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      if (error.code === '42P01') setTemplatesAvailable(false);
      else setFeedback({ type: 'error', text: 'Không thể tải mẫu đề đã lưu. Bạn vẫn có thể tạo đề mới.' });
      setLoadingTemplates(false);
      return;
    }

    setTemplatesAvailable(true);
    setTemplates((data || []).map(parseTemplate).filter((item: PersonalExamTemplate | null): item is PersonalExamTemplate => Boolean(item)));
    setLoadingTemplates(false);
  }, [hasAccess, user?.id]);

  useEffect(() => {
    if (hasAccess) void loadTemplates();
  }, [hasAccess, loadTemplates]);

  useEffect(() => {
    if (!hasAccess) return;
    let cancelled = false;

    async function loadBankOverview() {
      setLoadingBank(true);
      setFeedback(null);
      const supabase = getSupabaseClient();
      const { data: lessonData, error: lessonError } = await supabase
        .from('practice_lessons')
        .select('id, grade, chapter, title, chapter_sort_order, sort_order')
        .eq('grade', grade)
        .order('chapter_sort_order')
        .order('chapter')
        .order('sort_order')
        .order('title');

      if (cancelled) return;
      if (lessonError) {
        setFeedback({ type: 'error', text: 'Không thể đọc ngân hàng Tự luyện. Vui lòng thử lại sau.' });
        setLessons([]);
        setQuestionCounts([]);
        setLoadingBank(false);
        return;
      }

      const nextLessons = (lessonData || []) as PracticeLessonRow[];
      setLessons(nextLessons);
      const chapterNames = Array.from(new Set(nextLessons.map((lesson) => lesson.chapter)));
      const pendingTemplate = pendingTemplateRef.current;
      if (pendingTemplate?.grade === grade) {
        const templateWeightByChapter = new Map(pendingTemplate.chapterWeights.map((item) => [item.chapter, item.weight]));
        setChapterWeights(chapterNames.map((chapter) => ({ chapter, weight: templateWeightByChapter.get(chapter) || 0 })));
        pendingTemplateRef.current = null;
      } else {
        setChapterWeights(equalChapterWeights(chapterNames));
      }

      if (nextLessons.length === 0) {
        setQuestionCounts([]);
        setLoadingBank(false);
        return;
      }

      const { data: countData, error: countError } = await supabase
        .from('practice_questions')
        .select('lesson_id, difficulty_level')
        .in('lesson_id', nextLessons.map((lesson) => lesson.id));

      if (cancelled) return;
      if (countError) setFeedback({ type: 'error', text: 'Không thể đọc số lượng câu hỏi trong ngân hàng.' });
      setQuestionCounts((countData || []) as PracticeQuestionCountRow[]);
      setLoadingBank(false);
    }

    void loadBankOverview();
    return () => { cancelled = true; };
  }, [grade, hasAccess]);

  const chapters = useMemo(() => Array.from(new Set(lessons.map((lesson) => lesson.chapter))), [lessons]);
  const lessonChapterById = useMemo(() => new Map(lessons.map((lesson) => [lesson.id, lesson.chapter])), [lessons]);
  const selectedChapterWeights = chapterWeights.filter((item) => item.weight > 0);
  const selectedChapters = useMemo(() => new Set(chapterWeights.filter((item) => item.weight > 0).map((item) => item.chapter)), [chapterWeights]);
  const chapterPercent = sumWeights(chapterWeights);
  const levelPercent = sumWeights(levelWeights);
  const levelNeeds = useMemo(() => getLevelQuestionNeeds(questionCount, levelWeights), [questionCount, levelWeights]);
  const availableByLevel = useMemo(() => {
    const countByLevel: Record<PersonalExamLevel, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    questionCounts.forEach((question) => {
      const chapter = lessonChapterById.get(question.lesson_id);
      const level = question.difficulty_level as PersonalExamLevel;
      if (chapter && selectedChapters.has(chapter) && level >= 1 && level <= 4) countByLevel[level] += 1;
    });
    return countByLevel;
  }, [lessonChapterById, questionCounts, selectedChapters]);
  const totalAvailable = Object.values(availableByLevel).reduce((sum, count) => sum + count, 0);
  const insufficientLevels = ([1, 2, 3, 4] as PersonalExamLevel[]).filter((level) => availableByLevel[level] < (levelNeeds.get(level) || 0));
  const configValid = selectedChapterWeights.length > 0
    && chapterPercent === 100
    && levelPercent === 100
    && totalAvailable >= questionCount
    && insufficientLevels.length === 0;
  const estimatedSeconds = getEstimatedSeconds(questionCount, levelWeights);

  const getConfig = (): PersonalExamConfig => ({
    title: title.trim() || `Đề Toán lớp ${grade} cá nhân`,
    grade,
    mode,
    chapterWeights: selectedChapterWeights,
    levelWeights,
    questionCount,
    durationMinutes,
  });

  const updateChapterWeight = (chapter: string, nextWeight: number) => {
    setChapterWeights((current) => current.map((item) => item.chapter === chapter ? { ...item, weight: Math.max(0, Math.min(100, Number.isFinite(nextWeight) ? nextWeight : 0)) } : item));
  };

  const toggleChapter = (chapter: string, checked: boolean) => {
    setChapterWeights((current) => current.map((item) => item.chapter === chapter ? { ...item, weight: checked ? Math.max(item.weight, 1) : 0 } : item));
  };

  const updateLevelWeight = (level: PersonalExamLevel, nextWeight: number) => {
    setLevelWeights((current) => ({ ...current, [level]: Math.max(0, Math.min(100, Number.isFinite(nextWeight) ? nextWeight : 0)) }));
  };

  const applyTemplate = (template: PersonalExamTemplate) => {
    if (template.grade !== grade) pendingTemplateRef.current = template;
    else setChapterWeights(template.chapterWeights);
    setGrade(template.grade);
    setMode(template.mode);
    setTitle(template.title);
    setQuestionCount(template.questionCount);
    setDurationMinutes(template.durationMinutes);
    setChapterWeights(template.chapterWeights);
    setLevelWeights(template.levelWeights);
    setFeedback({ type: 'success', text: `Đã nạp mẫu “${template.title}”. Hãy kiểm tra ngân hàng câu hỏi rồi tạo đề.` });
  };

  const saveTemplate = async () => {
    if (!user?.id) return;
    if (!title.trim()) {
      setFeedback({ type: 'error', text: 'Hãy đặt tên mẫu đề trước khi lưu.' });
      return;
    }
    if (!configValid) {
      setFeedback({ type: 'error', text: 'Hãy hoàn tất các tỉ lệ 100% và chọn cấu hình có đủ câu hỏi trước khi lưu.' });
      return;
    }
    if (!templatesAvailable) {
      setFeedback({ type: 'info', text: 'Phần lưu mẫu chưa sẵn sàng. Hãy chạy tệp SQL Supabase đi kèm trước.' });
      return;
    }

    setIsSaving(true);
    const config = getConfig();
    const { error } = await getSupabaseClient()
      .from('personal_exam_templates')
      .upsert({
        user_id: user.id,
        name: config.title,
        grade: config.grade,
        mode: config.mode,
        chapter_weights: config.chapterWeights,
        level_weights: config.levelWeights,
        question_count: config.questionCount,
        duration_minutes: config.durationMinutes,
      }, { onConflict: 'user_id,name' });

    setIsSaving(false);
    if (error) {
      setFeedback({ type: 'error', text: error.code === '42P01' ? 'Hãy chạy SQL để bật phần lưu mẫu đề.' : 'Không thể lưu mẫu đề. Vui lòng thử lại.' });
      if (error.code === '42P01') setTemplatesAvailable(false);
      return;
    }
    setFeedback({ type: 'success', text: 'Đã lưu mẫu đề. Bạn có thể dùng lại để tạo một đề mới bất cứ lúc nào.' });
    void loadTemplates();
  };

  const createExam = async () => {
    if (!configValid) {
      setFeedback({ type: 'error', text: 'Cấu hình chưa hợp lệ. Kiểm tra tổng tỉ lệ và số câu có sẵn ở từng Level.' });
      return;
    }

    setIsCreating(true);
    setFeedback(null);
    const config = getConfig();
    const selectedLessonIds = lessons
      .filter((lesson) => selectedChapters.has(lesson.chapter))
      .map((lesson) => lesson.id);
    const { data, error } = await getSupabaseClient()
      .from('practice_questions')
      .select('id, lesson_id, content, options, correct_answer, solution, has_math, difficulty_level, diagram')
      .in('lesson_id', selectedLessonIds);

    if (error) {
      setIsCreating(false);
      setFeedback({ type: 'error', text: 'Không thể lấy câu hỏi từ ngân hàng Tự luyện. Vui lòng thử lại.' });
      return;
    }

    const questions: PersonalExamQuestion[] = (data || []).flatMap((question: any) => {
      const chapter = lessonChapterById.get(question.lesson_id);
      const level = Number(question.difficulty_level) as PersonalExamLevel;
      if (!chapter || level < 1 || level > 4 || !Array.isArray(question.options)) return [];
      return [{
        id: question.id,
        lessonId: question.lesson_id,
        chapter,
        content: question.content,
        options: question.options,
        correctAnswer: question.correct_answer,
        solution: question.solution || '',
        hasMath: Boolean(question.has_math),
        difficultyLevel: level,
        diagram: question.diagram,
      }];
    });

    try {
      const built = buildPersonalExam(config, questions);
      const session = createPersonalExamSession(config, built.questions);
      window.sessionStorage.setItem(personalExamStorageKey(session.id), JSON.stringify(session));
      if (built.warnings.length > 0) window.sessionStorage.setItem(`${personalExamStorageKey(session.id)}:warnings`, JSON.stringify(built.warnings));
      router.push(`/personal-exams/take?session=${encodeURIComponent(session.id)}`);
    } catch (error) {
      setFeedback({ type: 'error', text: error instanceof Error ? error.message : 'Không thể tạo đề với cấu hình này.' });
      setIsCreating(false);
    }
  };

  if (!initialized) return <div className="container py-24 text-center text-muted-foreground">Đang kiểm tra quyền truy cập...</div>;

  if (!user) {
    return <div className="container max-w-2xl py-10 md:py-16"><Card className="overflow-hidden border-primary/30 bg-card shadow-card"><CardContent className="p-7 text-center sm:p-10"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary"><LockKeyhole className="h-7 w-7" /></div><h1 className="mt-5 text-2xl font-bold text-foreground">Đăng nhập để tạo đề cá nhân</h1><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">Tạo đề từ ngân hàng Tự luyện, phân bổ theo chương và Level rồi lưu mẫu đề của riêng bạn.</p><Button asChild className="mt-6 h-11"><Link href="/login">Đăng nhập</Link></Button></CardContent></Card></div>;
  }

  if (!hasAccess) {
    return <div className="container max-w-2xl py-10 md:py-16"><Card className="overflow-hidden border-primary/30 bg-card shadow-card"><CardContent className="p-7 text-center sm:p-10"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-warning-soft text-warning"><Crown className="h-7 w-7" /></div><Badge className="mt-5 bg-primary-soft text-primary">Đặc quyền FlyMax & FlyInfinity</Badge><h1 className="mt-3 text-2xl font-bold text-foreground">Tạo đề cá nhân theo đúng mục tiêu của bạn</h1><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Bạn có thể chọn lớp, chương, tỉ lệ Level, thời gian và lưu mẫu đề. Câu hỏi luôn lấy từ ngân hàng Tự luyện FlyDo.</p><div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row"><Button asChild className="h-11"><Link href="/pricing"><Crown className="mr-2 h-4 w-4" />Xem gói FlyMax</Link></Button><Button asChild variant="outline" className="h-11"><Link href={source === 'practice' ? '/practice?grade=8' : '/mock-exams?grade=8'}><ArrowLeft className="mr-2 h-4 w-4" />Quay lại</Link></Button></div></CardContent></Card></div>;
  }

  return (
    <main className="container max-w-6xl py-5 md:py-8">
      <PageHeader title="Tạo đề cá nhân" description="Tự cấu hình đề từ ngân hàng Tự luyện — đúng chương, đúng Level và đúng thời gian bạn muốn.">
        <Badge className="bg-primary-soft px-3 py-1.5 text-primary"><Crown className="mr-1.5 h-3.5 w-3.5" />FlyMax / FlyInfinity</Badge>
        <Button asChild variant="ghost" className="h-11"><Link href={source === 'practice' ? `/practice?grade=${grade}` : `/mock-exams?grade=${grade}`}><ArrowLeft className="mr-2 h-4 w-4" />Quay lại</Link></Button>
      </PageHeader>

      <Card className="mb-6 overflow-hidden border-primary/25 bg-gradient-to-br from-primary-soft via-card to-card shadow-card">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"><div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-card"><WandSparkles className="h-5 w-5" /></div><div><p className="text-sm font-bold text-foreground">Đề tạo mới từ ngân hàng Tự luyện</p><p className="mt-1 text-sm leading-5 text-muted-foreground">Hệ thống trộn câu ngẫu nhiên trong đúng phạm vi bạn chọn, vì vậy mỗi lần tạo là một đề mới.</p></div></div><Badge variant="outline" className="w-fit border-primary/30 bg-card px-3 py-1.5 text-primary"><Layers3 className="mr-1.5 h-4 w-4" />{totalAvailable} câu phù hợp</Badge></CardContent>
      </Card>

      {feedback && <div role="status" className={cn('mb-6 flex items-start gap-3 rounded-xl border p-4 text-sm leading-6', feedback.type === 'error' && 'border-destructive/30 bg-destructive-soft text-destructive', feedback.type === 'success' && 'border-success/30 bg-success-soft text-success', feedback.type === 'info' && 'border-primary/30 bg-primary-soft text-primary')}><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{feedback.text}</div>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="space-y-6">
          <Card><CardHeader className="p-5 pb-4"><CardTitle className="flex items-center gap-2 text-lg"><FilePlus2 className="h-5 w-5 text-primary" />1. Thông tin đề</CardTitle><CardDescription>Chọn cách bạn muốn làm đề và đặt tên để dễ lưu mẫu.</CardDescription></CardHeader><CardContent className="grid gap-4 p-5 pt-0 sm:grid-cols-2"><label className="space-y-2 sm:col-span-2"><span className="text-sm font-bold text-foreground">Tên mẫu đề</span><Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} placeholder="Ví dụ: Ôn thi giữa kỳ tuần 1" /></label><label className="space-y-2"><span className="text-sm font-bold text-foreground">Lớp</span><Select value={String(grade)} onValueChange={(value) => setGrade(Number(value))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[6, 7, 8, 9].map((item) => <SelectItem key={item} value={String(item)}>Lớp {item}</SelectItem>)}</SelectContent></Select></label><div className="space-y-2"><span className="text-sm font-bold text-foreground">Kiểu làm bài</span><div className="grid grid-cols-2 rounded-xl border border-border bg-surface p-1"><button type="button" onClick={() => setMode('practice')} className={cn('min-h-11 rounded-lg px-2 text-sm font-bold transition-colors', mode === 'practice' ? 'bg-primary text-primary-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground')}>Tự luyện</button><button type="button" onClick={() => setMode('exam')} className={cn('min-h-11 rounded-lg px-2 text-sm font-bold transition-colors', mode === 'exam' ? 'bg-primary text-primary-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground')}>Thi thử</button></div></div></CardContent></Card>

          <Card><CardHeader className="p-5 pb-4"><CardTitle className="flex flex-wrap items-center gap-2 text-lg"><BookOpen className="h-5 w-5 text-primary" />2. Chương cần luyện <Badge variant={chapterPercent === 100 ? 'success' : 'warning'}>{chapterPercent}/100%</Badge></CardTitle><CardDescription>Chỉ các chương đang được chọn mới được dùng để tạo đề.</CardDescription></CardHeader><CardContent className="space-y-3 p-5 pt-0">{loadingBank ? <p className="py-5 text-sm text-muted-foreground">Đang đọc ngân hàng câu hỏi...</p> : chapters.length === 0 ? <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">Chưa có bài tự luyện cho lớp này.</p> : <><div className="grid gap-2 sm:grid-cols-2">{chapters.map((chapter) => { const current = chapterWeights.find((item) => item.chapter === chapter)?.weight || 0; const count = questionCounts.filter((item) => lessonChapterById.get(item.lesson_id) === chapter).length; return <div key={chapter} className={cn('flex min-h-14 items-center gap-3 rounded-xl border p-3 transition-colors', current > 0 ? 'border-primary/35 bg-primary-soft/40' : 'border-border bg-surface')}><input id={`chapter-${chapter}`} type="checkbox" checked={current > 0} onChange={(event) => toggleChapter(chapter, event.target.checked)} className="h-4 w-4 accent-primary" /><label htmlFor={`chapter-${chapter}`} className="min-w-0 flex-1 cursor-pointer"><span className="block truncate text-sm font-bold text-foreground">{chapter}</span><span className="block text-xs text-muted-foreground">{count} câu</span></label><div className="flex shrink-0 items-center gap-1"><Input aria-label={`Tỉ lệ ${chapter}`} type="number" min={0} max={100} value={current} onChange={(event) => updateChapterWeight(chapter, Number(event.target.value))} className="h-10 w-16 px-2 text-center text-sm font-bold" /><span className="text-xs text-muted-foreground">%</span></div></div>; })}</div><div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/70 p-3"><p className={cn('text-sm font-bold', chapterPercent === 100 ? 'text-success' : 'text-warning')}>Tổng tỉ lệ chương: {chapterPercent}%</p><Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => setChapterWeights(equalChapterWeights(chapters))}>Chia đều</Button></div></>}</CardContent></Card>

          <Card><CardHeader className="p-5 pb-4"><CardTitle className="flex flex-wrap items-center gap-2 text-lg"><Sparkles className="h-5 w-5 text-primary" />3. Độ khó & thời lượng <Badge variant={levelPercent === 100 ? 'success' : 'warning'}>{levelPercent}/100%</Badge></CardTitle><CardDescription>Level được giữ đúng tỉ lệ; thời lượng dưới đây là thời lượng đề bạn chọn.</CardDescription></CardHeader><CardContent className="space-y-4 p-5 pt-0"><div className="grid gap-3 sm:grid-cols-2">{([1, 2, 3, 4] as PersonalExamLevel[]).map((level) => { const need = levelNeeds.get(level) || 0; const available = availableByLevel[level]; return <div key={level} className={cn('rounded-xl border p-4', available < need ? 'border-destructive/40 bg-destructive-soft/40' : 'border-border bg-surface')}><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-foreground">{LEVEL_META[level].label}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{LEVEL_META[level].target}</p></div><div className="flex items-center gap-1"><Input aria-label={`Tỉ lệ ${LEVEL_META[level].label}`} type="number" min={0} max={100} value={levelWeights[level]} onChange={(event) => updateLevelWeight(level, Number(event.target.value))} className="h-10 w-16 px-2 text-center text-sm font-bold" /><span className="text-xs text-muted-foreground">%</span></div></div><p className={cn('mt-3 text-xs font-semibold', available < need ? 'text-destructive' : 'text-muted-foreground')}>Cần {need} câu · Có {available} câu</p></div>; })}</div><div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2"><label className="space-y-2"><span className="text-sm font-bold text-foreground">Số câu hỏi</span><Select value={String(questionCount)} onValueChange={(value) => setQuestionCount(Number(value))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[10, 20, 30, 40, 50].map((value) => <SelectItem key={value} value={String(value)}>{value} câu</SelectItem>)}</SelectContent></Select></label><label className="space-y-2"><span className="text-sm font-bold text-foreground">{mode === 'exam' ? 'Thời gian làm bài' : 'Thời lượng gợi ý'}</span><Select value={String(durationMinutes)} onValueChange={(value) => setDurationMinutes(Number(value))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[15, 30, 45, 60, 90, 120].map((value) => <SelectItem key={value} value={String(value)}>{value} phút</SelectItem>)}</SelectContent></Select></label></div><div className="flex items-start gap-2 rounded-xl bg-primary-soft/60 p-3 text-sm text-primary"><Clock3 className="mt-0.5 h-4 w-4 shrink-0" /><span>Ước tính theo độ khó: <strong>{formatMinutes(estimatedSeconds)}</strong>. {mode === 'exam' ? 'Đề thi thử sẽ có đồng hồ đếm ngược.' : 'Tự luyện không ép thời gian, để bạn tập trung vào lời giải.'}</span></div>{insufficientLevels.length > 0 && <p className="text-sm font-semibold text-destructive">Chưa đủ câu cho {insufficientLevels.map((level) => `Level ${level}`).join(', ')}. Hãy đổi tỉ lệ hoặc chọn thêm chương.</p>}</CardContent></Card>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <Card className="border-primary/30 shadow-card"><CardHeader className="p-5 pb-3"><CardTitle className="text-lg">Tóm tắt đề</CardTitle><CardDescription>Kiểm tra nhanh trước khi tạo.</CardDescription></CardHeader><CardContent className="space-y-3 p-5 pt-0"><div className="grid grid-cols-2 gap-2 text-sm"><div className="rounded-xl bg-muted p-3"><span className="block text-xs text-muted-foreground">Lớp</span><strong className="mt-1 block text-foreground">Lớp {grade}</strong></div><div className="rounded-xl bg-muted p-3"><span className="block text-xs text-muted-foreground">Hình thức</span><strong className="mt-1 block text-foreground">{mode === 'exam' ? 'Thi thử' : 'Tự luyện'}</strong></div><div className="rounded-xl bg-muted p-3"><span className="block text-xs text-muted-foreground">Số câu</span><strong className="mt-1 block text-foreground">{questionCount} câu</strong></div><div className="rounded-xl bg-muted p-3"><span className="block text-xs text-muted-foreground">Thời lượng</span><strong className="mt-1 block text-foreground">{durationMinutes} phút</strong></div></div><div className="border-t border-border pt-3 text-sm"><div className="flex justify-between gap-3"><span className="text-muted-foreground">Chương</span><strong className={chapterPercent === 100 ? 'text-success' : 'text-warning'}>{chapterPercent}/100%</strong></div><div className="mt-2 flex justify-between gap-3"><span className="text-muted-foreground">Level</span><strong className={levelPercent === 100 ? 'text-success' : 'text-warning'}>{levelPercent}/100%</strong></div><div className="mt-2 flex justify-between gap-3"><span className="text-muted-foreground">Câu phù hợp</span><strong className={totalAvailable >= questionCount ? 'text-success' : 'text-destructive'}>{totalAvailable}/{questionCount}</strong></div></div><Button type="button" className="h-12 w-full font-bold shadow-card" disabled={!configValid || isCreating || loadingBank} onClick={() => void createExam()}>{isCreating ? 'Đang tạo đề...' : <><WandSparkles className="mr-2 h-4 w-4" />Tạo đề & bắt đầu</>}</Button><Button type="button" variant="outline" className="h-11 w-full" disabled={!configValid || isSaving} onClick={() => void saveTemplate()}>{isSaving ? 'Đang lưu...' : <><Save className="mr-2 h-4 w-4" />Lưu mẫu đề</>}</Button>{!configValid && <p className="text-center text-xs leading-5 text-muted-foreground">Nút tạo đề sẽ mở khi hai tỉ lệ đều đủ 100% và ngân hàng có đủ câu.</p>}</CardContent></Card>

          <Card level="supporting"><CardHeader className="p-5 pb-3"><CardTitle className="flex items-center gap-2 text-base"><Save className="h-4 w-4 text-primary" />Mẫu đề đã lưu</CardTitle></CardHeader><CardContent className="space-y-3 p-5 pt-0">{!templatesAvailable ? <div className="rounded-xl border border-dashed border-border p-3 text-sm leading-5 text-muted-foreground">Chạy SQL đi kèm để bật lưu mẫu đề.</div> : loadingTemplates ? <p className="text-sm text-muted-foreground">Đang tải mẫu đề...</p> : templates.length === 0 ? <p className="text-sm leading-5 text-muted-foreground">Chưa có mẫu nào. Lưu một cấu hình để dùng lại nhanh.</p> : templates.slice(0, 5).map((template) => <button key={template.id} type="button" onClick={() => applyTemplate(template)} className="w-full rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:border-primary hover:bg-primary-soft"><span className="block truncate text-sm font-bold text-foreground">{template.title}</span><span className="mt-1 block text-xs text-muted-foreground">Lớp {template.grade} · {template.questionCount} câu · {template.durationMinutes} phút</span></button>)}</CardContent></Card>
        </aside>
      </div>
    </main>
  );
}

export default function PersonalExamPage() {
  return <Suspense fallback={<div className="container py-24 text-center text-muted-foreground">Đang mở trình tạo đề...</div>}><PersonalExamBuilder /></Suspense>;
}
