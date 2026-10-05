export type QuestionType = 'multiple_choice' | 'short_answer';
export type ExamAnswer = number | string;
export type ExamAnswers = Record<string, ExamAnswer>;
type PublicQuestion = { id: string; content: string; diagram: unknown };
export type ExamQuestion = PublicQuestion & (
  | { question_type: 'multiple_choice'; options: string[] }
  | { question_type: 'short_answer'; options: [] }
);

// Deliberately literal: no case folding, decimal conversion or math evaluation.
export function normalizeShortAnswer(value: string): string {
  return value.replace(/[ \t\n\r\f\v\u00a0]+/g, ' ').replace(/^ | $/g, '');
}
export function normalizeQuestionType(value: unknown): QuestionType | null {
  return value === undefined || value === 'multiple_choice' ? 'multiple_choice'
    : value === 'short_answer' ? 'short_answer' : null;
}
export function parseExamQuestions(value: unknown): ExamQuestion[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 1000) return null;
  const seen = new Set<string>(), result: ExamQuestion[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const q = item as Record<string, unknown>, type = normalizeQuestionType(q.question_type);
    if (!type || typeof q.id !== 'string' || !q.id || seen.has(q.id) || typeof q.content !== 'string'
      || !Array.isArray(q.options)) return null;
    if (type === 'short_answer' ? q.options.length !== 0
      : q.options.length < 2 || q.options.length > 4 || q.options.some((v) => typeof v !== 'string' || !v.trim())) return null;
    seen.add(q.id);
    const base = { id: q.id, content: q.content, diagram: q.diagram ?? null };
    result.push(type === 'short_answer' ? { ...base, question_type: type, options: [] }
      : { ...base, question_type: type, options: q.options as string[] });
  }
  return result;
}
export function isExamAnswerPresent(question: ExamQuestion, answer: unknown): boolean {
  return question.question_type === 'short_answer'
    ? typeof answer === 'string' && Array.from(answer).length <= 100 && normalizeShortAnswer(answer).length > 0
    : typeof answer === 'number' && Number.isInteger(answer) && answer >= 0 && answer < question.options.length;
}
export function validExamAnswers(questions: ExamQuestion[], value: unknown): ExamAnswers {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(questions.filter((q) => Object.hasOwn(value, q.id)
    && isExamAnswerPresent(q, (value as Record<string, unknown>)[q.id]))
    .map((q) => [q.id, (value as ExamAnswers)[q.id]]));
}
