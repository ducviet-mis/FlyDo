'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, FileText, LayoutGrid, Send, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { MathRenderer, formatOptionMath } from '@/features/practice/components/math-renderer';
import { GeometryDiagram } from '@/features/geometry/components/geometry-diagram';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { getEffectiveAccountTier } from '@/features/subscription/utils';
import { personalExamStorageKey } from '@/features/personal-exams/utils';
import { parsePersonalExamSession } from '@/features/personal-exams/validate-session';
import type { PersonalExamSession } from '@/features/personal-exams/types';
import { cn } from '@/lib/utils';

function formatClock(totalSeconds: number) {
  const minutes = Math.floor(Math.max(0, totalSeconds) / 60);
  const seconds = Math.max(0, totalSeconds) % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function PersonalExamRoom() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session');
  const { user, initialized } = useAuthStore();
  const hasAccess = ['flymax', 'flyinfinity'].includes(getEffectiveAccountTier(user));
  const [session, setSession] = useState<PersonalExamSession | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [storageError, setStorageError] = useState('');
  const [missingSession, setMissingSession] = useState(false);
  const submittedRef = useRef(false);
  const answersRef = useRef<Record<string, number>>({});

  useEffect(() => { answersRef.current = answers; }, [answers]);

  useEffect(() => {
    setSession(null); setAnswers({}); setCurrentIndex(0); setTimeLeft(null); setMissingSession(false); setStorageError('');
    submittedRef.current = false; answersRef.current = {};
    if (!sessionId) { setMissingSession(true); return; }
    if (!hasAccess) return;
    try {
      const raw = window.sessionStorage.getItem(personalExamStorageKey(sessionId));
      const parsed = parsePersonalExamSession(raw, sessionId);
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
        setMissingSession(true);
        return;
      }

      const startedAt = parsed.startedAt || new Date().toISOString();
      const deadlineAt = parsed.config.mode === 'exam'
        ? parsed.deadlineAt || new Date(startedAt).getTime() + parsed.config.durationMinutes * 60 * 1000
        : undefined;
      const restored = { ...parsed, startedAt, deadlineAt };
      setSession(restored);
      setAnswers(parsed.answers || {});
      answersRef.current = parsed.answers || {};
      setTimeLeft(deadlineAt ? Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000)) : null);
      window.sessionStorage.setItem(personalExamStorageKey(sessionId), JSON.stringify(restored));
    } catch {
      setMissingSession(true);
    }
  }, [hasAccess, sessionId, user?.id]);

  const submit = useCallback((automatic = false) => {
    if (!session || !sessionId || submittedRef.current) return;
    submittedRef.current = true;
    const startedAt = session.startedAt ? new Date(session.startedAt).getTime() : Date.now();
    const completed: PersonalExamSession = {
      ...session,
      answers: answersRef.current,
      submittedAt: new Date().toISOString(),
      durationUsedSeconds: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
    };
    try { window.sessionStorage.setItem(personalExamStorageKey(sessionId), JSON.stringify(completed)); }
    catch { submittedRef.current = false; setStorageError('Chưa lưu được kết quả. Đừng đóng trang; hãy bật bộ nhớ trình duyệt và nộp lại.'); return; }
    setStorageError('');
    router.push(`/personal-exams/result?session=${encodeURIComponent(sessionId)}${automatic ? '&auto=1' : ''}`);
  }, [router, session, sessionId]);

  useEffect(() => {
    if (!session || session.config.mode !== 'exam' || !session.deadlineAt) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((session.deadlineAt! - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) submit(true);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [session, submit]);

  useEffect(() => {
    if (!session || !sessionId || submittedRef.current) return;
    try { window.sessionStorage.setItem(personalExamStorageKey(sessionId), JSON.stringify({ ...session, answers })); }
    catch { setStorageError('Trình duyệt chưa lưu được bản nháp. Đừng đóng trang trước khi nộp bài.'); }
  }, [answers, session, sessionId]);

  if (!initialized) return <div className="container py-24 text-center text-muted-foreground">Đang mở đề...</div>;
  if (!user || !hasAccess) return <div className="container max-w-xl py-20 text-center"><h1 className="text-2xl font-bold text-foreground">Đề cá nhân dành cho FlyMax và FlyInfinity</h1><Button asChild className="mt-5"><Link href="/pricing">Xem gói FlyDo</Link></Button></div>;
  if (missingSession || !session) return <div className="container max-w-xl py-20 text-center"><h1 className="text-2xl font-bold text-foreground">Không tìm thấy đề này</h1><p className="mt-3 text-muted-foreground">Phiên tạo đề đã hết hoặc bạn đang mở nó ở thiết bị khác. Hãy tạo lại một đề mới.</p><Button asChild className="mt-6"><Link href="/personal-exams">Tạo đề cá nhân</Link></Button></div>;

  const currentQuestion = session.questions[currentIndex];
  const answeredCount = Object.keys(answers).length;
  const isExam = session.config.mode === 'exam';
  const selectedAnswer = answers[currentQuestion.id];
  const showPracticeFeedback = !isExam && selectedAnswer !== undefined;

  const selectAnswer = (optionIndex: number) => {
    // This is a click handler, not render: check the real wall clock to stop
    // answers between the deadline and the next one-second timer tick.
    // eslint-disable-next-line react-hooks/purity
    if ((isExam && session.deadlineAt && Date.now() >= session.deadlineAt) || submittedRef.current || (!isExam && answersRef.current[currentQuestion.id] !== undefined)) return;
    const nextAnswers = { ...answersRef.current, [currentQuestion.id]: optionIndex };
    answersRef.current = nextAnswers;
    setAnswers(nextAnswers);
  };

  return <main className="container max-w-6xl py-4 md:py-7">{storageError && <p role="alert" className="mb-4 text-destructive">{storageError}</p>}<div className="mb-5 flex flex-wrap items-center justify-between gap-3"><Button asChild variant="ghost" className="h-11"><Link href={`/personal-exams?grade=${session.config.grade}&source=${isExam ? 'mock-exams' : 'practice'}`}><ArrowLeft className="mr-2 h-4 w-4" />Thoát đề</Link></Button><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="border-primary/30 bg-primary-soft px-3 py-1.5 text-primary">Lớp {session.config.grade} · {isExam ? 'Thi thử' : 'Tự luyện'}</Badge>{isExam ? <Badge className="bg-warning-soft px-3 py-1.5 text-warning"><Clock3 className="mr-1.5 h-4 w-4" />{formatClock(timeLeft ?? 0)}</Badge> : <Badge className="bg-success-soft px-3 py-1.5 text-success"><CheckCircle2 className="mr-1.5 h-4 w-4" />Không giới hạn thời gian</Badge>}</div></div>
    <div className="mb-6 rounded-2xl border border-primary/25 bg-gradient-to-r from-primary-soft via-card to-card p-5"><p className="text-xs font-bold uppercase tracking-wider text-primary">Đề cá nhân</p><h1 className="mt-1 text-xl font-bold text-foreground sm:text-2xl">{session.config.title}</h1><p className="mt-2 text-sm text-muted-foreground">Đã trả lời {answeredCount}/{session.questions.length} câu {isExam && `· Thời gian ${session.config.durationMinutes} phút`}</p></div>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]"><Card className="min-w-0"><CardContent className="p-5 sm:p-7"><div className="mb-5 flex items-center justify-between gap-3"><span className="text-sm font-bold text-primary">Câu {currentIndex + 1}/{session.questions.length}</span><Badge variant="outline" className="border-border bg-muted text-muted-foreground">Level {currentQuestion.difficultyLevel}</Badge></div><div className="prose vivux-prose mb-6 max-w-none text-base leading-7 text-foreground sm:text-lg"><MathRenderer content={currentQuestion.content} /></div><GeometryDiagram data={currentQuestion.diagram} /><div className="grid gap-3 sm:grid-cols-2">{currentQuestion.options.map((option, index) => {
      const isCorrect = index === currentQuestion.correctAnswer;
      const isSelected = selectedAnswer === index;
      return <button
        key={index}
        type="button"
        onClick={() => selectAnswer(index)}
        disabled={showPracticeFeedback || (isExam && timeLeft === 0)}
        aria-pressed={isSelected}
        aria-label={`${['A', 'B', 'C', 'D'][index]}: ${option}${showPracticeFeedback ? isCorrect ? '. Đáp án đúng' : isSelected ? '. Bạn chọn, chưa chính xác' : '' : ''}`}
        className={cn(
          'flex min-h-14 items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          showPracticeFeedback
            ? isCorrect ? 'border-success bg-success-soft ring-1 ring-success' : isSelected ? 'border-destructive bg-destructive-soft' : 'border-border bg-surface opacity-75'
            : isSelected ? 'border-primary bg-primary-soft ring-1 ring-primary' : 'border-border bg-surface hover:border-primary/60 hover:bg-muted',
        )}
      >
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold', showPracticeFeedback && isCorrect ? 'bg-success text-success-foreground' : showPracticeFeedback && isSelected ? 'bg-destructive text-destructive-foreground' : isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{['A', 'B', 'C', 'D'][index]}</span>
        <span className="min-w-0 text-sm font-semibold text-foreground"><MathRenderer content={formatOptionMath(option)} /></span>
        {showPracticeFeedback && isCorrect && <CheckCircle2 aria-hidden="true" className="ml-auto h-5 w-5 shrink-0 text-success" />}
        {showPracticeFeedback && isSelected && !isCorrect && <XCircle aria-hidden="true" className="ml-auto h-5 w-5 shrink-0 text-destructive" />}
      </button>;
    })}</div>
    {showPracticeFeedback && <div role="status" aria-live="polite" className={cn('mt-5 overflow-hidden rounded-xl border', selectedAnswer === currentQuestion.correctAnswer ? 'border-success/50' : 'border-destructive/50')}>
      <div className={cn('flex flex-wrap items-center gap-2 px-4 py-3 text-sm font-bold', selectedAnswer === currentQuestion.correctAnswer ? 'bg-success-soft text-success' : 'bg-destructive-soft text-destructive')}>
        {selectedAnswer === currentQuestion.correctAnswer ? <CheckCircle2 aria-hidden="true" className="h-5 w-5" /> : <XCircle aria-hidden="true" className="h-5 w-5" />}
        {selectedAnswer === currentQuestion.correctAnswer ? 'Chính xác!' : 'Chưa chính xác!'}
        <span className="sm:ml-auto">Đáp án đúng: {['A', 'B', 'C', 'D'][currentQuestion.correctAnswer]}</span>
      </div>
      {currentQuestion.solution && <div className="bg-muted/60 p-4"><div className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground"><FileText aria-hidden="true" className="h-4 w-4" />Lời giải chi tiết</div><div className="prose vivux-prose max-w-none text-sm text-foreground"><MathRenderer content={currentQuestion.solution} variant="solution" /></div></div>}
    </div>}
    <div className="mt-7 flex items-center justify-between gap-3 border-t border-border pt-5"><Button type="button" variant="outline" className="h-11" disabled={currentIndex === 0} onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}><ArrowLeft className="mr-2 h-4 w-4" />Câu trước</Button>{currentIndex === session.questions.length - 1 ? <Button type="button" className="h-11" onClick={() => submit()}><Send className="mr-2 h-4 w-4" />Nộp bài</Button> : <Button type="button" className="h-11" onClick={() => setCurrentIndex((index) => Math.min(session.questions.length - 1, index + 1))}>Câu sau<ArrowRight className="ml-2 h-4 w-4" /></Button>}</div></CardContent></Card>
      <aside className="lg:sticky lg:top-24 lg:self-start"><Card level="supporting"><CardContent className="p-4"><div className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground"><LayoutGrid className="h-4 w-4 text-primary" />Danh sách câu</div><div className="grid grid-cols-5 gap-2">{session.questions.map((question, index) => <button key={question.id} type="button" onClick={() => setCurrentIndex(index)} aria-label={`Câu ${index + 1}${answers[question.id] !== undefined ? ', đã trả lời' : ''}`} className={cn('flex h-10 items-center justify-center rounded-lg border text-sm font-bold transition-colors', currentIndex === index ? 'border-primary bg-primary text-primary-foreground' : answers[question.id] !== undefined ? 'border-success/40 bg-success-soft text-success' : 'border-border bg-surface text-muted-foreground hover:border-primary')}>{index + 1}</button>)}</div><Button type="button" variant="outline" className="mt-4 h-11 w-full" onClick={() => submit()}><Send className="mr-2 h-4 w-4" />Nộp bài ({answeredCount})</Button></CardContent></Card></aside></div></main>;
}

export default function PersonalExamTakePage() {
  return <Suspense fallback={<div className="container py-24 text-center text-muted-foreground">Đang mở đề...</div>}><PersonalExamRoom /></Suspense>;
}
