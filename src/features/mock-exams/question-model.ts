export type QuestionType = 'multiple_choice' | 'true_false' | 'short_answer';
export type TrueFalseAnswer = [boolean | null, boolean | null, boolean | null, boolean | null];
export type ExamAnswer = number | string | TrueFalseAnswer;
export type ExamAnswers = Record<string, ExamAnswer>;
type PublicQuestion = { id: string; content: string; diagram: unknown; max_points?: number };
export type ExamQuestion = PublicQuestion & (
  | { question_type: 'multiple_choice'; options: string[] }
  | { question_type: 'short_answer'; options: [] }
  | { question_type: 'true_false'; options: []; statements: { content: string }[] }
);

// Deliberately literal: no case folding, decimal conversion or math evaluation.
export function normalizeShortAnswer(value: string): string {
  return value.replace(/[ \t\n\r\f\v\u00a0]+/g, ' ').replace(/^ | $/g, '');
}
export function normalizeQuestionType(value: unknown): QuestionType | null {
  return value === undefined || value === 'multiple_choice' ? 'multiple_choice'
    : value === 'short_answer' ? 'short_answer' : value === 'true_false' ? 'true_false' : null;
}
export function parseExamQuestions(value: unknown): ExamQuestion[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 1000) return null;
  const seen = new Set<string>(), result: ExamQuestion[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const q = item as Record<string, unknown>, type = normalizeQuestionType(q.question_type);
    if (!type || typeof q.id !== 'string' || !q.id || seen.has(q.id) || typeof q.content !== 'string'
      || !Array.isArray(q.options)) return null;
    if (type !== 'multiple_choice' ? q.options.length !== 0
      : q.options.length < 2 || q.options.length > 4 || q.options.some((v) => typeof v !== 'string' || !v.trim())) return null;
    if (q.max_points != null && (typeof q.max_points !== 'number' || !Number.isFinite(q.max_points) || q.max_points <= 0 || q.max_points > 10)) return null;
    if (type === 'true_false' && (!Array.isArray(q.statements) || q.statements.length !== 4
      || q.statements.some((s) => !s || typeof s !== 'object' || Array.isArray(s)
        || typeof s.content !== 'string' || !s.content.trim()))) return null;
    seen.add(q.id);
    const base = { id: q.id, content: q.content, diagram: q.diagram ?? null,
      ...(typeof q.max_points === 'number' ? { max_points: q.max_points } : {}) };
    result.push(type === 'true_false' ? { ...base, question_type: type, options: [],
      statements: (q.statements as { content: string }[]).map((s) => ({ content: s.content })) }
      : type === 'short_answer' ? { ...base, question_type: type, options: [] }
      : { ...base, question_type: type, options: q.options as string[] });
  }
  return result;
}
export function isExamAnswerPresent(question: ExamQuestion, answer: unknown): boolean {
  if (question.question_type === 'true_false') return isTrueFalseAnswer(answer) && answer.some((a) => a !== null);
  return question.question_type === 'short_answer'
    ? typeof answer === 'string' && Array.from(answer).length <= 100 && normalizeShortAnswer(answer).length > 0
    : typeof answer === 'number' && Number.isInteger(answer) && answer >= 0 && answer < question.options.length;
}
export function isTrueFalseAnswer(answer: unknown): answer is TrueFalseAnswer {
  return Array.isArray(answer) && answer.length === 4 && answer.every((a) => a === null || typeof a === 'boolean');
}
export function getAnsweredStatementCount(answer: unknown): number {
  return isTrueFalseAnswer(answer) ? answer.filter((a) => a !== null).length : 0;
}
export function isExamAnswerComplete(question: ExamQuestion, answer: unknown): boolean {
  return question.question_type === 'true_false' ? getAnsweredStatementCount(answer) === 4 : isExamAnswerPresent(question, answer);
}
export function validExamAnswers(questions: ExamQuestion[], value: unknown): ExamAnswers {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(questions.filter((q) => Object.hasOwn(value, q.id)
    && isExamAnswerPresent(q, (value as Record<string, unknown>)[q.id]))
    .map((q) => { const answer = (value as ExamAnswers)[q.id]; return [q.id, Array.isArray(answer) ? [...answer] : answer]; }));
}
