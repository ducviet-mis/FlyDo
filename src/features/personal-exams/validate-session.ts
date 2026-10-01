import type { PersonalExamSession } from './types';
import { getConfigIssues, PERSONAL_EXAM_LEVELS } from './utils';

/** Validate local drafts before UI reads their fields; discard stale/invalid answers. */
export function parsePersonalExamSession(raw: string | null, id: string, ownerId?: string): PersonalExamSession | null {
  try {
    const session: PersonalExamSession = raw ? JSON.parse(raw) : null;
    if (!session || session.version !== 1 || session.id !== id || !session.config
      || !['practice', 'exam'].includes(session.config.mode)
      || !Array.isArray(session.questions) || !session.questions.length
      || !Number.isFinite(session.config.durationMinutes) || session.config.durationMinutes <= 0
      || (session.startedAt && !Number.isFinite(Date.parse(session.startedAt)))
      || (session.deadlineAt !== undefined && !Number.isFinite(session.deadlineAt))
      || (session.submittedAt && !Number.isFinite(Date.parse(session.submittedAt)))
      || (session.durationUsedSeconds !== undefined && (!Number.isFinite(session.durationUsedSeconds) || session.durationUsedSeconds < 0))) return null;
    // Old unowned drafts cannot be assigned safely after an account switch.
    // Keep the optional argument for legacy diagnostic readers, but room/result
    // always supply the signed-in account and require an owned, complete config.
    if (ownerId && (session.ownerId !== ownerId || getConfigIssues(session.config).length
      || session.questions.length !== session.config.questionCount
      || !Number.isFinite(Date.parse(session.createdAt)))) return null;
    if (session.questions.some((question) => !question || typeof question.id !== 'string'
      || typeof question.content !== 'string' || !Array.isArray(question.options)
      || question.options.length < 2 || question.options.length > 6 || question.options.some((option) => typeof option !== 'string' || !option.trim())
      || !Number.isInteger(question.correctAnswer) || question.correctAnswer < 0
      || question.correctAnswer >= question.options.length)) return null;
    if (ownerId && session.questions.some(question => !PERSONAL_EXAM_LEVELS.includes(question.difficultyLevel)
      || !session.config.chapterWeights.some(chapter => chapter.weight > 0 && chapter.chapter === question.chapter
        && (!chapter.lessonIds || chapter.lessonIds.includes(question.lessonId))))) return null;
    if (new Set(session.questions.map((question) => question.id)).size !== session.questions.length) return null;
    const byId = new Map(session.questions.map((question) => [question.id, question]));
    const answers = Object.fromEntries(Object.entries(session.answers || {}).filter(([questionId, answer]) => {
      const question = byId.get(questionId);
      return question && Number.isInteger(answer) && answer >= 0 && answer < question.options.length;
    }));
    return { ...session, answers };
  } catch { return null; }
}
