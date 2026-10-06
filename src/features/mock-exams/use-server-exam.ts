'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { examRpc } from './exam-rpc';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { formatOptionMath } from '@/features/practice/components/math-renderer';
import { parseExamQuestions, validExamAnswers, isExamAnswerPresent, isTrueFalseAnswer, normalizeShortAnswer, type ExamQuestion, type ExamAnswer, type ExamAnswers } from './question-model';

export type { ExamQuestion } from './question-model';
type Exam = { id: string; title: string; grade: number; duration: number };
type Answers = ExamAnswers;
type Session = {
  session_id: string; exam: Exam; questions: ExamQuestion[]; answers: Answers; revision: number;
  deadline_at: string; server_now: string; attempt_id: string | null;
};
type Draft = { version: 2; sessionId: string; answers: Answers; currentIndex: number; revision: number; complete?: true };
type Context = {
  id: string; userId: string; key: string; revision: number; answers: Answers; saved: Answers;
  submitting: boolean; blocked: boolean; pending: Promise<void> | null; expiresAt: number;
};
function failureMessage(error: unknown, fallback: string) {
  const detail = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  if (detail.startsWith('FLYDO_CONFLICT:')) return detail.slice('FLYDO_CONFLICT:'.length).trim();
  if (detail.startsWith('FLYDO:')) return detail.slice('FLYDO:'.length).trim();
  return fallback;
}
function isConflict(error: unknown) {
  return !!error && typeof error === 'object' && 'message' in error && String(error.message).startsWith('FLYDO_CONFLICT:');
}

