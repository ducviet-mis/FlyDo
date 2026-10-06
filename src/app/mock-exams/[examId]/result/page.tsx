'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { examRpc } from '@/features/mock-exams/exam-rpc';
import { Button } from '@/components/ui/button';
import { MathRenderer, formatOptionMath } from '@/features/practice/components/math-renderer';
import { GeometryDiagram } from '@/features/geometry/components/geometry-diagram';
import { ArrowLeft, CheckCircle2, XCircle, Clock, RotateCcw, Target, FileText, CircleDashed } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { ReportQuestionButton } from '@/features/question-reports/report-question-button';
import { normalizeShortAnswer, getAnsweredStatementCount } from '@/features/mock-exams/question-model';
import { TrueFalseReview } from '@/components/mock-exams/TrueFalseReview';
import { formatPoints, QUESTION_TYPE_LABELS, SECTION_TYPES } from '@/features/mock-exams/scoring';
import type { QuestionType } from '@/features/mock-exams/question-model';

type SectionScore = { max_points: number; earned_points: number; question_count: number };
type SectionScores = Record<QuestionType, SectionScore>;
function parseSectionScores(value: unknown): SectionScores | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const scores = value as Record<string, SectionScore>;
  if (SECTION_TYPES.some((type) => {
    const row = scores[type];
    return !row || typeof row.max_points !== 'number' || !Number.isFinite(row.max_points) || row.max_points < 0
      || typeof row.earned_points !== 'number' || !Number.isFinite(row.earned_points) || row.earned_points < 0
      || !Number.isInteger(row.question_count) || row.question_count < 0;
  })) return null;
  return Object.fromEntries(SECTION_TYPES.map((type) => [type, { ...scores[type] }])) as SectionScores;
}

