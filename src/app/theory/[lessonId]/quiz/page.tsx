'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, CheckCircle2, GripVertical, Loader2, RefreshCcw, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MathRenderer } from '@/features/practice/components/math-renderer';
import { GeometryDiagram } from '@/features/geometry/components/geometry-diagram';
import type { DragFillData, TheoryLesson, TheoryQuestion, TrueFalseData } from '@/features/theory/types';
import { getSupabaseClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type TrueFalseAnswers = Record<string, Record<number, boolean>>;
type DragAnswers = Record<string, Record<number, string>>;

function questionKey(question: TheoryQuestion, index: number) {
  return question.id ?? String(index);
}

export default function TheoryQuizPage() {
  const params = useParams();
  const lessonId = params?.lessonId as string;
  const [lesson, setLesson] = useState<TheoryLesson | null>(null);
  const [questions, setQuestions] = useState<TheoryQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [trueFalseAnswers, setTrueFalseAnswers] = useState<TrueFalseAnswers>({});
  const [dragAnswers, setDragAnswers] = useState<DragAnswers>({});
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    async function loadQuiz() {
      const supabase = getSupabaseClient();
      const [{ data: lessonData, error: lessonError }, { data: questionData, error: questionError }] = await Promise.all([
        supabase.from('theory_lessons').select('*').eq('id', lessonId).single(),
        supabase.from('theory_questions').select('*').eq('lesson_id', lessonId).order('order_index', { ascending: true }),
      ]);
      if (!mounted) return;
      if (lessonError || questionError || !lessonData) setError('Không thể tải bài kiểm tra lý thuyết này.');
      else {
        setLesson(lessonData as TheoryLesson);
        setQuestions((questionData ?? []) as TheoryQuestion[]);
      }
      setLoading(false);
    }
    if (lessonId) loadQuiz();
    return () => { mounted = false; };
  }, [lessonId]);

  const currentQuestion = questions[currentIndex];
  const currentKey = currentQuestion ? questionKey(currentQuestion, currentIndex) : '';

  function isComplete(question: TheoryQuestion, index: number) {
    const key = questionKey(question, index);
    if (question.question_type === 'true_false') {
      return Object.keys(trueFalseAnswers[key] ?? {}).length === (question.data as TrueFalseData).statements.length;
    }
    return Object.keys(dragAnswers[key] ?? {}).length === (question.data as DragFillData).answers.length;
  }

  function isCorrect(question: TheoryQuestion, index: number) {
    const key = questionKey(question, index);
    if (question.question_type === 'true_false') {
      return (question.data as TrueFalseData).statements.every((statement, statementIndex) => trueFalseAnswers[key]?.[statementIndex] === statement.answer);
    }
    return (question.data as DragFillData).answers.every((answer, answerIndex) => dragAnswers[key]?.[answerIndex] === answer);
  }

  const currentComplete = currentQuestion ? isComplete(currentQuestion, currentIndex) : false;
  const currentCorrect = currentQuestion ? isCorrect(currentQuestion, currentIndex) : false;
  const score = questions.reduce((total, question, index) => total + (isCorrect(question, index) ? 1 : 0), 0);

  function chooseTrueFalse(statementIndex: number, value: boolean) {
    if (trueFalseAnswers[currentKey]?.[statementIndex] !== undefined) return;
    setTrueFalseAnswers((current) => ({
      ...current,
      [currentKey]: { ...(current[currentKey] ?? {}), [statementIndex]: value },
    }));
  }

  function placeToken(slotIndex: number, token: string, data: DragFillData) {
    if (!token || !data.options.includes(token)) return;
    setDragAnswers((current) => {
      const answers = current[currentKey] ?? {};
      if (answers[slotIndex] || Object.values(answers).includes(token)) return current;
      return { ...current, [currentKey]: { ...answers, [slotIndex]: token } };
    });
  }

  function placeInFirstEmpty(token: string, data: DragFillData) {
    const answers = dragAnswers[currentKey] ?? {};
    const firstEmpty = data.answers.findIndex((_, index) => !answers[index]);
    if (firstEmpty >= 0) placeToken(firstEmpty, token, data);
  }

  function moveTo(index: number) {
    setCurrentIndex(index);
    window.requestAnimationFrame(() => document.getElementById('theory-question')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function continueQuiz() {
    if (!currentComplete) return;
    if (currentIndex === questions.length - 1) {
      setFinished(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    moveTo(currentIndex + 1);
  }

  function resetQuiz() {
    setTrueFalseAnswers({});
    setDragAnswers({});
    setCurrentIndex(0);
    setFinished(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (loading) return <div className="container flex min-h-[420px] items-center justify-center gap-3 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Đang tải bài kiểm tra...</div>;
  if (error || !lesson) return <div className="container max-w-3xl py-16 text-center"><p className="font-semibold text-destructive">{error}</p><Button asChild variant="outline" className="mt-5"><Link href="/theory"><ArrowLeft className="h-4 w-4" />Về trang Lý thuyết</Link></Button></div>;

  return (
    <div className="container max-w-3xl px-3 py-6 sm:px-6 md:py-10">
      <Button asChild variant="ghost" className="mb-4 -ml-3 min-h-11"><Link href={'/theory/' + lesson.id}><ArrowLeft className="h-4 w-4" />Quay lại bài học</Link></Button>
      <div className="mb-6 rounded-3xl border border-border bg-gradient-to-br from-primary-soft via-card to-card p-5 sm:p-7">
        <Badge className="mb-3 bg-primary text-primary-foreground">Kiểm tra lý thuyết</Badge>
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{lesson.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">Mỗi lần làm một câu. Đáp án và lời giải hiện ngay sau khi trả lời.</p>
      </div>

      {questions.length === 0 ? <Card className="rounded-2xl"><CardContent className="py-14 text-center text-muted-foreground">Bài này chưa có câu hỏi kiểm tra.</CardContent></Card> : finished ? (
        <Card className="rounded-3xl border-primary/30 bg-primary-soft"><CardContent className="flex flex-col items-center gap-5 p-7 text-center sm:p-10"><div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground">{score}/{questions.length}</div><div><h2 className="text-2xl font-bold text-foreground">Bạn đã hoàn thành</h2><p className="mt-2 text-muted-foreground">Bạn trả lời đúng hoàn toàn {score} trong {questions.length} câu.</p></div><div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><Button variant="outline" onClick={resetQuiz} className="min-h-11"><RefreshCcw className="h-4 w-4" />Làm lại</Button><Button asChild className="min-h-11"><Link href={'/theory?grade=' + lesson.grade}>Chọn bài khác</Link></Button></div></CardContent></Card>
      ) : currentQuestion && (
        <div id="theory-question" className="scroll-mt-24 space-y-4">
          <div className="flex items-center gap-4" aria-label={'Tiến độ câu ' + (currentIndex + 1) + ' trên ' + questions.length}>
            <span className="shrink-0 text-sm font-semibold text-muted-foreground">Câu {currentIndex + 1}/{questions.length}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: ((currentIndex + 1) / questions.length * 100) + '%' }} /></div>
          </div>

          <Card className={cn('rounded-2xl border-border bg-card', currentComplete && (currentCorrect ? 'border-success/50' : 'border-destructive/50'))}>
            <CardContent className="space-y-5 p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-2"><Badge variant="outline" className="border-primary/30 bg-primary-soft text-primary">Câu {currentIndex + 1}</Badge><span className="text-xs font-medium text-muted-foreground">{currentQuestion.question_type === 'true_false' ? 'Đúng / Sai' : 'Kéo thả điền khuyết'}</span></div>
              <div className="text-base font-semibold leading-7 text-foreground sm:text-lg"><MathRenderer content={currentQuestion.prompt} /></div>
              <GeometryDiagram data={currentQuestion.data.diagram} />

              {currentQuestion.question_type === 'true_false' ? (
                <div className="space-y-3">
                  {(currentQuestion.data as TrueFalseData).statements.map((statement, statementIndex) => {
                    const selected = trueFalseAnswers[currentKey]?.[statementIndex];
                    const answered = selected !== undefined;
                    const correct = selected === statement.answer;
                    return (
                      <div key={statementIndex} className={cn('rounded-xl border bg-muted/25 p-4', answered && (correct ? 'border-success/40' : 'border-destructive/40'))}>
                        <div className="mb-3 leading-7 text-foreground"><MathRenderer content={statement.text} /></div>
                        <div className="grid grid-cols-2 gap-2">
                          {[true, false].map((value) => <button key={String(value)} type="button" disabled={answered} onClick={() => chooseTrueFalse(statementIndex, value)} className={cn('min-h-11 rounded-lg border px-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', !answered && 'border-border bg-card text-muted-foreground hover:bg-muted', answered && value === statement.answer && 'border-success bg-success-soft text-success', answered && selected === value && value !== statement.answer && 'border-destructive bg-destructive-soft text-destructive', answered && value !== statement.answer && selected !== value && 'border-border bg-card text-muted-foreground opacity-50')}>{value ? 'Đúng' : 'Sai'}</button>)}
                        </div>
                        {answered && <p role="status" className={cn('mt-3 flex items-center gap-2 text-sm font-semibold', correct ? 'text-success' : 'text-destructive')}>{correct ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}{correct ? 'Chính xác' : 'Chưa đúng. Đáp án là ' + (statement.answer ? 'Đúng' : 'Sai') + '.'}</p>}
                      </div>
                    );
                  })}
                </div>
              ) : (() => {
                const data = currentQuestion.data as DragFillData;
                return <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-x-1 gap-y-3 rounded-xl border border-border bg-muted/25 p-4 leading-8 text-foreground">
                    {data.template.split(/(\{\{\d+\}\})/g).map((part, partIndex) => {
                      const match = part.match(/^\{\{(\d+)\}\}$/);
                      if (!match) return <span key={partIndex}><MathRenderer content={part} /></span>;
                      const slotIndex = Number(match[1]) - 1;
                      const value = dragAnswers[currentKey]?.[slotIndex];
                      const correct = value === data.answers[slotIndex];
                      return <button key={partIndex} type="button" disabled={Boolean(value)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => placeToken(slotIndex, event.dataTransfer.getData('text/plain'), data)} className={cn('mx-1 inline-flex min-h-11 min-w-24 items-center justify-center rounded-lg border-2 border-dashed px-3 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', !value && 'border-primary/50 bg-card text-muted-foreground', value && correct && 'border-success bg-success-soft text-success', value && !correct && 'border-destructive bg-destructive-soft text-destructive')} aria-label={value ? 'Ô ' + (slotIndex + 1) + ': ' + value : 'Ô trống ' + (slotIndex + 1)}>{value ? <MathRenderer content={value} /> : 'Ô ' + (slotIndex + 1)}</button>;
                    })}
                  </div>
                  <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kho đáp án — kéo hoặc chạm để điền</p><div className="flex flex-wrap gap-2">{data.options.map((option) => {
                    const used = Object.values(dragAnswers[currentKey] ?? {}).includes(option);
                    return <button key={option} type="button" draggable={!used} disabled={used} onDragStart={(event) => event.dataTransfer.setData('text/plain', option)} onClick={() => placeInFirstEmpty(option, data)} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-primary/35 bg-primary-soft px-4 py-2 text-sm font-bold text-primary transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-40"><GripVertical className="h-4 w-4" /><MathRenderer content={option} /></button>;
                  })}</div></div>
                  {Object.entries(dragAnswers[currentKey] ?? {}).map(([slot, value]) => {
                    const slotIndex = Number(slot);
                    const correct = value === data.answers[slotIndex];
                    return <p key={slot} role="status" className={cn('flex items-center gap-2 text-sm font-semibold', correct ? 'text-success' : 'text-destructive')}>{correct ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}Ô {slotIndex + 1}: {correct ? 'Chính xác' : 'Chưa đúng. Đáp án là “' + data.answers[slotIndex] + '”.'}</p>;
                  })}
                </div>;
              })()}

              {currentComplete && <div aria-live="polite" className={cn('rounded-xl border p-4 text-sm leading-6', currentCorrect ? 'border-success/30 bg-success-soft' : 'border-destructive/30 bg-destructive-soft')}><div className={cn('mb-2 flex items-center gap-2 font-bold', currentCorrect ? 'text-success' : 'text-destructive')}>{currentCorrect ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}{currentCorrect ? 'Hoàn toàn chính xác' : 'Bạn đã xem được đáp án đúng'}</div>{currentQuestion.solution && <div className="text-foreground"><MathRenderer content={currentQuestion.solution} variant="solution" /></div>}</div>}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="outline" disabled={currentIndex === 0} onClick={() => moveTo(currentIndex - 1)} className="min-h-11"><ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Câu trước</span></Button>
            <Button type="button" disabled={!currentComplete} onClick={continueQuiz} className="min-h-11">{currentIndex === questions.length - 1 ? 'Xem kết quả' : 'Câu tiếp theo'}<ArrowRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
