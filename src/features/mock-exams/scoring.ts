import type { QuestionType } from './question-model';

export const SECTION_TYPES: QuestionType[] = ['multiple_choice', 'true_false', 'short_answer'];
export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: 'Trắc nghiệm ABCD', true_false: 'Đúng / Sai', short_answer: 'Trả lời ngắn',
};
export type SectionPoints = Record<QuestionType, number>;
export const DEFAULT_SECTION_POINTS: SectionPoints = { multiple_choice: 10, true_false: 0, short_answer: 0 };
const PRECISION = 10000;

export function pointUnits(value: unknown, allowZero = true): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (!allowZero && value === 0) || value > 10) return null;
  const units = Math.round(value * PRECISION);
  // No epsilon acceptance: an almost-four-decimal input is still invalid.
  return Number(value.toFixed(4)) === value && (allowZero || units > 0) ? units : null;
}
export function parsePointInput(value: string, allowZero = true): number | null {
  const text = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,4})?$/.test(text)) return null;
  const number = Number(text);
  return pointUnits(number, allowZero) === null ? null : number;
}
export function formatPoints(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString('vi-VN', { maximumFractionDigits: 6 }) : '—';
}
export function trueFalseScoreRate(correctStatements: number): number {
  return [0, 0.1, 0.25, 0.5, 1][correctStatements] ?? 0;
}

type ScorableQuestion = { id: string; question_type: QuestionType; order_index?: number; points_override?: number | null };
// A preview only: saving, publication and earned scores remain server-authoritative.
export function allocateSectionPoints<T extends ScorableQuestion>(sectionPoints: SectionPoints, source: T[]) {
  const questions = source.map((q) => ({ ...q, max_points: null as number | null }))
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0) || a.id.localeCompare(b.id));
  const errors: string[] = [];
  let totalUnits = 0;
  if (source.length === 0) errors.push('Đề chưa có câu hỏi.');
  if (source.length > 1000) errors.push('Mỗi đề có tối đa 1000 câu.');
  if (new Set(source.map((q) => q.id)).size !== source.length) errors.push('ID câu hỏi bị trùng.');
  if (source.some((q) => !SECTION_TYPES.includes(q.question_type))) errors.push('Có dạng câu hỏi không hợp lệ.');
  for (const type of SECTION_TYPES) {
    const sectionUnits = pointUnits(sectionPoints[type]);
    const label = QUESTION_TYPE_LABELS[type];
    if (sectionUnits === null) { errors.push(`${label}: nhập điểm từ 0 đến 10, tối đa 4 chữ số thập phân.`); continue; }
    totalUnits += sectionUnits;
    const rows = questions.filter((q) => q.question_type === type);
    if (!rows.length) { if (sectionUnits !== 0) errors.push(`${label}: chưa có câu hỏi, điểm phần phải bằng 0.`); continue; }
    const automatic = rows.filter((q) => q.points_override == null);
    let locked = 0, invalid = false;
    for (const q of rows.filter((q) => q.points_override != null)) {
      const units = pointUnits(q.points_override, false);
      if (units === null) { errors.push(`${label}: điểm chỉnh riêng phải lớn hơn 0, tối đa 4 chữ số thập phân.`); invalid = true; }
      else { locked += units; q.max_points = units / PRECISION; }
    }
    if (invalid) continue;
    const remainder = sectionUnits - locked;
    if (remainder < 0 || (automatic.length === 0 && remainder !== 0)) {
      errors.push(`${label}: điểm chỉnh riêng không khớp tổng điểm phần.`); continue;
    }
    if (automatic.length > 0 && remainder < automatic.length) {
      errors.push(`${label}: phần điểm còn lại chưa đủ để mỗi câu tự động có điểm lớn hơn 0.`); continue;
    }
    const base = automatic.length ? Math.floor(remainder / automatic.length) : 0;
    automatic.forEach((q, i) => { q.max_points = (base + (i < remainder % automatic.length ? 1 : 0)) / PRECISION; });
  }
  if (totalUnits !== 10 * PRECISION) errors.push('Tổng điểm của 3 phần phải bằng 10 trước khi đưa đề vào sử dụng.');
  return { questions, errors, valid: errors.length === 0, total_points: totalUnits / PRECISION };
}
