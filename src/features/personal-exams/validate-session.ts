import type { PersonalExamSession } from './types';

/** Validate local drafts before UI reads their fields; discard stale/invalid answers. */
export function parsePersonalExamSession(raw: string | null, id: string): PersonalExamSession | null {
  try {
    const session: PersonalExamSession = raw ? JSON.parse(raw) : null;
    if (!session || session.version !== 1 || session.id !== id || !session.config
      || !['practice', 'exam'].includes(session.config.mode)
      || !Array.isArray(session.questions) || !session.questions.length
      || !Number.isFinite(session.config.durationMinutes) || session.config.durationMinutes <= 0
      || (session.startedAt && !Number.isFinite(Date.parse(session.startedAt)))
      || (session.deadlineAt !== undefined && !Number.isFinite(session.deadlineAt))) return null;
    if (session.questions.some((question) => !question || typeof question.id !== 'string'
      || typeof question.content !== 'string' || !Array.isArray(question.options)
      || question.options.length < 2 || question.options.some((option) => typeof option !== 'string')
      || !Number.isInteger(question.correctAnswer) || question.correctAnswer < 0
      || question.correctAnswer >= question.options.length)) return null;
    if (new Set(session.questions.map((question) => question.id)).size !== session.questions.length) return null;
    const byId = new Map(session.questions.map((question) => [question.id, question]));
    const answers = Object.fromEntries(Object.entries(session.answers || {}).filter(([questionId, answer]) => {
      const question = byId.get(questionId);
      return question && Number.isInteger(answer) && answer >= 0 && answer < question.options.length;
    }));
    return { ...session, answers };
  } catch { return null; }
}