export default function MockExamResultPage() {
  const params = useParams<{ examId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const attemptId = searchParams.get('attemptId');

  const { user, initialized } = useAuthStore();
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [exam, setExam] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [attempt, setAttempt] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sectionScores, setSectionScores] = useState<SectionScores | null>(null);
  const [partialCount, setPartialCount] = useState<number | null>(null);

  useEffect(() => {
    if (!initialized) return;
    let cancelled = false;
    setLoading(true); setError(''); setExam(null); setAttempt(null); setQuestions([]); setSectionScores(null); setPartialCount(null);
    async function loadResult() {
      try {
        if (!user?.id) throw new Error('Vui lòng đăng nhập để xem kết quả.');
        if (!attemptId) throw new Error('Đường dẫn thiếu mã bài làm.');
        const { data, error: resultError } = await examRpc('get_my_mock_exam_result', {
          p_exam_id: params.examId, p_attempt_id: attemptId,
        });
        if (resultError) throw new Error(resultError.message?.startsWith('FLYDO:')
          ? resultError.message.slice(6).trim() : 'Chưa thể tải kết quả. Hãy kiểm tra kết nối và thử lại.');
        const attemptData = data?.attempt;
        const examData = data?.exam;
        const qData = data?.questions;
        if (!attemptData || attemptData.user_id !== user.id || attemptData.exam_id !== params.examId
          || attemptData.id !== attemptId || !examData || !Array.isArray(qData)) {
          throw new Error('Không tìm thấy bài làm của bạn trong đề thi này.');
        }
        if (cancelled) return;
        setAttempt({ ...attemptData, score: Number(attemptData.score) || 0, answers: attemptData.answers || {} });
        setExam(examData);
        setQuestions(qData.map((q) => ({ ...q, options: Array.isArray(q.options) ? q.options.map(formatOptionMath) : [] })));
        setSectionScores(parseSectionScores(data.section_scores));
        setPartialCount(typeof data.partial_count === 'number' && Number.isInteger(data.partial_count) && data.partial_count >= 0 ? data.partial_count : null);
      } catch (failure) {
        if (!cancelled) setError(failure instanceof Error ? failure.message : 'Chưa thể tải kết quả. Vui lòng thử lại.');
      } finally { if (!cancelled) setLoading(false); }
    }
    void loadResult();
    return () => { cancelled = true; };
  }, [params.examId, attemptId, initialized, user?.id, reload]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m} phút ${s} giây`;
  };

  if (error) return <div className="container max-w-xl py-20 text-center space-y-4">
    <p role="alert" className="text-destructive">{error}</p>
    <Button onClick={() => setReload((value) => value + 1)}>Thử lại</Button>
    <Button variant="outline" onClick={() => router.push('/mock-exams')}>Về danh sách đề</Button>
  </div>;
  if (loading || !exam || !attempt) {
    return <div className="py-32 flex flex-col items-center justify-center animate-pulse text-muted-foreground font-medium">Đang tải kết quả...</div>;
  }

  return (
    <div className="w-full py-4 md:py-8">
      <div className="container max-w-4xl">
        <div className="flex items-center justify-between gap-4 mb-6">
          <Button variant="ghost" onClick={() => router.push(`/mock-exams?grade=${exam.grade}`)} className="rounded-md hover:bg-muted">
            <ArrowLeft className="w-4 h-4 mr-2" /> Về danh sách đề
          </Button>

          <Link href={`/mock-exams/${exam.id}`}>
            <Button variant="outline" className="rounded-md border-primary text-primary hover:bg-primary-soft font-bold gap-2">
              <RotateCcw className="w-4 h-4" /> Thi lại đề này
            </Button>
          </Link>
        </div>

        {/* Banner */}
        <div className="sol-result-hero bg-hero border border-border rounded-xl p-6 sm:p-8 text-foreground shadow-card mb-8 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full opacity-10 mix-blend-overlay"></div>
          <div className="relative z-10">
            <h1 className="text-2xl font-bold opacity-90 mb-6">{exam.title}</h1>

            <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16">
              <div className="text-center">
                <p className="text-primary font-medium mb-2">ĐIỂM SỐ</p>
                <div className="text-6xl font-bold tracking-tighter">
                  {attempt.score.toFixed(2)}<span className="text-2xl opacity-70">/10</span>
                </div>
              </div>

              <div className="flex flex-row gap-8">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-card flex items-center justify-center mx-auto mb-2 backdrop-blur-md">
                    <Target className="w-6 h-6 text-success" />
                  </div>
                  <p className="text-2xl font-bold">{attempt.correct_count}/{attempt.total_questions}</p>
                  <p className="text-xs text-primary uppercase tracking-widest mt-1">Câu đúng</p>
                  {sectionScores && partialCount !== null && <p className="mt-2 text-sm tabular-nums text-warning">{partialCount} câu đúng một phần</p>}
                </div>

                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-card flex items-center justify-center mx-auto mb-2 backdrop-blur-md">
                    <Clock className="w-6 h-6 text-primary" />
                  </div>
                  <p className="text-2xl font-bold">{formatTime(attempt.duration_used)}</p>
                  <p className="text-xs text-primary uppercase tracking-widest mt-1">Thời gian</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {sectionScores && <section className="mb-8 rounded-xl border border-border bg-card p-5 shadow-card" aria-labelledby="section-score-title">
          <h2 id="section-score-title" className="mb-4 text-lg font-semibold">Điểm từng phần</h2>
          <dl className="grid gap-3 sm:grid-cols-3">{SECTION_TYPES.map((type) => <div key={type} className="min-w-0 rounded-lg bg-muted/40 p-4">
            <dt className="text-sm font-semibold">{QUESTION_TYPE_LABELS[type]}</dt>
            <dd className="mt-2 font-semibold tabular-nums">{formatPoints(sectionScores[type].earned_points)} / {formatPoints(sectionScores[type].max_points)} điểm</dd>
            <dd className="mt-1 text-sm text-muted-foreground">{sectionScores[type].question_count} câu</dd>
          </div>)}</dl>
          <p className="mt-4 text-sm text-muted-foreground">Điểm từng phần và từng câu theo bản lưu lúc bắt đầu thi. Máy chủ cộng điểm chính xác rồi làm tròn tổng bài đến hai chữ số thập phân.</p>
        </section>}

        {/* Detailed Solutions */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2 mb-6">
            Đáp án chi tiết
          </h2>

          {questions.map((q, idx) => {
            const studentAns = attempt.answers[q.id];
            const isShort = q.question_type === 'short_answer';
            const isTrueFalse = q.question_type === 'true_false';
            const isCorrect = typeof q.is_correct === 'boolean' ? q.is_correct : !isShort && !isTrueFalse && studentAns === q.correct_answer;
            const isSkipped = studentAns === undefined || (isShort && (typeof studentAns !== 'string' || !normalizeShortAnswer(studentAns)))
              || (isTrueFalse && getAnsweredStatementCount(studentAns) === 0);
            const isPartial = isTrueFalse && !isCorrect && !isSkipped && typeof q.correct_statement_count === 'number'
              && q.correct_statement_count > 0 && q.correct_statement_count < 4;
            const hasPoints = sectionScores && typeof q.max_points === 'number' && Number.isFinite(q.max_points)
              && typeof q.earned_points === 'number' && Number.isFinite(q.earned_points);

            return (
              <div key={q.id} className="sol-result-question bg-card rounded-xl p-6 shadow-card border border-border relative overflow-hidden">
                {/* Status indicator strip */}
                <div className={cn(
                  "absolute top-0 left-0 w-2 h-full",
                  isCorrect ? "bg-success" : isSkipped ? "bg-muted" : isPartial ? "bg-warning" : "bg-destructive"
                )}></div>

                <div className="pl-4">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                    <h3 className="font-bold text-lg text-foreground flex flex-wrap items-center gap-2">
                      Câu {idx + 1}:
                      {isCorrect ? (
                        <span className="text-success flex items-center text-sm bg-success-soft px-2 py-1 rounded-md">
                          <CheckCircle2 aria-hidden="true" className="w-4 h-4 mr-1" /> {isTrueFalse ? 'Đúng hoàn toàn' : 'Đúng'}
                        </span>
                      ) : isSkipped ? (
                        <span className="text-muted-foreground flex items-center text-sm bg-muted px-2 py-1 rounded-md">
                          Chưa làm
                        </span>
                      ) : isPartial ? (
                        <span className="text-warning flex items-center text-sm bg-warning-soft px-2 py-1 rounded-md"><CircleDashed aria-hidden="true" className="w-4 h-4 mr-1" /> Đúng một phần</span>
                      ) : (
                        <span className="text-destructive flex items-center text-sm bg-destructive-soft px-2 py-1 rounded-md">
                          <XCircle className="w-4 h-4 mr-1" /> Sai
                        </span>
                      )}
                    </h3>
                    <ReportQuestionButton source="mock_exam" questionId={q.id} />
                  </div>

                  {(hasPoints || (isTrueFalse && Number.isInteger(q.correct_statement_count))) && <p className="mb-4 text-sm font-semibold tabular-nums text-foreground">
                    {hasPoints && <span>{formatPoints(q.earned_points)} / {formatPoints(q.max_points)} điểm</span>}
                    {isTrueFalse && Number.isInteger(q.correct_statement_count) && <span>{hasPoints ? ' · ' : ''}{q.correct_statement_count}/4 ý đúng</span>}
                  </p>}

                  <div className="prose vivux-prose max-w-none mb-6 text-foreground">
                    <MathRenderer content={q.content} />
                  </div>

                  <GeometryDiagram data={q.diagram} />

                  {isTrueFalse ? <TrueFalseReview statements={Array.isArray(q.statements) ? q.statements : []} answer={studentAns} showStudentAnswer /> : isShort ? <div className="mb-6 grid gap-3 sm:grid-cols-2">
                    <div className={cn('min-w-0 rounded-xl border p-4', isCorrect ? 'border-success bg-success-soft' : isSkipped ? 'border-border bg-muted/30' : 'border-destructive bg-destructive-soft')}>
                      <p className="mb-2 text-sm font-semibold text-foreground">Đáp án của bạn</p>
                      <p className="whitespace-pre-wrap break-words font-mono text-foreground">{isSkipped ? 'Chưa làm' : String(studentAns)}</p>
                    </div>
                    <div className="min-w-0 rounded-xl border border-success/40 bg-success-soft p-4">
                      <p className="mb-2 text-sm font-semibold text-success">Đáp án được chấp nhận</p>
                      <ul className="space-y-1 font-mono text-foreground">{(Array.isArray(q.accepted_answers) ? q.accepted_answers : []).filter((v: unknown) => typeof v === 'string').map((answer: string, i: number) => <li key={i} className="whitespace-pre-wrap break-words">{answer}</li>)}</ul>
                    </div>
                  </div> : <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                    {(q.options as string[]).map((opt, optIdx) => {
                      const isStudentChoice = studentAns === optIdx;
                      const isActualCorrect = q.correct_answer === optIdx;

                      let btnClass = "border-border bg-muted opacity-70";
                      let indicatorClass = "bg-muted text-muted-foreground";

                      if (isActualCorrect) {
                        btnClass = "border-success bg-success-soft ring-1 ring-success opacity-100";
                        indicatorClass = "bg-success text-success-foreground";
                      } else if (isStudentChoice && !isActualCorrect) {
                        btnClass = "border-destructive bg-destructive-soft opacity-100";
                        indicatorClass = "bg-destructive text-destructive-foreground";
                      }

                      return (
                        <div key={optIdx} className={cn("flex items-center gap-3 p-3 rounded-2xl border-2 transition-all", btnClass)}>
                          <div className={cn("w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-sm font-bold", indicatorClass)}>
                            {['A', 'B', 'C', 'D'][optIdx]}
                          </div>
                          <div className={cn("flex-1", isActualCorrect ? "font-semibold text-success" : isStudentChoice ? "text-destructive" : "text-muted-foreground")}>
                            <MathRenderer content={formatOptionMath(opt)} />
                          </div>
                          {isActualCorrect && <CheckCircle2 className="w-5 h-5 text-success shrink-0" />}
                          {isStudentChoice && !isActualCorrect && <XCircle className="w-5 h-5 text-destructive shrink-0" />}
                        </div>
                      );
                    })}
                  </div>}

                  {q.solution && (
                    <div className="mt-6 p-5 rounded-2xl bg-primary-soft border border-primary">
                      <h4 className="font-bold text-primary mb-3 flex items-center gap-2">
                        <FileText className="w-4 h-4" /> Lời giải chi tiết
                      </h4>
                      <div className="prose vivux-prose max-w-none text-foreground">
                        <MathRenderer content={q.solution} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button
            size="lg"
            variant="outline"
            onClick={() => router.push(`/mock-exams?grade=${exam.grade}`)}
            className="rounded-md px-8 font-bold w-full sm:w-auto"
          >
            <ArrowLeft className="w-5 h-5 mr-2" /> Về danh sách đề
          </Button>

          <Link href={`/mock-exams/${exam.id}`} className="w-full sm:w-auto">
            <Button size="lg" className="rounded-md bg-primary text-primary-foreground px-8 font-bold shadow-card w-full">
              <RotateCcw className="w-5 h-5 mr-2" /> Thi lại đề này
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