export function useServerExam(examId: string, userId?: string) {
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [answers, setAnswers] = useState<Answers>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [deadlineAt, setDeadlineAt] = useState<number | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [revision, setRevision] = useState(0);
  const context = useRef<Context | null>(null);
  const key = userId ? `flydo:mock-exam-draft:v2:${userId}:${examId}` : null;
  const active = useCallback((ctx: Context) => context.current === ctx && useAuthStore.getState().user?.id === ctx.userId, []);
  const remainingSeconds = useCallback(() => Math.max(0, Math.ceil(((context.current?.expiresAt ?? 0) - performance.now()) / 1000)), []);

  const save = useCallback(async () => {
    const ctx = context.current;
    if (!ctx || !active(ctx) || ctx.blocked || ctx.submitting) return;
    if (ctx.pending) return ctx.pending;
    if (JSON.stringify(ctx.answers) === JSON.stringify(ctx.saved)) return;
    setSaving(true);
    ctx.pending = Promise.resolve().then(async () => {
      try {
        // One request at a time. New choices made during the request are sent next.
        while (active(ctx) && !ctx.submitting && JSON.stringify(ctx.answers) !== JSON.stringify(ctx.saved)) {
          const snapshot = { ...ctx.answers };
          const { data, error } = await examRpc('save_mock_exam_answers', {
            p_session_id: ctx.id, p_answers: snapshot, p_expected_revision: ctx.revision,
          });
          if (!active(ctx)) return;
          if (error) throw error;
          if (!data || !Number.isInteger(data.revision) || typeof data.accepted !== 'boolean') throw new Error('Invalid save response');
          ctx.revision = data.revision;
          setRevision(data.revision);
          if (!data.accepted) {
            ctx.blocked = true; setBlocked(true);
            setSaveError('Phiên thi đã kết thúc. Chỉ các đáp án máy chủ nhận trước hạn được chấm.');
            break;
          }
          ctx.saved = snapshot;
          setSaveError('');
        }
      } catch (error) {
        if (active(ctx)) {
          if (isConflict(error)) { ctx.blocked = true; setBlocked(true); }
          setSaveError(failureMessage(error, 'Chưa lưu được lên máy chủ. Bản nháp vẫn ở thiết bị này; hãy kết nối lại và thử lưu.'));
        }
      } finally {
        ctx.pending = null;
        if (active(ctx)) setSaving(false);
      }
    });
    return ctx.pending;
  }, [active]);

  useEffect(() => {
    let cancelled = false;
    context.current = null;
    setExam(null); setQuestions([]); setAnswers({}); setDeadlineAt(null); setAttemptId(null);
    setLoadError(''); setSaveError(''); setBlocked(false); setSaving(false); setIsSubmitting(false);
    if (!userId || !key) return;
    async function load() {
      try {
        let draft: Draft | null = null;
        try {
          const raw = window.localStorage.getItem(key!);
          const parsed = raw ? JSON.parse(raw) : null;
          if (parsed?.version === 2 && typeof parsed.sessionId === 'string'
            && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parsed.sessionId)) draft = parsed;
        } catch { /* Local storage is optional, server session remains resumable. */ }
        const requestStartedAt = performance.now();
        const { data, error } = await examRpc('start_mock_exam_session', {
          p_exam_id: examId, p_resume_session_id: draft?.sessionId ?? null,
        });
        if (cancelled || useAuthStore.getState().user?.id !== userId) return;
        if (error) throw error;
        const session = data as Session;
        const publicQuestions = parseExamQuestions(session?.questions);
        if (!session?.session_id || session.exam?.id !== examId || !publicQuestions
          || !Number.isInteger(session.revision) || !Number.isFinite(Date.parse(session.deadline_at))
          || !Number.isFinite(Date.parse(session.server_now))) {
          throw new Error('Invalid exam session');
        }
        const formatted: ExamQuestion[] = publicQuestions.map((q) => q.question_type === 'multiple_choice'
          ? { ...q, options: q.options.map(formatOptionMath) } : q);
        const serverAnswers = validExamAnswers(formatted, session.answers);
        // A local draft can restore unsent choices, never an extra exam deadline.
        const canRestore = draft?.sessionId === session.session_id && draft.revision === session.revision
          && Date.parse(session.deadline_at) > Date.parse(session.server_now) && !session.attempt_id;
        const localAnswers = canRestore ? validExamAnswers(formatted, draft!.answers) : {};
        const restored = canRestore ? (draft!.complete === true ? localAnswers : { ...serverAnswers, ...localAnswers }) : serverAnswers;
        const now = performance.now();
        const remainingMs = Math.max(0, Date.parse(session.deadline_at) - Date.parse(session.server_now)
          - (now - requestStartedAt) / 2);
        const ctx: Context = { id: session.session_id, userId: userId!, key: key!, revision: session.revision,
          answers: restored, saved: serverAnswers, submitting: false, blocked: false, pending: null, expiresAt: now + remainingMs };
        context.current = ctx;
        setExam(session.exam); setQuestions(formatted); setAnswers(restored); setRevision(session.revision);
        setCurrentIndex(draft?.sessionId === session.session_id && Number.isInteger(draft.currentIndex)
          ? Math.min(Math.max(0, draft.currentIndex), formatted.length - 1) : 0);
        // Server deadline + server time; deliberately ignore every client-stored deadline.
        setDeadlineAt(Date.now() + remainingMs);
        setAttemptId(session.attempt_id);
        if (draft?.sessionId === session.session_id && !canRestore && JSON.stringify(draft.answers) !== JSON.stringify(serverAnswers)) {
          setSaveError('Đã khôi phục bản được lưu trên máy chủ. Bản nháp cũ không ghi đè dữ liệu mới ở cửa sổ khác.');
        }
        if (!session.attempt_id) void save();
      } catch (error) {
        if (!cancelled && useAuthStore.getState().user?.id === userId) {
          setLoadError(failureMessage(error, 'Chưa thể mở phiên thi an toàn. Hãy kiểm tra kết nối và thử lại; nếu lỗi vẫn còn, báo ADMIN.'));
        }
      }
    }
    void load();
    return () => { cancelled = true; context.current = null; };
  }, [examId, userId, key, reload, save]);

  useEffect(() => {
    const ctx = context.current;
    if (!ctx || !exam || !active(ctx) || attemptId) return;
    try {
      window.localStorage.setItem(ctx.key, JSON.stringify({ version: 2, sessionId: ctx.id,
        answers, currentIndex, revision, complete: true } satisfies Draft));
    } catch { /* Server-side autosave still works if browser storage is blocked. */ }
  }, [answers, currentIndex, revision, exam, active, attemptId]);

  useEffect(() => {
    const retry = () => { void save(); };
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [save]);

  const chooseAnswer = useCallback((id: string, answer: ExamAnswer) => {
    const ctx = context.current;
    if (!ctx || !active(ctx) || ctx.submitting || ctx.blocked || remainingSeconds() <= 0) return;
    const question = questions.find((q) => q.id === id);
    if (!question) return;
    const clearShort = question.question_type === 'short_answer' && typeof answer === 'string'
      && Array.from(answer).length <= 100 && !normalizeShortAnswer(answer);
    const clearTrueFalse = question.question_type === 'true_false' && isTrueFalseAnswer(answer)
      && answer.every((choice) => choice === null);
    if (!clearShort && !clearTrueFalse && !isExamAnswerPresent(question, answer)) return;
    ctx.answers = { ...ctx.answers };
    if (clearShort || clearTrueFalse) delete ctx.answers[id];
    else ctx.answers[id] = isTrueFalseAnswer(answer) ? [...answer] : answer;
    setAnswers(ctx.answers);
    void save();
  }, [active, remainingSeconds, questions, save]);

  const clearAnswer = useCallback((id: string) => {
    const ctx = context.current;
    if (!ctx || !active(ctx) || ctx.submitting || ctx.blocked || remainingSeconds() <= 0
      || !questions.some((q) => q.id === id) || !Object.hasOwn(ctx.answers, id)) return;
    ctx.answers = { ...ctx.answers };
    delete ctx.answers[id];
    setAnswers(ctx.answers);
    void save();
  }, [active, remainingSeconds, questions, save]);

  const submit = useCallback(async (): Promise<string | null> => {
    const ctx = context.current;
    if (!ctx || !active(ctx) || ctx.submitting) return null;
    ctx.submitting = true; setIsSubmitting(true);
    try {
      await ctx.pending;
      if (!active(ctx)) return null;
      const { data, error } = await examRpc('submit_mock_exam_session', {
        p_session_id: ctx.id, p_answers: ctx.answers, p_expected_revision: ctx.revision,
      });
      if (!active(ctx)) return null;
      if (error) throw error;
      if (!data?.attempt_id) throw new Error('Invalid submission response');
      try { window.localStorage.removeItem(ctx.key); } catch { /* Optional storage. */ }
      setAttemptId(data.attempt_id);
      return data.attempt_id;
    } catch (error) {
      if (active(ctx)) {
        if (isConflict(error)) { ctx.blocked = true; setBlocked(true); }
        throw new Error(failureMessage(error, 'Chưa nộp được bài. Bản nháp vẫn được giữ; hãy kiểm tra mạng và nộp lại.'));
      }
      return null;
    } finally {
      ctx.submitting = false;
      if (active(ctx)) setIsSubmitting(false);
    }
  }, [active]);
  return { exam, questions, answers, currentIndex, setCurrentIndex, deadlineAt, loadError, saveError,
    saving, blocked, isSubmitting, attemptId, chooseAnswer, clearAnswer, submit, remainingSeconds, retrySave: save,
    retryLoad: () => setReload((value) => value + 1), ready: !!exam && !!deadlineAt };
}
