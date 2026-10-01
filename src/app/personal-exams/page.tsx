'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowLeft, BookOpen, CheckCircle2, Clock3, Crown, FilePlus2, Loader2, RefreshCw, Save, SlidersHorizontal, WandSparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { getEffectiveAccountTier } from '@/features/subscription/utils';
import { loadPersonalExamBank, loadPersonalExamQuestions, type PersonalExamBank } from '@/features/personal-exams/bank';
import { ChapterScope } from '@/features/personal-exams/components/chapter-scope';
import { DEFAULT_LEVEL_WEIGHTS, PERSONAL_EXAM_LEVELS, LEVEL_META, LEVEL_PRESETS, activePersonalExamKey, buildPersonalExam, createPersonalExamSession, equalChapterWeights, formatMinutes, getEstimatedSeconds, getPersonalExamPlan, parsePersonalExamTemplate, personalExamStorageKey, pickPersonalExamCandidateIds, sumWeights } from '@/features/personal-exams/utils';
import { parsePersonalExamSession } from '@/features/personal-exams/validate-session';
import type { ChapterWeight, LevelWeights, PersonalExamConfig, PersonalExamMode, PersonalExamSession, PersonalExamTemplate } from '@/features/personal-exams/types';
import { cn } from '@/lib/utils';

const selectClass = 'h-11 w-full min-w-0 rounded-xl border border-border bg-card px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
type BankState = { grade: number; owner: string; data: PersonalExamBank | null; error: string };
type Feedback = { type: 'error' | 'success'; text: string; focus?: boolean };

