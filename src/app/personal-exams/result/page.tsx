'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Clock3, FileText, RotateCcw, Target, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MathRenderer, formatOptionMath } from '@/features/practice/components/math-renderer';
import { GeometryDiagram } from '@/features/geometry/components/geometry-diagram';
import { personalExamStorageKey, createPersonalExamSession } from '@/features/personal-exams/utils';
import { parsePersonalExamSession } from '@/features/personal-exams/validate-session';
import type { PersonalExamSession } from '@/features/personal-exams/types';
import { cn } from '@/lib/utils';

function formatDuration(seconds?: number) {
  const safeSeconds = Math.max(0, seconds || 0);
  return `${Math.floor(safeSeconds / 60)} phút ${safeSeconds % 60} giây`;
}

function PersonalExamResult() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session');
  const automatic = searchParams.get('auto') === '1';
  const [session, setSession] = useState<PersonalExamSession | null>(null);
  const [missingSession, setMissingSession] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    setSession(null); setMissingSession(false); setWarnings([]); setStorageError('');
    if (!sessionId) { setMissingSession(true); return; }
    try {
      const raw = window.sessionStorage.getItem(personalExamStorageKey(sessionId));
      const parsed = parsePersonalExamSession(raw, sessionId);
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.questions) || !parsed.answers) { setMissingSession(true); return; }
      setSession(parsed);
      const rawWarnings = window.sessionStorage.getItem(`${personalExamStorageKey(sessionId)}:warnings`);
      if (rawWarnings) {
        const parsedWarnings = JSON.parse(rawWarnings);
        if (Array.isArray(parsedWarnings)) setWarnings(parsedWarnings.filter((warning): warning is string => typeof warning === 'string'));
      }
    } catch {
      setMissingSession(true);
    }
  }, [sessionId]);

  const correctCount = useMemo(() => {
    if (!session) return 0;
    return session.questions.filter((question) => session.answers?.[question.id] === question.correctAnswer).length;
  }, [session]);

  const restart = () => {
    if (!session) return;
    const next = createPersonalExamSession(session.config, session.questions);
    try { window.sessionStorage.setItem(personalExamStorageKey(next.id), JSON.stringify(next)); }
    catch { setStorageError('Chưa tạo được lượt làm lại. Hãy bật bộ nhớ trình duyệt và thử lại.'); return; }
    router.push(`/personal-exams/take?session=${encodeURIComponent(next.id)}`);
  };

  if (missingSession || !session) return <div className="container max-w-xl py-20 text-center"><h1 className="text-2xl font-bold text-foreground">Không tìm thấy kết quả đề này</h1><p className="mt-3 text-muted-foreground">Hãy tạo một đề mới để bắt đầu.</p><Button asChild className="mt-6"><Link href="/personal-exams">Tạo đề cá nhân</Link></Button></div>;

  const score = session.questions.length ? (correctCount / session.questions.length) * 10 : 0;
  const unansweredCount = session.questions.length - Object.keys(session.answers || {}).length;
  const isExam = session.config.mode === 'exam';

  return <main className="container max-w-4xl py-5 md:py-8">{storageError && <p role="alert" className="mb-4 text-destructive">{storageError}</p>}<div className="mb-6 flex flex-wrap items-center justify-between gap-3"><Button asChild variant="ghost" className="h-11"><Link href={`/personal-exams?grade=${session.config.grade}&source=${isExam ? 'mock-exams' : 'practice'}`}><ArrowLeft className="mr-2 h-4 w-4" />Tạo đề mới</Link></Button><Button type="button" variant="outline" className="h-11" onClick={restart}><RotateCcw className="mr-2 h-4 w-4" />Làm lại đề này</Button></div>
    {automatic && <div className="mb-5 rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm font-medium text-warning">Đã hết thời gian, FlyDo đã tự nộp bài cho bạn.</div>}
    {warnings.length > 0 && <div className="mb-5 rounded-xl border border-primary/30 bg-primary-soft p-4 text-sm leading-6 text-primary">{warnings.join(' ')}</div>}
    <Card className="mb-8 overflow-hidden border-primary/30 bg-gradient-to-br from-primary-soft via-card to-card shadow-card"><CardContent className="p-6 text-center sm:p-8"><Badge className="bg-primary-soft text-primary">Đề cá nhân · Lớp {session.config.grade}</Badge><h1 className="mt-3 text-2xl font-bold text-foreground">{session.config.title}</h1><div className="mt-7 grid gap-5 sm:grid-cols-3"><div><p className="text-xs font-bold uppercase tracking-wider text-primary">Điểm số</p><p className="mt-1 text-5xl font-bold tracking-tight text-foreground">{score.toFixed(2)}<span className="text-xl text-muted-foreground">/10</span></p></div><div className="rounded-xl bg-card/80 p-4"><Target className="mx-auto h-5 w-5 text-success" /><p className="mt-2 text-xl font-bold text-foreground">{correctCount}/{session.questions.length}</p><p className="text-xs text-muted-foreground">Câu đúng</p></div><div className="rounded-xl bg-card/80 p-4"><Clock3 className="mx-auto h-5 w-5 text-primary" /><p className="mt-2 text-xl font-bold text-foreground">{formatDuration(session.durationUsedSeconds)}</p><p className="text-xs text-muted-foreground">Thời gian làm bài</p></div></div>{unansweredCount > 0 && <p className="mt-5 text-sm text-muted-foreground">Bạn còn bỏ trống {unansweredCount} câu.</p>}</CardContent></Card>
    <section><div className="mb-5"><p className="text-xs font-bold uppercase tracking-wider text-primary">Xem lại bài</p><h2 className="mt-1 text-2xl font-bold text-foreground">Đáp án và lời giải</h2></div><div className="space-y-5">{session.questions.map((question, index) => { const answer = session.answers?.[question.id]; const correct = answer === question.correctAnswer; const skipped = answer === undefined; return <Card key={question.id} className="overflow-hidden"><CardContent className="p-5 sm:p-6"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold text-foreground">Câu {index + 1}</h3><Badge variant={correct ? 'success' : skipped ? 'secondary' : 'destructive'}>{correct ? <><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Đúng</> : skipped ? 'Chưa làm' : <><XCircle className="mr-1 h-3.5 w-3.5" />Sai</>}</Badge></div><div className="prose vivux-prose mb-5 max-w-none text-foreground"><MathRenderer content={question.content} /></div><GeometryDiagram data={question.diagram} /><div className="grid gap-3 sm:grid-cols-2">{question.options.map((option, optionIndex) => { const isCorrect = optionIndex === question.correctAnswer; const picked = optionIndex === answer; return <div key={optionIndex} className={cn('flex min-h-12 items-center gap-3 rounded-xl border p-3', isCorrect ? 'border-success bg-success-soft' : picked ? 'border-destructive bg-destructive-soft' : 'border-border bg-muted/60 opacity-80')}><span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold', isCorrect ? 'bg-success text-success-foreground' : picked ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground')}>{['A', 'B', 'C', 'D'][optionIndex]}</span><span className={cn('text-sm font-medium', isCorrect ? 'text-success' : picked ? 'text-destructive' : 'text-muted-foreground')}><MathRenderer content={formatOptionMath(option)} /></span></div>; })}</div>{question.solution && <div className="mt-5 rounded-xl border border-primary/25 bg-primary-soft/50 p-4"><div className="mb-2 flex items-center gap-2 text-sm font-bold text-primary"><FileText className="h-4 w-4" />Lời giải</div><div className="prose vivux-prose max-w-none text-sm text-foreground"><MathRenderer content={question.solution} variant="solution" /></div></div>}</CardContent></Card>; })}</div></section>
    <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row"><Button type="button" variant="outline" className="h-11" onClick={restart}><RotateCcw className="mr-2 h-4 w-4" />Làm lại đề này</Button><Button asChild className="h-11"><Link href={`/personal-exams?grade=${session.config.grade}&source=${isExam ? 'mock-exams' : 'practice'}`}>Tạo đề mới</Link></Button></div></main>;
}

export default function PersonalExamResultPage() {
  return <Suspense fallback={<div className="container py-24 text-center text-muted-foreground">Đang tải kết quả...</div>}><PersonalExamResult /></Suspense>;
}
