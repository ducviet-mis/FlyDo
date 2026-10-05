'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useServerExam } from '@/features/mock-exams/use-server-exam';
import { ShortAnswerInput } from '@/features/mock-exams/components/short-answer-input';
import { isExamAnswerPresent } from '@/features/mock-exams/question-model';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { Button } from '@/components/ui/button';
import { MathRenderer, formatOptionMath } from '@/features/practice/components/math-renderer';
import { GeometryDiagram } from '@/features/geometry/components/geometry-diagram';
import { ArrowLeft, ArrowRight, Maximize2, Minimize2, Send } from 'lucide-react';
import { ExamClock } from '@/features/mock-exams/exam-clock';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from '@/components/ui/sheet';
import { LayoutGrid } from 'lucide-react';
import { ReportQuestionButton } from '@/features/question-reports/report-question-button';

export default function MockExamRoomPage() {
  const params = useParams<{ examId: string }>();
  const router = useRouter();
  const { user, initialized } = useAuthStore();
  const {
    exam, questions, answers, currentIndex, setCurrentIndex, deadlineAt, loadError,
    saveError, saving, blocked, isSubmitting, attemptId, chooseAnswer, submit,
    remainingSeconds, retrySave, retryLoad, ready: draftReady,
  } = useServerExam(params.examId, user?.id);
  const [submitError, setSubmitError] = useState('');
  const [expiredDeadline, setExpiredDeadline] = useState<number | null>(null);
  const expired = deadlineAt !== null && expiredDeadline === deadlineAt;
  const [showConfirm, setShowConfirm] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const submitLockRef = useRef(false);
  const autoSubmitAttemptedRef = useRef<number | null>(null);

  const toggleFullscreen = async () => {
    if (!window.matchMedia('(min-width: 1024px)').matches) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Trình duyệt hoặc thiết bị không hỗ trợ toàn màn hình: người dùng vẫn làm bài bình thường.
    }
  };

  useEffect(() => {
    const syncFullscreenState = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', syncFullscreenState);
    syncFullscreenState();
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState);
  }, []);

  useEffect(() => {
    if (!exam) return;
    try {
    if (window.sessionStorage.getItem('flydo-open-exam-fullscreen') !== 'true') return;
    window.sessionStorage.removeItem('flydo-open-exam-fullscreen');
    if (!window.matchMedia('(min-width: 1024px)').matches) return;
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
    } catch { /* Fullscreen is optional when browser storage is blocked. */ }
  }, [exam]);

  useEffect(() => {
    if (attemptId && exam) router.replace(`/mock-exams/${exam.id}/result?attemptId=${attemptId}`);
  }, [attemptId, exam, router]);

  const handleSubmit = useCallback(async () => {
    if (!user || !exam || submitLockRef.current) return;
    const submittingUserId = user.id;
    submitLockRef.current = true;
    setSubmitError('');
    try {
      const id = await submit();
      if (!id || useAuthStore.getState().user?.id !== submittingUserId) return;
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    } catch (error) {
      if (useAuthStore.getState().user?.id === submittingUserId) {
        setSubmitError(error instanceof Error ? error.message : 'Chưa nộp được bài. Hãy kiểm tra mạng và nộp lại.');
      }
    } finally { submitLockRef.current = false; }
  }, [exam, submit, user]);

  const handleExpire = useCallback(() => {
    if (deadlineAt === null) return;
    setExpiredDeadline(deadlineAt);
    if (autoSubmitAttemptedRef.current !== deadlineAt) {
      autoSubmitAttemptedRef.current = deadlineAt;
      void handleSubmit();
    }
  }, [deadlineAt, handleSubmit]);

  const goToPreviousQuestion = useCallback(() => setCurrentIndex((index) => Math.max(0, index - 1)), [setCurrentIndex]);
  const goToNextQuestion = useCallback(() => setCurrentIndex((index) => Math.min(questions.length - 1, index + 1)), [questions.length, setCurrentIndex]);

  useEffect(() => {
    if (!questions.length || showConfirm || isSubmitting) return;

    const handleQuestionNavigation = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      if (event.key === 'ArrowLeft' && currentIndex > 0) {
        event.preventDefault();
        goToPreviousQuestion();
      }
      if (event.key === 'ArrowRight' && currentIndex < questions.length - 1) {
        event.preventDefault();
        goToNextQuestion();
      }
    };

    window.addEventListener('keydown', handleQuestionNavigation);
    return () => window.removeEventListener('keydown', handleQuestionNavigation);
  }, [currentIndex, isSubmitting, questions.length, showConfirm, goToPreviousQuestion, goToNextQuestion]);

  if (initialized && (!user || loadError)) return (
    <div className="container max-w-xl py-20 text-center space-y-4">
      <p role="alert" className="text-destructive">{!user ? 'Vui lòng đăng nhập để làm bài thi.' : loadError}</p>
      {user && <Button onClick={retryLoad}>Thử lại</Button>}
      <Button variant="outline" onClick={() => router.push(user ? '/mock-exams' : '/login')}>{user ? 'Về danh sách đề' : 'Đăng nhập'}</Button>
    </div>
  );
  if (!initialized || !exam || !draftReady || attemptId) {
    return <div className="py-32 flex flex-col items-center justify-center animate-pulse text-muted-foreground font-medium">Đang tải đề thi...</div>;
  }

  const currentQuestion = questions[currentIndex];
  const selectedAnswer = currentQuestion ? answers[currentQuestion.id] : null;

  return (
    <div className="w-full flex flex-col">
      {submitError && <div className="flex flex-wrap items-center justify-center gap-3 p-4"><p role="alert" className="text-destructive">{submitError}</p><Button variant="outline" disabled={isSubmitting} onClick={handleSubmit}>Nộp lại</Button>{blocked && <Button variant="outline" onClick={retryLoad}>Đồng bộ lại</Button>}</div>}
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 px-3 py-3 shadow-soft backdrop-blur-md sm:px-5">
        <div className="mx-auto grid w-full max-w-[1440px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1fr)_minmax(180px,auto)_minmax(0,1fr)]">
          <div className="col-start-1 row-start-2 flex min-w-0 items-center gap-2 sm:row-start-1">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="h-11 w-11 shrink-0 rounded-md">
            <ArrowLeft aria-hidden="true" className="w-5 h-5" />
            <span className="sr-only">Quay lại danh sách đề thi</span>
          </Button>
          <div className="hidden sm:block">
            <h1 className="font-bold text-foreground">{exam.title}</h1>
          </div>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="flex h-11 items-center gap-1.5 rounded-md border-border px-3 md:hidden">
                <LayoutGrid className="w-4 h-4" />
                <span className="font-bold">{currentIndex + 1}/{questions.length}</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[70vh] rounded-t-xl p-0 flex flex-col bg-card border-border">
              <SheetHeader className="p-4 border-b border-border text-left">
                <SheetTitle className="text-lg font-bold flex justify-between items-center">
                  Danh sách câu
                  <span className="text-sm font-bold text-primary bg-primary-soft px-3 py-1 rounded-full">
                    Đã làm: {Object.keys(answers).length} / {questions.length}
                  </span>
                </SheetTitle>
                <SheetDescription className="hidden">Question list</SheetDescription>
              </SheetHeader>
              <div className="p-4 overflow-y-auto flex-1">
                <div className="grid grid-cols-6 gap-2">
                  {questions.map((q, idx) => {
                    const isAnswered = isExamAnswerPresent(q, answers[q.id]);
                    const isCurrent = currentIndex === idx;
                    return (
                      <SheetTrigger asChild key={q.id}>
                        <button
                          onClick={() => setCurrentIndex(idx)}
                          aria-current={isCurrent ? 'step' : undefined}
                          aria-label={`Đi tới câu ${idx + 1}${isAnswered ? ', đã trả lời' : ', chưa trả lời'}`}
                          className={cn(
                            "aspect-square rounded-xl flex items-center justify-center text-sm font-bold transition-all",
                            isCurrent
                              ? "ring-2 ring-primary ring-offset-2"
                              : "hover:bg-muted",
                            isAnswered
                              ? "bg-primary text-primary-foreground shadow-card"
                              : "bg-muted text-muted-foreground border border-border"
                          )}
                        >
                          {idx + 1}
                        </button>
                      </SheetTrigger>
                    );
                  })}
                </div>
              </div>
            </SheetContent>
          </Sheet>
          </div>

          <div className="col-span-2 col-start-1 row-start-1 min-w-0 text-center sm:col-span-1 sm:col-start-2">
            <p className="truncate text-sm font-semibold text-foreground sm:text-base" title={`Tên thí sinh: ${user?.name || 'Thí sinh'}`}>
              <span className="text-muted-foreground">Tên thí sinh:</span>{' '}
              <span className="font-bold">{user?.name || 'Thí sinh'}</span>
            </p>
          </div>

          <div className="col-start-2 row-start-2 flex items-center justify-end gap-2 sm:col-start-3 sm:row-start-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={toggleFullscreen}
            className="hidden h-11 w-11 rounded-md border-border lg:inline-flex"
            aria-label={isFullscreen ? 'Thoát chế độ toàn màn hình' : 'Bật chế độ toàn màn hình'}
            title={isFullscreen ? 'Thoát toàn màn hình' : 'Bật toàn màn hình'}
          >
            {isFullscreen ? <Minimize2 aria-hidden="true" className="h-4 w-4" /> : <Maximize2 aria-hidden="true" className="h-4 w-4" />}
          </Button>
          <ExamClock deadlineAt={deadlineAt!} onExpire={handleExpire} getRemaining={remainingSeconds} />

          <Button
            disabled={isSubmitting}
            onClick={() => setShowConfirm(true)}
            size="sm"
            className="h-11 rounded-md bg-primary px-4 font-bold text-primary-foreground shadow-card hover:bg-primary-hover"
          >
            <span className="hidden sm:inline">Nộp bài</span>
            <span className="sm:hidden">Nộp</span>
            <Send aria-hidden="true" className="w-4 h-4 ml-1 sm:ml-2 shrink-0" />
          </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1440px] px-4 pt-3 text-xs text-muted-foreground">
        {saveError ? <div className="flex flex-wrap items-center gap-3"><p role="alert" className="text-warning">{saveError}</p><Button variant="outline" size="sm" disabled={saving || isSubmitting} onClick={blocked ? retryLoad : retrySave}>{blocked ? 'Đồng bộ lại' : 'Thử lưu lại'}</Button></div>
          : <p role="status">{saving ? 'Đang lưu đáp án lên máy chủ…' : 'Bài làm được lưu trên máy chủ. Thời gian do máy chủ quản lý.'}</p>}
      </div>
      <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-6 md:flex-row md:px-6 md:py-6">
        {/* Main Content (Question) */}
        <main className="min-w-0 flex-1 pb-20 md:pb-0">
          <div className="max-w-3xl mx-auto">
            {currentQuestion && (
              <div className="study-question bg-card rounded-none md:rounded-xl p-5 md:p-8 shadow-none md:shadow-card border-y md:border border-border">
                <div className="mb-6 flex items-center justify-between gap-3 border-b border-border pb-4">
                  <h2 className="text-base font-semibold text-primary">Câu {currentIndex + 1}<span className="ml-1 font-normal text-muted-foreground">/ {questions.length}</span></h2>
                  <ReportQuestionButton key={currentQuestion.id} source="mock_exam" questionId={currentQuestion.id} />
                </div>
                <div className="prose vivux-prose max-w-none mb-8 text-lg text-foreground">
                  <MathRenderer content={currentQuestion.content} />
                </div>

                <GeometryDiagram data={currentQuestion.diagram} />

                {currentQuestion.question_type === 'short_answer' ? <ShortAnswerInput
                  questionId={currentQuestion.id} value={typeof selectedAnswer === 'string' ? selectedAnswer : ''}
                  disabled={isSubmitting || expired || blocked} onChange={(value) => chooseAnswer(currentQuestion.id, value)} /> : <div className="space-y-4">
                  {(currentQuestion.options as string[]).map((opt, idx) => {
                    const isSelected = selectedAnswer === idx;
                    return (
                      <button
                        key={idx}
                        disabled={isSubmitting || expired || blocked}
                        onClick={() => chooseAnswer(currentQuestion.id, idx)}
                        aria-pressed={isSelected}
                        className={cn(
                          "sol-exam-option w-full min-w-0 flex items-center gap-3 sm:gap-4 p-4 rounded-xl border transition-colors duration-200 text-left group",
                          isSelected
                            ? "border-primary bg-primary-soft shadow-card ring-2 ring-primary/20"
                            : "border-border hover:border-primary hover:bg-muted bg-card dark:bg-transparent"
                        )}
                      >
                        <div className={cn(
                          "w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-sm font-bold transition-colors",
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground group-hover:bg-primary-soft group-hover:text-primary"
                        )}>
                          {['A', 'B', 'C', 'D'][idx]}
                        </div>
                        <div className={cn(
                          "min-w-0 flex-1 overflow-x-auto",
                          isSelected ? "text-primary font-medium" : "text-foreground"
                        )}>
                          <MathRenderer content={formatOptionMath(opt)} />
                        </div>
                      </button>
                    );
                  })}
                </div>}

                <div className="mt-8 flex items-center gap-3 border-t border-border pt-8">
                  <Button
                    variant="outline"
                    onClick={goToPreviousQuestion}
                    disabled={currentIndex === 0}
                    className="h-12 flex-1 rounded-md border-border px-4 text-muted-foreground sm:flex-none sm:px-6"
                    aria-keyshortcuts="ArrowLeft"
                    title="Câu trước (phím mũi tên trái)"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" /> Câu trước
                  </Button>
                  <Button
                    onClick={goToNextQuestion}
                    disabled={currentIndex === questions.length - 1}
                    className="h-12 flex-1 rounded-md bg-muted px-4 text-foreground hover:bg-muted sm:ml-auto sm:flex-none sm:px-6"
                    aria-keyshortcuts="ArrowRight"
                    title="Câu sau (phím mũi tên phải)"
                  >
                    Câu sau <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Sidebar (Grid) */}
        <aside className="hidden md:block w-60 xl:w-72 shrink-0">
          <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden md:sticky md:top-24">
            <div className="p-4 border-b border-border font-bold text-foreground flex justify-between items-center bg-muted/50">
              <span>Danh sách câu</span>
              <span className="text-sm font-bold text-primary bg-primary-soft px-3 py-1 rounded-full">
                {Object.keys(answers).length} / {questions.length}
              </span>
            </div>
            <div className="px-4 pt-4">
              <div role="progressbar" aria-label="Số câu đã trả lời" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={Object.keys(answers).length} className="h-1.5 overflow-hidden rounded-full bg-track"><div className="h-full rounded-full bg-primary" style={{ width: `${questions.length ? Object.keys(answers).length / questions.length * 100 : 0}%` }} /></div>
              <p className="mt-3 text-xs text-muted-foreground">Còn {questions.length - Object.keys(answers).length} câu chưa trả lời</p>
            </div>
            <div className="p-4 max-h-[40vh] md:max-h-[calc(100vh-360px)] overflow-y-auto">
              <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-5 gap-2">
                {questions.map((q, idx) => {
                  const isAnswered = isExamAnswerPresent(q, answers[q.id]);
                  const isCurrent = currentIndex === idx;

                  return (
                    <button
                      key={q.id}
                      onClick={() => setCurrentIndex(idx)}
                      aria-current={isCurrent ? 'step' : undefined}
                      aria-label={`Đi tới câu ${idx + 1}${isAnswered ? ', đã trả lời' : ', chưa trả lời'}`}
                      className={cn(
                        "aspect-square rounded-xl flex items-center justify-center text-sm font-bold transition-all",
                        isCurrent
                          ? "ring-2 ring-primary ring-offset-2"
                          : "hover:bg-muted",
                        isAnswered
                          ? "bg-primary text-primary-foreground shadow-card"
                          : "bg-muted text-muted-foreground border border-border"
                      )}
                  >
                    {idx + 1}
                  </button>
                );
              })}
              </div>
            </div>
          </div>
        </aside>
      </div>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent className="rounded-xl border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl">Xác nhận nộp bài?</AlertDialogTitle>
            <AlertDialogDescription className="text-base text-muted-foreground">
              Bạn đã làm {Object.keys(answers).length} / {questions.length} câu. Bạn có chắc chắn muốn nộp bài ngay bây giờ? Thời gian còn lại sẽ không được bảo lưu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel className="rounded-md border-border">Tiếp tục làm bài</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmit} className="rounded-md bg-primary hover:bg-primary-hover text-primary-foreground">
              Nộp bài ngay
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