function PersonalExamBuilder() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, initialized } = useAuthStore();
  const ownerId = user?.id;
  const hasAccess = ['flymax', 'flyinfinity'].includes(getEffectiveAccountTier(user));
  const source = searchParams.get('source') === 'practice' ? 'practice' : 'mock-exams';
  const requestedGrade = Number(searchParams.get('grade'));
  const [grade, setGrade] = useState([6, 7, 8, 9].includes(requestedGrade) ? requestedGrade : 8);
  const [mode, setMode] = useState<PersonalExamMode>(source === 'practice' ? 'practice' : 'exam');
  const [title, setTitle] = useState('Đề cá nhân của tôi');
  const [questionCount, setQuestionCount] = useState(30);
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [chapterWeights, setChapterWeights] = useState<ChapterWeight[]>([]);
  const [levelWeights, setLevelWeights] = useState<LevelWeights>({ ...DEFAULT_LEVEL_WEIGHTS });
  const [bankState, setBankState] = useState<BankState | null>(null);
  const [reload, setReload] = useState(0);
  const [templateState, setTemplateState] = useState<{ owner: string; rows: PersonalExamTemplate[]; available: boolean; loading: boolean; error: string; warning?: string }>({ owner: '', rows: [], available: true, loading: false, error: '' });
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState<'create' | 'save' | null>(null);
  const [overwriteOpen, setOverwriteOpen] = useState(false);
  const [replaceDraftOpen, setReplaceDraftOpen] = useState(false);
  const [activeDraft, setActiveDraft] = useState<PersonalExamSession | null>(null);
  const pendingTemplateRef = useRef<PersonalExamTemplate | null>(null);
  const actionVersion = useRef(0);
  const busyRef = useRef<'create' | 'save' | null>(null);
  const templateVersion = useRef(0);
  const feedbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const actions = actionVersion, templates = templateVersion;
    actions.current++;
    busyRef.current = null;
    // Cancel asynchronous actions when the external auth identity changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBusy(null);
    return () => { actions.current++; templates.current++; };
  }, [user?.id, hasAccess]);
  useEffect(() => { if (feedback?.focus) feedbackRef.current?.focus(); }, [feedback]);
  useEffect(() => {
    if (!user?.id || !hasAccess) return;
    try {
      const id = window.sessionStorage.getItem(activePersonalExamKey(user.id));
      const draft = id ? parsePersonalExamSession(window.sessionStorage.getItem(personalExamStorageKey(id)), id, user.id) : null;
      // Restore account-scoped browser data only, never an arbitrary last paper.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveDraft(draft?.submittedAt ? null : draft);
    } catch { setActiveDraft(null); }
  }, [hasAccess, user?.id]);

  const loadTemplates = useCallback(async () => {
    if (!ownerId || !hasAccess) return;
    const owner = ownerId;
    const version = ++templateVersion.current;
    setTemplateState(current => ({ owner, rows: current.owner === owner ? current.rows : [], available: true, loading: true, error: '' }));
    try {
      const { data, error } = await getSupabaseClient().from('personal_exam_templates').select('*').eq('user_id', owner).order('updated_at', { ascending: false });
      if (version !== templateVersion.current) return;
      if (error) {
        const missing = ['42P01', 'PGRST205'].includes(error.code);
        setTemplateState({ owner, rows: [], available: !missing, loading: false, error: missing ? 'Lưu mẫu chưa được bật. Bạn vẫn có thể tạo và làm đề.' : 'Chưa tải được mẫu đã lưu. Hãy thử tải lại.' });
      } else {
        const rows = (data || []).map(parsePersonalExamTemplate).filter((row: PersonalExamTemplate | null): row is PersonalExamTemplate => !!row);
        setTemplateState({ owner, rows, available: true, loading: false, error: '', warning: rows.length < (data || []).length ? 'Một số mẫu cũ có cấu hình không hợp lệ nên không được nạp. Những mẫu hợp lệ vẫn dùng được.' : '' });
      }
    } catch {
      if (version === templateVersion.current) setTemplateState({ owner, rows: [], available: true, loading: false, error: 'Chưa tải được mẫu đã lưu. Hãy kiểm tra kết nối và thử lại.' });
    }
  }, [hasAccess, ownerId]);
  // Fetch account-owned templates, including their external loading state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadTemplates(); }, [loadTemplates]);

  useEffect(() => {
    if (!hasAccess || !user?.id) return;
    let cancelled = false;
    const owner = user.id;
    // Invalidate the external bank before a new asynchronous request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBankState({ grade, owner, data: null, error: '' });
    const requestedTemplate = pendingTemplateRef.current;
    pendingTemplateRef.current = null;
    void loadPersonalExamBank(grade).then(data => {
      if (cancelled) return;
      const chapters = [...new Set(data.lessons.map(lesson => lesson.chapter))];
      setChapterWeights(current => {
        const saved = requestedTemplate?.grade === grade ? requestedTemplate.chapterWeights : reload > 0 ? current : null;
        if (saved) return saved.filter(item => chapters.includes(item.chapter)).map(item => ({ ...item, ...(item.lessonIds ? { lessonIds: item.lessonIds.filter(id => data.lessons.some(lesson => lesson.id === id && lesson.chapter === item.chapter)) } : {}) }));
        return equalChapterWeights(chapters.filter(chapter => data.candidates.some(question => question.chapter === chapter)));
      });
      setBankState({ grade, owner, data, error: '' });
    }).catch(() => {
      if (!cancelled) setBankState({ grade, owner, data: null, error: 'Không thể tải đầy đủ ngân hàng Tự luyện. Hãy kiểm tra kết nối và tải lại; hệ thống không tạo đề từ dữ liệu thiếu.' });
    });
    return () => { cancelled = true; };
  }, [grade, hasAccess, user?.id, reload]);

  const bank = bankState?.grade === grade && bankState.owner === user?.id ? bankState.data : null;
  const bankError = bankState?.grade === grade && bankState.owner === user?.id ? bankState.error : '';
  const loadingBank = hasAccess && !bank && !bankError;
  const templates = templateState.owner === user?.id ? templateState.rows : [];
  const config = useMemo<PersonalExamConfig>(() => ({ title: title.trim() || `Đề Toán lớp ${grade} cá nhân`, grade, mode, questionCount, durationMinutes, chapterWeights: chapterWeights.filter(item => item.weight > 0), levelWeights }), [title, grade, mode, questionCount, durationMinutes, chapterWeights, levelWeights]);
  const plan = useMemo(() => getPersonalExamPlan(config, bank?.candidates || []), [config, bank]);
  const chapters = useMemo(() => [...new Set(bank?.lessons.map(lesson => lesson.chapter) || [])], [bank]);
  const lessonCount = bank?.lessons.filter(lesson => config.chapterWeights.some(item => item.chapter === lesson.chapter && (!item.lessonIds || item.lessonIds.includes(lesson.id)))).length || 0;
  const ready = !!bank && plan.valid;
  const estimated = getEstimatedSeconds(questionCount, levelWeights);
  const chapterPercent = sumWeights(config.chapterWeights);
  const levelPercent = sumWeights(levelWeights);

  const rebalance = (items: ChapterWeight[]) => {
    const weights = new Map(equalChapterWeights(items.filter(item => item.weight > 0).map(item => item.chapter)).map(item => [item.chapter, item.weight]));
    return items.map(item => ({ ...item, weight: weights.get(item.chapter) || 0 }));
  };
  const toggleChapter = (chapter: string, selected: boolean) => {
    setChapterWeights(current => {
      const next = current.filter(item => item.chapter !== chapter);
      if (selected) next.push({ chapter, weight: 1 });
      return rebalance(chapters.flatMap(name => next.filter(item => item.chapter === name)));
    });
  };
  const applyTemplate = (template: PersonalExamTemplate) => {
    if (busyRef.current) return;
    setFeedback({ type: 'success', text: `Đã nạp “${template.title}”. Ngân hàng sẽ kiểm tra lại các bài và số câu trước khi tạo.` });
    setMode(template.mode); setTitle(template.title); setQuestionCount(template.questionCount); setDurationMinutes(template.durationMinutes); setLevelWeights({ ...template.levelWeights });
    if (template.grade !== grade) {
      pendingTemplateRef.current = template;
      setReload(0);
      setGrade(template.grade);
    } else {
      setChapterWeights(template.chapterWeights.filter(item => chapters.includes(item.chapter)).map(item => ({ ...item, ...(item.lessonIds ? { lessonIds: item.lessonIds.filter(id => bank?.lessons.some(lesson => lesson.id === id && lesson.chapter === item.chapter)) } : {}) })));
    }
  };
  const fail = (text: string) => setFeedback({ type: 'error', text, focus: true });

  const createExam = async (replaceDraft = false) => {
    if (busyRef.current || !user?.id || !hasAccess) return;
    if (!ready || !bank) { fail('Hãy hoàn tất phạm vi, tổng tỉ lệ 100% và kiểm tra số câu trước khi tạo đề.'); return; }
    if (!replaceDraft && activeDraft?.ownerId === user.id && !activeDraft.submittedAt) { setReplaceDraftOpen(true); return; }
    const owner = user.id;
    const version = actionVersion.current;
    busyRef.current = 'create'; setBusy('create'); setFeedback(null);
    let navigating = false;
    try {
      const questions = await loadPersonalExamQuestions(pickPersonalExamCandidateIds(plan), bank.lessons);
      if (version !== actionVersion.current) return;
      const built = buildPersonalExam(config, questions);
      const session = createPersonalExamSession(config, built.questions, owner);
      window.sessionStorage.setItem(personalExamStorageKey(session.id), JSON.stringify(session));
      try { window.sessionStorage.setItem(activePersonalExamKey(owner), session.id); } catch { /* The new session itself is already stored. */ }
      router.push(`/personal-exams/take?session=${encodeURIComponent(session.id)}`);
      navigating = true;
      // Keep the action locked until navigation unmounts this builder.
      return;
    } catch (error) {
      if (version === actionVersion.current) fail(error instanceof Error ? error.message : 'Chưa tạo được đề. Hãy kiểm tra kết nối hoặc bộ nhớ trình duyệt và thử lại.');
    } finally {
      if (version === actionVersion.current && !navigating) { busyRef.current = null; setBusy(null); }
    }
  };

  const saveTemplate = async (overwrite = false) => {
    if (busyRef.current || !user?.id || !hasAccess) return;
    if (!title.trim()) { fail('Hãy đặt tên đề trước khi lưu mẫu.'); return; }
    if (!ready) { fail('Cấu hình cần hợp lệ và đủ câu trước khi lưu mẫu.'); return; }
    if (!templateState.available || templateState.loading || templateState.error) { fail('Mẫu đã lưu chưa sẵn sàng. Hãy tải lại danh sách mẫu trước khi lưu.'); return; }
    if (!overwrite && templates.some(template => template.title === config.title)) { setOverwriteOpen(true); return; }
    const owner = user.id;
    const version = actionVersion.current;
    busyRef.current = 'save'; setBusy('save'); setFeedback(null);
    try {
      const { error } = await getSupabaseClient().from('personal_exam_templates').upsert({ user_id: owner, name: config.title, grade: config.grade, mode: config.mode,
        chapter_weights: config.chapterWeights, level_weights: config.levelWeights, question_count: config.questionCount, duration_minutes: config.durationMinutes }, { onConflict: 'user_id,name' });
      if (version !== actionVersion.current) return;
      if (error) throw new Error('Chưa lưu được mẫu đề. Hãy kiểm tra kết nối/quyền FlyMax và thử lại.');
      setFeedback({ type: 'success', text: 'Đã lưu cấu hình và các bài đã chọn. Mỗi lần dùng mẫu sẽ bốc một bộ câu mới từ ngân hàng.' });
      void loadTemplates();
    } catch (error) {
      if (version === actionVersion.current) fail(error instanceof Error ? error.message : 'Chưa lưu được mẫu đề. Hãy thử lại.');
    } finally {
      if (version === actionVersion.current) { busyRef.current = null; setBusy(null); }
    }
  };

  if (!initialized) return <div className="study-page py-12 text-center text-sm text-muted-foreground" role="status">Đang kiểm tra quyền truy cập...</div>;
  if (!user || !hasAccess) return <div className="study-page max-w-2xl py-8"><section className="rounded-2xl border border-border bg-card p-6 text-center sm:p-10"><Crown className="mx-auto h-8 w-8 text-primary" aria-hidden="true" /><h1 className="mt-4 text-2xl font-bold">{!user ? 'Đăng nhập để tạo đề cá nhân' : 'Tạo đề cá nhân dành cho FlyMax và FlyInfinity'}</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Chọn chương, bài đã học và độ khó. Luyện tập riêng từ ngân hàng Tự luyện FlyDo.</p><div className="mt-6 flex flex-wrap justify-center gap-3"><Button asChild className="h-11"><Link href={!user ? '/login' : '/pricing'}>{!user ? 'Đăng nhập' : 'Xem gói FlyDo'}</Link></Button><Button asChild variant="outline" className="h-11"><Link href={`/${source}?grade=${grade}`}>Quay lại</Link></Button></div></section></div>;

  return <div className="study-page">
    <header className="mb-6 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="mb-2 text-xs font-semibold tracking-wide text-primary">PHÒNG LUYỆN TẬP RIÊNG</p><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Tạo đề cá nhân</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Chọn kiến thức đã học, đặt mục tiêu và tạo một đề vừa sức từ ngân hàng Tự luyện.</p></div>
      <Button asChild variant="outline" className="h-11 w-fit shrink-0"><Link href={`/${source}?grade=${grade}`}><ArrowLeft aria-hidden="true" className="h-4 w-4" />Quay lại {source === 'practice' ? 'Tự luyện' : 'Thi thử'}</Link></Button>
    </header>
    {activeDraft?.ownerId === user.id && <section className="mb-5 flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary-soft/30 p-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Lượt đang làm"><div className="min-w-0"><p className="text-sm font-semibold [overflow-wrap:anywhere]">Bạn có lượt chưa nộp: {activeDraft.config.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Lớp {activeDraft.config.grade} · {Object.keys(activeDraft.answers || {}).length}/{activeDraft.questions.length} câu đã trả lời. {activeDraft.config.mode === 'exam' ? 'Đồng hồ tiếp tục tính từ lúc bắt đầu.' : 'Tiếp tục ở tab này để giữ bản nháp.'}</p></div><Button asChild variant="outline" className="h-11 w-fit shrink-0"><Link href={`/personal-exams/take?session=${encodeURIComponent(activeDraft.id)}`}>Tiếp tục lượt đang làm</Link></Button></section>}
    {feedback && <div ref={feedbackRef} tabIndex={-1} role={feedback.type === 'error' ? 'alert' : 'status'} className={cn('mb-5 flex items-start gap-3 rounded-xl border p-4 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', feedback.type === 'error' ? 'border-destructive/30 bg-destructive-soft text-destructive' : 'border-success/30 bg-success-soft text-success')}><AlertCircle aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" /><span>{feedback.text}</span></div>}
    <fieldset disabled={!!busy} className="min-w-0 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <legend className="sr-only">Cấu hình đề cá nhân</legend>
      <div className="min-w-0 space-y-5">
        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6" aria-labelledby="exam-basics-title">
          <h2 id="exam-basics-title" className="mb-1 flex items-center gap-2 text-lg font-semibold"><FilePlus2 aria-hidden="true" className="h-5 w-5 text-primary" />1. Mục tiêu buổi học</h2>
          <p className="mb-5 text-sm leading-6 text-muted-foreground">Tự luyện để hiểu bài; Thi thử để kiểm tra trong thời gian giới hạn.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="personal-grade" className="mb-2 block text-sm font-medium">Lớp</label><select id="personal-grade" value={grade} onChange={event => { setReload(0); setGrade(Number(event.target.value)); setFeedback(null); }} className={selectClass}>{[6, 7, 8, 9].map(value => <option key={value} value={value}>Lớp {value}</option>)}</select></div>
            <div><p id="personal-mode-label" className="mb-2 text-sm font-medium">Hình thức</p><div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="personal-mode-label">{(['practice', 'exam'] as PersonalExamMode[]).map(value => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className={cn('min-h-11 rounded-xl border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', mode === value ? 'border-primary/35 bg-primary-soft text-primary' : 'border-border bg-card text-muted-foreground')}>{value === 'practice' ? 'Tự luyện' : 'Thi thử'}</button>)}</div></div>
            <div><label htmlFor="personal-count" className="mb-2 block text-sm font-medium">Số câu hỏi</label><Input id="personal-count" type="number" inputMode="numeric" min={5} max={100} step={1} value={Number.isFinite(questionCount) && questionCount !== 0 ? questionCount : ''} onChange={event => setQuestionCount(Number(event.target.value))} aria-describedby="personal-count-hint" aria-invalid={!Number.isInteger(questionCount) || questionCount < 5 || questionCount > 100} className="h-11 text-base" /><p id="personal-count-hint" className={cn('mt-2 text-xs leading-5', questionCount < 5 || questionCount > 100 || !Number.isInteger(questionCount) ? 'text-destructive' : 'text-muted-foreground')}>Từ 5 đến 100 câu, nhập số nguyên.</p></div>
            <div><label htmlFor="personal-duration" className="mb-2 block text-sm font-medium">{mode === 'exam' ? 'Thời gian làm bài (phút)' : 'Thời lượng dự kiến (phút)'}</label><Input id="personal-duration" type="number" inputMode="numeric" min={5} max={180} step={1} value={Number.isFinite(durationMinutes) && durationMinutes !== 0 ? durationMinutes : ''} onChange={event => setDurationMinutes(Number(event.target.value))} aria-describedby="personal-duration-hint" aria-invalid={!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 180} className="h-11 text-base" /><p id="personal-duration-hint" className={cn('mt-2 text-xs leading-5', durationMinutes < 5 || durationMinutes > 180 || !Number.isInteger(durationMinutes) ? 'text-destructive' : 'text-muted-foreground')}>{mode === 'exam' ? '5–180 phút. Hết giờ sẽ tự nộp bài.' : '5–180 phút để lên kế hoạch; không có đếm ngược.'}</p></div>
          </div>
          <p className="mt-4 rounded-xl bg-muted/50 px-3 py-3 text-sm leading-6 text-muted-foreground">{mode === 'practice' ? 'Tự luyện: khóa đáp án đã chọn, xem đúng/sai và lời giải ngay sau mỗi câu.' : 'Thi thử: được sửa đáp án khi còn giờ; chỉ xem lời giải sau khi nộp bài.'}</p>
        </section>

        <section id="personal-scope" className="rounded-2xl border border-border bg-card p-5 sm:p-6" aria-labelledby="exam-scope-title">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2"><h2 id="exam-scope-title" className="flex items-center gap-2 text-lg font-semibold"><BookOpen aria-hidden="true" className="h-5 w-5 text-primary" />2. Chọn chương & bài</h2><Badge variant={chapterPercent === 100 ? 'success' : 'warning'}>{chapterPercent}/100%</Badge></div>
          <p className="mb-4 text-sm leading-6 text-muted-foreground">Mở từng chương để chọn bài đã học. Khi thêm/bỏ chương, tỉ lệ được chia đều; bạn có thể chỉnh lại.</p>
          {loadingBank ? <p role="status" className="py-8 text-center text-sm text-muted-foreground">Đang kiểm tra toàn bộ ngân hàng lớp {grade}...</p> : bankError ? <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive-soft p-4 text-sm leading-6 text-destructive"><p>{bankError}</p><Button type="button" variant="outline" className="mt-3 h-11" onClick={() => setReload(value => value + 1)}><RefreshCw aria-hidden="true" className="h-4 w-4" />Tải lại ngân hàng</Button></div> : chapters.length === 0 ? <p role="status" className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">Lớp này chưa có bài trong ngân hàng Tự luyện. Hãy chọn lớp khác.</p> : <>
            <div className="space-y-3">{chapters.map((chapter, index) => <ChapterScope key={`${grade}:${chapter}`} index={index} chapter={chapter} value={chapterWeights.find(item => item.chapter === chapter)} lessons={bank!.lessons.filter(lesson => lesson.chapter === chapter)} candidates={bank!.candidates.filter(question => question.chapter === chapter)} needed={plan.chapterNeeds.get(chapter) || 0} onToggle={selected => toggleChapter(chapter, selected)} onWeight={weight => setChapterWeights(current => current.map(item => item.chapter === chapter ? { ...item, weight } : item))} onLessons={lessonIds => setChapterWeights(current => current.map(item => item.chapter === chapter ? { ...item, lessonIds } : item))} />)}</div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className={cn('text-xs leading-5', chapterPercent === 100 ? 'text-muted-foreground' : 'text-destructive')}>Tổng tỉ lệ chương cần bằng 100%.</p><Button type="button" variant="ghost" className="h-11" onClick={() => setChapterWeights(rebalance)}>Chia đều chương đã chọn</Button></div>
            {bank!.excludedCount > 0 && <p className="mt-2 text-xs leading-5 text-muted-foreground">{bank!.excludedCount} câu lỗi định dạng/trùng không được dùng để tạo đề. Ngân hàng gốc không bị thay đổi.</p>}
          </>}
        </section>

        <section id="personal-levels" className="rounded-2xl border border-border bg-card p-5 sm:p-6" aria-labelledby="exam-levels-title">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2"><h2 id="exam-levels-title" className="flex items-center gap-2 text-lg font-semibold"><SlidersHorizontal aria-hidden="true" className="h-5 w-5 text-primary" />3. Phân bổ độ khó</h2><Badge variant={levelPercent === 100 ? 'success' : 'warning'}>{levelPercent}/100%</Badge></div>
          <p className="mb-4 text-sm leading-6 text-muted-foreground">Chọn cấu hình nhanh hoặc điều chỉnh. Level 4 chỉ cần khi bạn muốn luyện nâng cao và ngân hàng có câu.</p>
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Cấu hình độ khó nhanh">{LEVEL_PRESETS.map(preset => <button key={preset.name} type="button" onClick={() => setLevelWeights({ ...preset.weights })} aria-pressed={PERSONAL_EXAM_LEVELS.every(level => preset.weights[level] === levelWeights[level])} className={cn('min-h-11 rounded-xl border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', PERSONAL_EXAM_LEVELS.every(level => preset.weights[level] === levelWeights[level]) ? 'border-primary/35 bg-primary-soft text-primary' : 'border-border text-muted-foreground hover:bg-muted')}>{preset.name}</button>)}</div>
          <div className="grid gap-3 sm:grid-cols-2">{PERSONAL_EXAM_LEVELS.map(level => {
            const need = plan.levelNeeds.get(level) || 0;
            const available = plan.availableByLevel[level];
            const short = !!bank && available < need;
            return <div key={level} className={cn('min-w-0 rounded-xl border p-4', short ? 'border-destructive/30 bg-destructive-soft/30' : 'border-border bg-muted/30')}>
              <div className="flex items-center justify-between gap-2"><label htmlFor={`personal-level-${level}`} className="min-w-0"><span className="block text-sm font-semibold">Level {level}</span><span className="block text-xs leading-5 text-muted-foreground">{LEVEL_META[level].target}</span></label><div className="flex shrink-0 items-center gap-1.5"><Input id={`personal-level-${level}`} aria-label={`Tỉ lệ Level ${level}`} type="number" inputMode="numeric" min={0} max={100} step={1} value={Number.isFinite(levelWeights[level]) ? levelWeights[level] : ''} onChange={event => setLevelWeights(current => ({ ...current, [level]: Number(event.target.value) }))} aria-describedby={`personal-level-${level}-hint`} className="h-11 w-[4.5rem] px-2 text-center text-base tabular-nums" /><span className="text-sm text-muted-foreground">%</span></div></div>
              <p id={`personal-level-${level}-hint`} className={cn('mt-3 text-xs leading-5 tabular-nums', short ? 'text-destructive' : 'text-muted-foreground')}>{need} câu trong đề · {bank ? available : '…'} câu có sẵn{short ? ' — chưa đủ' : ''}</p>
            </div>;
          })}</div>
          <p className={cn('mt-3 text-xs leading-5', levelPercent === 100 ? 'text-muted-foreground' : 'text-destructive')}>Tổng tỉ lệ Level cần bằng 100%. Số câu nguyên được làm tròn để tổng luôn đúng {questionCount || 0} câu.</p>
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-muted/40 p-3 text-xs leading-5 text-muted-foreground"><Clock3 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /><span>Ước tính theo độ khó: khoảng {formatMinutes(estimated)}. Đây là gợi ý, không phải cam kết; bạn có thể tự đặt thời lượng phù hợp.</span></p>
        </section>
      </div>

      <aside className="min-w-0 space-y-5 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto" aria-label="Kiểm tra và tạo đề">
        <section className="rounded-2xl border border-primary/25 bg-card p-5 shadow-soft" aria-labelledby="exam-review-title">
          <div className="mb-4 flex items-center justify-between gap-2"><h2 id="exam-review-title" className="text-lg font-semibold">Xem trước cấu hình</h2><Crown aria-hidden="true" className="h-4 w-4 text-primary" /></div>
          <dl className="mb-4 grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-3 text-sm"><div><dt className="text-xs text-muted-foreground">Phạm vi</dt><dd className="mt-1 font-semibold">Lớp {grade} · {lessonCount} bài</dd></div><div><dt className="text-xs text-muted-foreground">Hình thức</dt><dd className="mt-1 font-semibold">{mode === 'exam' ? 'Thi thử' : 'Tự luyện'}</dd></div><div><dt className="text-xs text-muted-foreground">Số câu</dt><dd className="mt-1 font-semibold tabular-nums">{questionCount || 0} câu</dd></div><div><dt className="text-xs text-muted-foreground">{mode === 'exam' ? 'Giới hạn' : 'Dự kiến'}</dt><dd className="mt-1 font-semibold tabular-nums">{durationMinutes || 0} phút</dd></div></dl>
          {ready && <div className="mb-4 space-y-3 border-b border-border pb-4">{config.chapterWeights.map(item => <div key={item.chapter}><p className="text-xs font-semibold leading-5 [overflow-wrap:anywhere]">{item.chapter} <span className="font-normal text-muted-foreground">· {plan.chapterNeeds.get(item.chapter)} câu</span></p><div className="mt-1 grid grid-cols-4 gap-1 text-xs leading-5 tabular-nums text-muted-foreground">{PERSONAL_EXAM_LEVELS.map(level => <span key={level}>L{level}: {plan.cells.get(item.chapter)?.[level] || 0}</span>)}</div></div>)}</div>}
          {!loadingBank && bank && plan.issues.length > 0 && <div className="mb-4 rounded-xl border border-warning/30 bg-warning-soft/40 p-3"><p className="mb-2 flex items-center gap-2 text-sm font-semibold text-warning"><AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />Cần điều chỉnh cấu hình</p><ul className="space-y-2 text-xs leading-5 text-foreground">{plan.issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div>}
          {ready && <p role="status" className="mb-4 flex items-start gap-2 text-xs leading-5 text-success"><CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />Đủ câu theo đúng phân bổ. Mỗi câu chỉ xuất hiện một lần.</p>}
          <label htmlFor="personal-title" className="mb-2 block text-sm font-medium">Tên đề / mẫu đề</label><Input id="personal-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={80} placeholder="Ví dụ: Ôn giữa kỳ tuần 1" className="h-11 text-base" />
          <Button type="button" onClick={() => void createExam()} disabled={!ready || !!busy} className="mt-4 h-12 w-full font-semibold">{busy === 'create' ? <><Loader2 aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />Đang kiểm tra & tạo đề...</> : <><WandSparkles aria-hidden="true" className="h-4 w-4" />Tạo đề & bắt đầu</>}</Button>
          <Button type="button" variant="outline" onClick={() => void saveTemplate()} disabled={!ready || !!busy || !templateState.available || templateState.loading || !!templateState.error} className="mt-3 h-11 w-full"><Save aria-hidden="true" className="h-4 w-4" />{busy === 'save' ? 'Đang lưu...' : 'Lưu mẫu để dùng lại'}</Button>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">Đề và kết quả của lượt này lưu trong tab hiện tại, không cộng vào tiến độ Tự luyện hay điểm thi chính thức. Đóng tab có thể mất lượt làm; mẫu đã lưu vẫn giữ trong tài khoản.</p>
        </section>
        <section className="rounded-2xl border border-border bg-card p-5" aria-labelledby="exam-templates-title"><h2 id="exam-templates-title" className="mb-3 text-base font-semibold">Mẫu đề đã lưu</h2>
          {templateState.warning && <p className="mb-3 text-xs leading-5 text-muted-foreground">{templateState.warning}</p>}
          {templateState.loading ? <p role="status" className="text-sm text-muted-foreground">Đang tải mẫu...</p> : templateState.error ? <><p className="text-sm leading-6 text-muted-foreground">{templateState.error}</p><Button type="button" variant="outline" className="mt-3 h-11" onClick={() => void loadTemplates()}><RefreshCw aria-hidden="true" className="h-4 w-4" />Tải lại mẫu</Button></> : templates.length === 0 ? <p className="text-sm leading-6 text-muted-foreground">Lưu cấu hình để không phải chọn lại chương, bài và tỉ lệ lần sau.</p> : <><label htmlFor="personal-template" className="sr-only">Dùng mẫu đề đã lưu</label><select id="personal-template" value="" onChange={event => { const template = templates.find(item => item.id === event.target.value); if (template) applyTemplate(template); }} disabled={loadingBank} className={selectClass}><option value="">Chọn mẫu ({templates.length})</option>{templates.map(template => <option key={template.id} value={template.id}>{template.title} · Lớp {template.grade} · {template.questionCount} câu</option>)}</select><p className="mt-3 text-xs leading-5 text-muted-foreground">Nạp mẫu chỉ thay cấu hình. Câu hỏi sẽ được bốc lại và kiểm tra theo ngân hàng hiện tại.</p></>}
        </section>
      </aside>
    </fieldset>
    <AlertDialog open={overwriteOpen} onOpenChange={setOverwriteOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Cập nhật mẫu “{config.title}”?</AlertDialogTitle><AlertDialogDescription>Tên này đã tồn tại. Cấu hình chương, bài, độ khó và thời lượng cũ sẽ được thay bằng cấu hình hiện tại.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="h-11">Giữ mẫu cũ</AlertDialogCancel><AlertDialogAction className="h-11" onClick={() => void saveTemplate(true)}>Cập nhật mẫu</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={replaceDraftOpen} onOpenChange={setReplaceDraftOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Bắt đầu một lượt mới?</AlertDialogTitle><AlertDialogDescription>Bạn đang có lượt chưa nộp. Bạn có thể tiếp tục lượt đó hoặc tạo đề mới từ cấu hình hiện tại. Thời gian của lượt Thi thử cũ không được đặt lại.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="h-11">Giữ lượt đang làm</AlertDialogCancel><AlertDialogAction className="h-11" onClick={() => void createExam(true)}>Tạo lượt mới</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

export default function PersonalExamPage() {
  return <Suspense fallback={<div className="study-page py-12 text-center text-muted-foreground" role="status">Đang mở trình tạo đề...</div>}><PersonalExamBuilder /></Suspense>;
}
