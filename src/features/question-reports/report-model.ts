import type { GeometryDiagram } from '@/features/geometry/types';
import { validateGeometryDiagram } from '@/features/geometry/geometry-validator';
import { pointUnits } from '@/features/mock-exams/scoring';
import type { GradedStatement } from '@/components/mock-exams/TrueFalseReview';

export const REPORT_REASONS = {
  wrong_answer: 'Đáp án có vẻ sai',
  solution: 'Lời giải sai hoặc còn thiếu',
  unclear: 'Đề bài chưa rõ / thiếu dữ kiện',
  display: 'Lỗi công thức hoặc hình vẽ',
  typo: 'Lỗi chính tả / ký hiệu',
  other: 'Lỗi khác',
} as const;
export type ReportReason = keyof typeof REPORT_REASONS;
export const REPORT_STATUSES = {
  new: 'Mới', reviewing: 'Đang kiểm tra', resolved: 'Đã xử lý', rejected: 'Không xác nhận lỗi',
} as const;
export type ReportStatus = keyof typeof REPORT_STATUSES;
export type ReportSource = 'practice' | 'mock_exam';
type SnapshotBase = {
  content: string; solution?: string;
  diagram?: GeometryDiagram; difficulty_level?: number; order_index?: number; max_points?: number;
};
export type QuestionSnapshot = SnapshotBase & (
  | { question_type?: 'multiple_choice'; options: string[]; correct_answer: number }
  | { question_type: 'short_answer'; options: []; correct_answer: null; accepted_answers: string[] }
  | { question_type: 'true_false'; options: []; correct_answer: null; statements: GradedStatement[] }
);
export type QuestionReport = {
  id: string; reporter_id: string; reporter_name: string; reporter_email: string;
  source: ReportSource; question_id: string; source_id: string; source_title: string;
  grade: number | null; chapter: string | null; question_snapshot: QuestionSnapshot;
  reason: ReportReason; details: string; status: ReportStatus;
  created_at: string; updated_at: string;
};
export type ReportResponse = {
  id: string; report_id: string; body: string; status: ReportStatus; created_at: string;
};

// Parse the authenticated ADMIN snapshot, including keys. The public room uses its own key-free parser.
export function parseQuestionSnapshot(value: unknown): QuestionSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const q = value as Record<string, unknown>;
  if (typeof q.content !== 'string' || !Array.isArray(q.options)) return null;
  const base: SnapshotBase = { content: q.content };
  if (typeof q.solution === 'string') base.solution = q.solution;
  if (typeof q.difficulty_level === 'number' && Number.isInteger(q.difficulty_level)) base.difficulty_level = q.difficulty_level;
  if (typeof q.order_index === 'number' && Number.isInteger(q.order_index)) base.order_index = q.order_index;
  if (pointUnits(q.max_points, false) !== null) base.max_points = q.max_points as number;
  if (q.diagram != null) {
    const diagram = validateGeometryDiagram(q.diagram);
    if (diagram.diagram) base.diagram = diagram.diagram;
  }
  if (q.question_type === 'true_false') {
    if (q.options.length || !Array.isArray(q.statements) || q.statements.length !== 4) return null;
    const statements: GradedStatement[] = [];
    for (const value of q.statements) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      const s = value as Record<string, unknown>;
      if (typeof s.content !== 'string' || !s.content.trim() || typeof s.correct_answer !== 'boolean') return null;
      statements.push({ content: s.content, correct_answer: s.correct_answer,
        ...(typeof s.solution === 'string' ? { solution: s.solution } : {}) });
    }
    return { ...base, question_type: 'true_false', options: [], correct_answer: null, statements };
  }
  if (q.question_type === 'short_answer') {
    if (q.options.length || q.correct_answer !== null || !Array.isArray(q.accepted_answers)
      || !q.accepted_answers.length || q.accepted_answers.some((answer) => typeof answer !== 'string')) return null;
    return { ...base, question_type: 'short_answer', options: [], correct_answer: null, accepted_answers: [...q.accepted_answers] as string[] };
  }
  if (q.question_type !== undefined && q.question_type !== 'multiple_choice') return null;
  if (q.options.length < 2 || q.options.length > 4 || q.options.some((option) => typeof option !== 'string')
    || typeof q.correct_answer !== 'number' || !Number.isInteger(q.correct_answer) || q.correct_answer < 0 || q.correct_answer >= q.options.length) return null;
  return { ...base, ...(q.question_type === 'multiple_choice' ? { question_type: 'multiple_choice' as const } : {}),
    options: [...q.options] as string[], correct_answer: q.correct_answer };
}

export function validateReport(reason: string, details: string): string | null {
  if (!Object.prototype.hasOwnProperty.call(REPORT_REASONS, reason)) return 'Hãy chọn một lý do báo lỗi.';
  if (details.trim().length > 2000) return 'Mô tả tối đa 2.000 ký tự.';
  if (reason === 'other' && !details.trim()) return 'Hãy mô tả lỗi bạn gặp.';
  return null;
}

export function reportError(error: { code?: string; message?: string }): string {
  if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(error.code ?? '')) {
    return 'Tính năng báo lỗi chưa được cài đặt. ADMIN cần chạy question-reports.sql trên Supabase.';
  }
  // Only expose our deliberate validation errors, not internal database details.
  if (error.code === 'P0001' && error.message?.startsWith('FLYDO: ')) return error.message.slice(7);
  return 'Chưa thể thực hiện. Vui lòng thử lại; nội dung bạn nhập vẫn được giữ.';
}
