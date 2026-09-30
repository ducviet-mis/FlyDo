'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { examRpc } from '@/features/mock-exams/exam-rpc';
import { Button } from '@/components/ui/button';
import { MathRenderer, formatOptionMath } from '@/features/practice/components/math-renderer';
import { GeometryDiagram } from '@/features/geometry/components/geometry-diagram';
import { ArrowLeft, CheckCircle2, XCircle, Clock, RotateCcw, Target, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { ReportQuestionButton } from '@/features/question-reports/report-question-button';

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

  useEffect(() => {
    if (!initialized) return;
    let cancelled = false;
    setLoading(true); setError(''); setExam(null); setAttempt(null); setQuestions([]);
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

        {/* Detailed Solutions */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2 mb-6">
            Đáp án chi tiết
          </h2>

          {questions.map((q, idx) => {
            const studentAns = attempt.answers[q.id];
            const isCorrect = studentAns === q.correct_answer;
            const isSkipped = studentAns === undefined;

            return (
              <div key={q.id} className="sol-result-question bg-card rounded-xl p-6 shadow-card border border-border relative overflow-hidden">
                {/* Status indicator strip */}
                <div className={cn(
                  "absolute top-0 left-0 w-2 h-full",
                  isCorrect ? "bg-success" : isSkipped ? "bg-muted" : "bg-destructive"
                )}></div>

                <div className="pl-4">
                  <div className="flex items-start justify-between mb-4">
                    <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                      Câu {idx + 1}:
                      {isCorrect ? (
                        <span className="text-success flex items-center text-sm bg-success-soft px-2 py-1 rounded-md">
                          <CheckCircle2 className="w-4 h-4 mr-1" /> Đúng
                        </span>
                      ) : isSkipped ? (
                        <span className="text-muted-foreground flex items-center text-sm bg-muted px-2 py-1 rounded-md">
                          Chưa làm
                        </span>
                      ) : (
                        <span className="text-destructive flex items-center text-sm bg-destructive-soft px-2 py-1 rounded-md">
                          <XCircle className="w-4 h-4 mr-1" /> Sai
                        </span>
                      )}
                    </h3>
                    <ReportQuestionButton source="mock_exam" questionId={q.id} />
                  </div>

                  <div className="prose vivux-prose max-w-none mb-6 text-foreground">
                    <MathRenderer content={q.content} />
                  </div>

                  <GeometryDiagram data={q.diagram} />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
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
                  </div>

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
