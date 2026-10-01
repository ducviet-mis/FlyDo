'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, FileText, LayoutGrid, Send, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { MathRenderer, formatOptionMath } from '@/features/practice/components/math-renderer';
import { GeometryDiagram } from '@/features/geometry/components/geometry-diagram';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { getEffectiveAccountTier } from '@/features/subscription/utils';
import { activePersonalExamKey, personalExamStorageKey } from '@/features/personal-exams/utils';
import { parsePersonalExamSession } from '@/features/personal-exams/validate-session';
import type { PersonalExamSession } from '@/features/personal-exams/types';
import { cn } from '@/lib/utils';

function formatClock(seconds: number) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}
const optionLetter = (index: number) => String.fromCharCode(65 + index);

function PersonalExamRoom() {
  const router = useRouter();
  const sessionId = useSearchParams().get('session');
  const { user, initialized } = useAuthStore();
  const owner = user?.id;
  const hasAccess = ['flymax', 'flyinfinity'].includes(getEffectiveAccountTier(user));
  const [storedSession, setSession] = useState<PersonalExamSession | null>(null);
  const session = storedSession && storedSession.ownerId === owner && storedSession.id === sessionId && hasAccess ? storedSession : null;
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [storageError, setStorageError] = useState('');
  const [missingSession, setMissingSession] = useState(false);
  const [loadingSession, setLoadingSession] = useState(true);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);
  const answersRef = useRef<Record<string, number>>({});

  useEffect(() => {
    // Synchronize with a browser draft, not a derived render state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(null);
    setAnswers({}); setCurrentIndex(0); setTimeLeft(null); setMissingSession(false); setStorageError(''); setLoadingSession(true); setSubmitting(false); setConfirmSubmit(false); setConfirmExit(false);
    submittedRef.current = false; answersRef.current = {};
    if (!sessionId) { setMissingSession(true); setLoadingSession(false); return; }
    if (!hasAccess || !owner) { setLoadingSession(false); return; }
    try {
      const parsed = parsePersonalExamSession(window.sessionStorage.getItem(personalExamStorageKey(sessionId)), sessionId, owner);
      if (!parsed) { setMissingSession(true); setLoadingSession(false); return; }
      if (parsed.submittedAt) { submittedRef.current = true; router.replace(`/personal-exams/result?session=${encodeURIComponent(sessionId)}`); return; }
      const startedAt = parsed.startedAt || new Date().toISOString();
      // Derive from the original start, never grant a new deadline on reload.
      const deadlineAt = parsed.config.mode === 'exam' ? new Date(startedAt).getTime() + parsed.config.durationMinutes * 60000 : undefined;
      const restored = { ...parsed, startedAt, deadlineAt };
      window.sessionStorage.setItem(personalExamStorageKey(sessionId), JSON.stringify(restored));
      try { window.sessionStorage.setItem(activePersonalExamKey(owner), sessionId); } catch { /* The draft itself is already stored. */ }
      setSession(restored); setAnswers(restored.answers || {}); answersRef.current = restored.answers || {};
      setTimeLeft(deadlineAt ? Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000)) : null);
      setLoadingSession(false);
    } catch { setMissingSession(true); setLoadingSession(false); }
  }, [hasAccess, owner, sessionId, router]);

  const submit = useCallback((automatic = false) => {
    if (!session || !sessionId || !owner || submittedRef.current) return;
    submittedRef.current = true; setSubmitting(true);
    const now = Date.now();
    const completed: PersonalExamSession = { ...session, answers: { ...answersRef.current }, submittedAt: new Date(now).toISOString(),
      durationUsedSeconds: Math.max(0, Math.round(((session.deadlineAt ? Math.min(now, session.deadlineAt) : now) - Date.parse(session.startedAt!)) / 1000)) };
    try {
      window.sessionStorage.setItem(personalExamStorageKey(sessionId), JSON.stringify(completed));
      // Result is already durable; clearing the resume pointer is optional.
      try { if (window.sessionStorage.getItem(activePersonalExamKey(owner)) === sessionId) window.sessionStorage.removeItem(activePersonalExamKey(owner)); } catch { /* The result remains readable. */ }
    } catch {
      submittedRef.current = false; setSubmitting(false);
      setStorageError('Chưa lưu được kết quả. Đừng đóng trang; hãy bật bộ nhớ trình duyệt và nộp lại.'); return;
    }
    setStorageError('');
    router.push(`/personal-exams/result?session=${encodeURIComponent(sessionId)}${automatic ? '&auto=1' : ''}`);
  }, [router, session, sessionId, owner]);

  useEffect(() => {
    if (!session?.deadlineAt || session.config.mode !== 'exam') return;
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
    try {
      window.sessionStorage.setItem(personalExamStorageKey(sessionId), JSON.stringify({ ...session, answers }));
      // Recover the draft warning after a successful external storage write.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStorageError(current => current === 'Trình duyệt chưa lưu được bản nháp. Đừng đóng trang trước khi nộp bài.' ? '' : current);
    } catch {
      // Browser storage can become unavailable while the room is open.
      setStorageError('Trình duyệt chưa lưu được bản nháp. Đừng đóng trang trước khi nộp bài.');
    }
  }, [answers, session, sessionId]);

  const selectAnswer = useCallback((question: PersonalExamSession['questions'][number], index: number) => {
    if (!session || submittedRef.current || (session.config.mode === 'exam' && session.deadlineAt && Date.now() >= session.deadlineAt) || (session.config.mode === 'practice' && answersRef.current[question.id] !== undefined)) return;
    const next = { ...answersRef.current, [question.id]: index };
    answersRef.current = next; setAnswers(next);
  }, [session]);

  if (!initialized || loadingSession && user && hasAccess) return <div role="status" className="study-page py-12 text-center text-muted-foreground">Đang khôi phục lượt làm...</div>;
  if (!user || !hasAccess) return <div className="study-page max-w-xl py-12 text-center"><h1 className="text-2xl font-bold">{!user ? 'Đăng nhập để tiếp tục' : 'Đề cá nhân dành cho FlyMax và FlyInfinity'}</h1><Button asChild className="mt-5 h-11"><Link href={!user ? '/login' : '/pricing'}>{!user ? 'Đăng nhập' : 'Xem gói FlyDo'}</Link></Button></div>;
  if (missingSession || !session) return <div className="study-page max-w-xl py-12 text-center"><h1 className="text-2xl font-bold">Không tìm thấy lượt làm hợp lệ</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Lượt này đã hết, thuộc tài khoản khác hoặc được tạo từ phiên cũ. Hãy tạo lại một đề mới.</p><Button asChild className="mt-6 h-11"><Link href="/personal-exams">Tạo đề cá nhân</Link></Button></div>;

  const current = session.questions[currentIndex];
  const answeredCount = Object.keys(answers).length;
  const isExam = session.config.mode === 'exam';
  const selectedAnswer = answers[current.id];
  const showFeedback = !isExam && selectedAnswer !== undefined;
  const backHref = `/personal-exams?grade=${session.config.grade}&source=${isExam ? 'mock-exams' : 'practice'}`;

  return <div className="study-page">
    {storageError && <p role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive-soft p-4 text-sm leading-6 text-destructive">{storageError}</p>}
    <header className="mb-5 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><Button type="button" variant="ghost" className="h-11" onClick={() => setConfirmExit(true)}><ArrowLeft aria-hidden="true" className="h-4 w-4" />Về trình tạo đề</Button><div className="flex flex-wrap gap-2"><Badge variant="outline">Lớp {session.config.grade} · {isExam ? 'Thi thử' : 'Tự luyện'}</Badge><Badge variant={isExam && (timeLeft || 0) < 60 ? 'warning' : 'secondary'}>{isExam ? <><Clock3 aria-hidden="true" className="mr-1.5 h-4 w-4" /><span className="tabular-nums">{formatClock(timeLeft ?? 0)}</span></> : 'Không giới hạn thời gian'}</Badge></div></div>
      <h1 className="text-xl font-semibold leading-7 [overflow-wrap:anywhere] sm:text-2xl">{session.config.title}</h1><p className="mt-2 text-sm text-muted-foreground">Đã trả lời {answeredCount}/{session.questions.length} câu{isExam ? ' · Đáp án chỉ hiện sau khi nộp' : ' · Xem lời giải sau mỗi câu'}</p>
      <div role="progressbar" aria-label="Tiến độ trả lời" aria-valuenow={answeredCount} aria-valuemin={0} aria-valuemax={session.questions.length} className="mt-3 h-1.5 overflow-hidden rounded-full bg-track"><div className="h-full rounded-full bg-primary" style={{ width: `${answeredCount / session.questions.length * 100}%` }} /></div>
    </header>
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
      <section className="min-w-0 rounded-2xl border border-border bg-card p-5 sm:p-7" aria-label={`Câu ${currentIndex + 1}`}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold text-primary">Câu {currentIndex + 1}/{session.questions.length}</h2><Badge variant="outline">Level {current.difficultyLevel}</Badge></div>
        <p className="mb-5 text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">{current.lessonTitle || current.chapter}</p>
        <div className="prose vivux-prose mb-6 max-w-none text-base leading-7 text-foreground sm:text-lg"><MathRenderer content={current.content} /></div><GeometryDiagram data={current.diagram} />
        <div className="grid gap-3 sm:grid-cols-2">{current.options.map((option, index) => {
          const correct = index === current.correctAnswer, selected = selectedAnswer === index;
          return <button key={index} type="button" onClick={() => selectAnswer(current, index)} disabled={submitting || showFeedback || isExam && timeLeft === 0} aria-pressed={selected} aria-label={`${optionLetter(index)}: ${option}${showFeedback ? correct ? '. Đáp án đúng' : selected ? '. Bạn chọn, chưa chính xác' : '' : ''}`} className={cn('flex min-h-14 min-w-0 items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', showFeedback ? correct ? 'border-success bg-success-soft' : selected ? 'border-destructive bg-destructive-soft' : 'border-border bg-muted/30 opacity-75' : selected ? 'border-primary bg-primary-soft ring-1 ring-primary' : 'border-border bg-card hover:border-primary/60 hover:bg-muted/40')}>
            <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold', showFeedback && correct ? 'bg-success text-success-foreground' : showFeedback && selected ? 'bg-destructive text-destructive-foreground' : selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{optionLetter(index)}</span><span className="min-w-0 text-sm font-medium text-foreground [overflow-wrap:anywhere]"><MathRenderer content={formatOptionMath(option)} /></span>
            {showFeedback && correct && <CheckCircle2 aria-hidden="true" className="ml-auto h-5 w-5 shrink-0 text-success" />}{showFeedback && selected && !correct && <XCircle aria-hidden="true" className="ml-auto h-5 w-5 shrink-0 text-destructive" />}
          </button>;
        })}</div>
        {showFeedback && <div role="status" className={cn('mt-5 overflow-hidden rounded-xl border', selectedAnswer === current.correctAnswer ? 'border-success/40' : 'border-destructive/40')}><div className={cn('flex flex-wrap items-center gap-2 px-4 py-3 text-sm font-semibold', selectedAnswer === current.correctAnswer ? 'bg-success-soft text-success' : 'bg-destructive-soft text-destructive')}>{selectedAnswer === current.correctAnswer ? <CheckCircle2 aria-hidden="true" className="h-5 w-5" /> : <XCircle aria-hidden="true" className="h-5 w-5" />}{selectedAnswer === current.correctAnswer ? 'Chính xác!' : 'Chưa chính xác!'}<span className="sm:ml-auto">Đáp án đúng: {optionLetter(current.correctAnswer)}</span></div>{current.solution && <div className="bg-muted/30 p-4"><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><FileText aria-hidden="true" className="h-4 w-4" />Lời giải chi tiết</h3><div className="prose vivux-prose max-w-none text-sm text-foreground"><MathRenderer content={current.solution} variant="solution" /></div></div>}</div>}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-5"><Button type="button" variant="outline" className="h-11" disabled={currentIndex === 0 || submitting} onClick={() => setCurrentIndex(index => Math.max(0, index - 1))}><ArrowLeft aria-hidden="true" className="h-4 w-4" />Câu trước</Button>{currentIndex === session.questions.length - 1 ? <Button type="button" className="h-11" disabled={submitting} onClick={() => setConfirmSubmit(true)}><Send aria-hidden="true" className="h-4 w-4" />Nộp bài</Button> : <Button type="button" className="h-11" disabled={submitting} onClick={() => setCurrentIndex(index => Math.min(session.questions.length - 1, index + 1))}>Câu sau<ArrowRight aria-hidden="true" className="h-4 w-4" /></Button>}</div>
      </section>
      <aside className="rounded-2xl border border-border bg-card p-4 lg:sticky lg:top-24" aria-label="Điều hướng câu hỏi"><h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><LayoutGrid aria-hidden="true" className="h-4 w-4 text-primary" />Danh sách câu</h2><div className="grid grid-cols-5 gap-2">{session.questions.map((question, index) => <button key={question.id} type="button" disabled={submitting} onClick={() => setCurrentIndex(index)} aria-current={currentIndex === index ? 'step' : undefined} aria-label={`Câu ${index + 1}${answers[question.id] !== undefined ? ', đã trả lời' : ', chưa trả lời'}`} className={cn('flex h-11 items-center justify-center rounded-lg border text-sm font-semibold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', currentIndex === index ? 'border-primary bg-primary text-primary-foreground' : answers[question.id] !== undefined ? 'border-primary/30 bg-primary-soft text-primary' : 'border-border bg-card text-muted-foreground hover:bg-muted')}>{index + 1}</button>)}</div><p className="mt-3 text-xs leading-5 text-muted-foreground">Ô màu nhạt: đã trả lời, không có nghĩa là đáp án đúng. Còn {session.questions.length - answeredCount} câu chưa làm.</p><Button type="button" variant="outline" className="mt-4 h-11 w-full" disabled={submitting} onClick={() => setConfirmSubmit(true)}><Send aria-hidden="true" className="h-4 w-4" />{submitting ? 'Đang nộp...' : 'Kiểm tra & nộp bài'}</Button></aside>
    </div>
    <AlertDialog open={confirmSubmit && !submitting} onOpenChange={setConfirmSubmit}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Nộp bài và xem kết quả?</AlertDialogTitle><AlertDialogDescription>Bạn đã trả lời {answeredCount}/{session.questions.length} câu.{answeredCount < session.questions.length ? ` Còn ${session.questions.length - answeredCount} câu bỏ trống, các câu này không được tính điểm.` : ' Tất cả câu hỏi đã có đáp án.'} Sau khi nộp, lượt này không thể sửa; bạn vẫn có thể tạo lượt làm lại.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="h-11">Tiếp tục làm bài</AlertDialogCancel><AlertDialogAction className="h-11" onClick={() => submit()}>Nộp bài</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={confirmExit && !submitting} onOpenChange={setConfirmExit}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Về trình tạo đề?</AlertDialogTitle><AlertDialogDescription>Bản nháp được giữ trong tab này. Bạn có thể tiếp tục lượt đang làm từ trình tạo đề. Thời gian Thi thử vẫn tiếp tục chạy; đóng tab có thể mất lượt làm.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="h-11">Ở lại làm bài</AlertDialogCancel><AlertDialogAction className="h-11" disabled={!!storageError} onClick={() => router.push(backHref)}>Về trình tạo đề</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

export default function PersonalExamTakePage() {
  return <Suspense fallback={<div className="study-page py-12 text-center text-muted-foreground" role="status">Đang mở đề...</div>}><PersonalExamRoom /></Suspense>;
}
