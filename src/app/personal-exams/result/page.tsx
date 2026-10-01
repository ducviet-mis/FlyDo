'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Clock3, FileText, RotateCcw, Target, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MathRenderer, formatOptionMath } from '@/features/practice/components/math-renderer';
import { GeometryDiagram } from '@/features/geometry/components/geometry-diagram';
import { activePersonalExamKey, personalExamStorageKey, createPersonalExamSession } from '@/features/personal-exams/utils';
import { parsePersonalExamSession } from '@/features/personal-exams/validate-session';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { getEffectiveAccountTier } from '@/features/subscription/utils';
import type { PersonalExamSession } from '@/features/personal-exams/types';
import { cn } from '@/lib/utils';

type ReviewStatus = 'all' | 'wrong' | 'skipped' | 'correct';
const optionLetter = (index: number) => String.fromCharCode(65 + index);
function formatDuration(seconds = 0) { return `${Math.floor(seconds / 60)} phút ${seconds % 60} giây`; }

function PersonalExamResult() {
  const router = useRouter();
  const params = useSearchParams();
  const sessionId = params.get('session');
  const { user, initialized } = useAuthStore();
  const owner = user?.id;
  const hasAccess = ['flymax', 'flyinfinity'].includes(getEffectiveAccountTier(user));
  const [storedSession, setSession] = useState<PersonalExamSession | null>(null);
  const session = storedSession && storedSession.ownerId === owner && storedSession.id === sessionId && hasAccess ? storedSession : null;
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState('');
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>('all');

  useEffect(() => {
    // Read the completed browser draft after the account and route are ready.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(null);
    setLoading(true); setStorageError(''); setReviewStatus('all');
    if (!owner || !hasAccess || !sessionId) { setLoading(false); return; }
    try {
      const parsed = parsePersonalExamSession(window.sessionStorage.getItem(personalExamStorageKey(sessionId)), sessionId, owner);
      if (!parsed) { setLoading(false); return; }
      // An unfinished paper must never reveal its solutions through this route.
      if (!parsed.submittedAt) { router.replace(`/personal-exams/take?session=${encodeURIComponent(sessionId)}`); return; }
      setSession(parsed);
      setLoading(false);
    } catch { setLoading(false); }
  }, [owner, hasAccess, sessionId, router]);

  const stats = useMemo(() => {
    const correct = session?.questions.filter(question => session.answers?.[question.id] === question.correctAnswer).length || 0;
    const answered = Object.keys(session?.answers || {}).length;
    const total = session?.questions.length || 0;
    return { correct, wrong: answered - correct, skipped: total - answered, total, score: total ? correct / total * 10 : 0 };
  }, [session]);
  const visibleQuestions = useMemo(() => session?.questions.map((question, index) => ({ question, index })).filter(({ question }) => {
    const answer = session.answers?.[question.id];
    return reviewStatus === 'all' || (reviewStatus === 'skipped' ? answer === undefined : reviewStatus === 'correct' ? answer === question.correctAnswer : answer !== undefined && answer !== question.correctAnswer);
  }) || [], [session, reviewStatus]);
  const lessonSummary = useMemo(() => {
    const rows = new Map<string, { title: string; total: number; correct: number; skipped: number }>();
    session?.questions.forEach(question => {
      const row = rows.get(question.lessonId) || { title: question.lessonTitle || question.chapter, total: 0, correct: 0, skipped: 0 };
      row.total++; if (session.answers?.[question.id] === question.correctAnswer) row.correct++; if (session.answers?.[question.id] === undefined) row.skipped++;
      rows.set(question.lessonId, row);
    });
    return [...rows.entries()];
  }, [session]);

  const restart = () => {
    if (!session || !owner) return;
    const next = createPersonalExamSession(session.config, session.questions, owner);
    try {
      window.sessionStorage.setItem(personalExamStorageKey(next.id), JSON.stringify(next));
      try { window.sessionStorage.setItem(activePersonalExamKey(owner), next.id); } catch { /* The next session is already stored. */ }
    } catch { setStorageError('Chưa tạo được lượt làm lại. Hãy bật bộ nhớ trình duyệt và thử lại.'); return; }
    router.push(`/personal-exams/take?session=${encodeURIComponent(next.id)}`);
  };

  if (!initialized || loading && user && hasAccess) return <div role="status" className="study-page py-12 text-center text-muted-foreground">Đang kiểm tra kết quả...</div>;
  if (!user || !hasAccess) return <div className="study-page max-w-xl py-12 text-center"><h1 className="text-2xl font-bold">{!user ? 'Đăng nhập để xem kết quả' : 'Đề cá nhân dành cho FlyMax và FlyInfinity'}</h1><Button asChild className="mt-5 h-11"><Link href={!user ? '/login' : '/pricing'}>{!user ? 'Đăng nhập' : 'Xem gói FlyDo'}</Link></Button></div>;
  if (!session) return <div className="study-page max-w-xl py-12 text-center"><h1 className="text-2xl font-bold">Không tìm thấy kết quả hợp lệ</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Lượt này đã hết, thuộc tài khoản khác hoặc chưa được nộp. Hãy mở lượt đang làm trong cùng tab hoặc tạo đề mới.</p><Button asChild className="mt-6 h-11"><Link href="/personal-exams">Về trình tạo đề</Link></Button></div>;
  const backHref = `/personal-exams?grade=${session.config.grade}&source=${session.config.mode === 'exam' ? 'mock-exams' : 'practice'}`;
  const automatic = params.get('auto') === '1' && !!session.deadlineAt && Date.parse(session.submittedAt!) >= session.deadlineAt;
  const filters: { id: ReviewStatus; label: string; count: number }[] = [{ id: 'all', label: 'Tất cả', count: stats.total }, { id: 'wrong', label: 'Câu sai', count: stats.wrong }, { id: 'skipped', label: 'Chưa làm', count: stats.skipped }, { id: 'correct', label: 'Câu đúng', count: stats.correct }];

  return <div className="study-page max-w-5xl">
    {storageError && <p role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive-soft p-4 text-sm text-destructive">{storageError}</p>}
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3"><Button asChild variant="outline" className="h-11"><Link href={backHref}><ArrowLeft aria-hidden="true" className="h-4 w-4" />Tạo đề mới</Link></Button><Button type="button" variant="outline" className="h-11" onClick={restart}><RotateCcw aria-hidden="true" className="h-4 w-4" />Làm lại cùng bộ câu</Button></header>
    {automatic && <p role="status" className="mb-5 rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm leading-6 text-warning">Đã hết thời gian. FlyDo đã tự nộp các đáp án bạn chọn.</p>}
    <section className="mb-6 rounded-2xl border border-primary/25 bg-card p-5 sm:p-7" aria-labelledby="personal-result-title">
      <p className="mb-2 text-xs font-semibold tracking-wide text-primary">KẾT QUẢ LUYỆN TẬP RIÊNG · LỚP {session.config.grade}</p><h1 id="personal-result-title" className="text-2xl font-semibold leading-8 [overflow-wrap:anywhere]">{session.config.title}</h1>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-xl bg-primary-soft/50 p-4"><p className="text-xs text-muted-foreground">Điểm số</p><p className="mt-2 text-3xl font-bold tabular-nums text-primary">{stats.score.toFixed(2)}<span className="text-sm font-normal text-muted-foreground"> /10</span></p></div><div className="rounded-xl bg-muted/40 p-4"><Target aria-hidden="true" className="mb-2 h-4 w-4 text-success" /><p className="text-xl font-semibold tabular-nums">{stats.correct}/{stats.total}</p><p className="mt-1 text-xs text-muted-foreground">Câu đúng</p></div><div className="rounded-xl bg-muted/40 p-4"><XCircle aria-hidden="true" className="mb-2 h-4 w-4 text-destructive" /><p className="text-xl font-semibold tabular-nums">{stats.wrong} sai · {stats.skipped} trống</p><p className="mt-1 text-xs text-muted-foreground">Cần xem lại</p></div><div className="rounded-xl bg-muted/40 p-4"><Clock3 aria-hidden="true" className="mb-2 h-4 w-4 text-primary" /><p className="text-sm font-semibold leading-6 tabular-nums">{formatDuration(session.durationUsedSeconds)}</p><p className="mt-1 text-xs text-muted-foreground">Thời gian làm</p></div></div>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">Điểm = số câu đúng / tổng số câu × 10. Câu bỏ trống không có điểm. Kết quả này không cộng vào tiến độ Tự luyện hoặc bảng điểm Thi thử.</p>
    </section>
    <section className="mb-6 rounded-2xl border border-border bg-card p-5" aria-labelledby="personal-lesson-summary"><h2 id="personal-lesson-summary" className="mb-3 text-base font-semibold">Nhìn lại theo bài học</h2><ul className="divide-y divide-border">{lessonSummary.map(([id, row]) => <li key={id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"><p className="min-w-0 text-sm font-medium leading-6 [overflow-wrap:anywhere]">{row.title}</p><p className="shrink-0 text-xs leading-5 tabular-nums text-muted-foreground">{row.correct}/{row.total} đúng · {row.total - row.correct - row.skipped} sai · {row.skipped} trống</p></li>)}</ul></section>
    <section aria-labelledby="personal-review-title"><div className="mb-4"><h2 id="personal-review-title" className="text-xl font-semibold">Xem lại đáp án & lời giải</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Ưu tiên câu sai và câu bỏ trống để củng cố kiến thức.</p></div><div role="group" aria-label="Lọc câu xem lại" className="mb-5 flex flex-wrap gap-2">{filters.map(filter => <button key={filter.id} type="button" aria-pressed={reviewStatus === filter.id} onClick={() => setReviewStatus(filter.id)} className={cn('min-h-11 rounded-xl border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', reviewStatus === filter.id ? 'border-primary/35 bg-primary-soft text-primary' : 'border-border bg-card text-muted-foreground')}>
      {filter.label}<span className="ml-2 text-xs tabular-nums">{filter.count}</span>
    </button>)}</div>
    {visibleQuestions.length === 0 ? <p role="status" className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">Không có câu thuộc nhóm này. Hãy chọn nhóm khác để xem lại.</p> : <div className="space-y-4">{visibleQuestions.map(({ question, index }) => {
      const answer = session.answers?.[question.id], correct = answer === question.correctAnswer, skipped = answer === undefined;
      return <article key={question.id} className="min-w-0 rounded-2xl border border-border bg-card p-5 sm:p-6" aria-labelledby={`review-${question.id}`}><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 id={`review-${question.id}`} className="text-sm font-semibold">Câu {index + 1} · Level {question.difficultyLevel}</h3><Badge variant={correct ? 'success' : skipped ? 'secondary' : 'destructive'}>{correct ? <><CheckCircle2 aria-hidden="true" className="mr-1 h-3.5 w-3.5" />Đúng</> : skipped ? 'Chưa làm' : <><XCircle aria-hidden="true" className="mr-1 h-3.5 w-3.5" />Sai</>}</Badge></div><p className="mb-4 text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">{question.lessonTitle || question.chapter}</p><div className="prose vivux-prose mb-5 max-w-none text-foreground"><MathRenderer content={question.content} /></div><GeometryDiagram data={question.diagram} />
        <div className="grid gap-3 sm:grid-cols-2">{question.options.map((option, optionIndex) => {
          const isCorrect = optionIndex === question.correctAnswer, picked = optionIndex === answer;
          return <div key={optionIndex} className={cn('flex min-h-12 min-w-0 items-center gap-3 rounded-xl border p-3', isCorrect ? 'border-success/50 bg-success-soft' : picked ? 'border-destructive/50 bg-destructive-soft' : 'border-border bg-muted/30')}><span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold', isCorrect ? 'bg-success text-success-foreground' : picked ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground')}>{optionLetter(optionIndex)}</span><span className="min-w-0 text-sm text-foreground [overflow-wrap:anywhere]"><MathRenderer content={formatOptionMath(option)} /></span>{isCorrect && <CheckCircle2 aria-label="Đáp án đúng" className="ml-auto h-4 w-4 shrink-0 text-success" />}{picked && !isCorrect && <XCircle aria-label="Đáp án bạn chọn, chưa đúng" className="ml-auto h-4 w-4 shrink-0 text-destructive" />}</div>;
        })}</div><p className="mt-3 text-xs leading-5 text-muted-foreground">Bạn chọn: {skipped ? 'chưa chọn' : optionLetter(answer!)} · Đáp án đúng: {optionLetter(question.correctAnswer)}</p>
        {question.solution ? <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4"><h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><FileText aria-hidden="true" className="h-4 w-4 text-primary" />Lời giải</h4><div className="prose vivux-prose max-w-none text-sm text-foreground"><MathRenderer content={question.solution} variant="solution" /></div></div> : <p className="mt-4 text-xs leading-5 text-muted-foreground">Câu này chưa có lời giải chi tiết trong ngân hàng.</p>}
      </article>;
    })}</div>}</section>
    <div className="mt-7 flex flex-wrap justify-center gap-3"><Button type="button" variant="outline" className="h-11" onClick={restart}><RotateCcw aria-hidden="true" className="h-4 w-4" />Làm lại cùng bộ câu</Button><Button asChild className="h-11"><Link href={backHref}>Tạo đề mới từ ngân hàng</Link></Button></div>
  </div>;
}

export default function PersonalExamResultPage() { return <Suspense fallback={<div className="study-page py-12 text-center text-muted-foreground" role="status">Đang tải kết quả...</div>}><PersonalExamResult /></Suspense>; }
