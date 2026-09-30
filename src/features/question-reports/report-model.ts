import type { GeometryDiagram } from '@/features/geometry/types';

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
export type QuestionSnapshot = {
  content: string; options: string[]; correct_answer: number; solution?: string;
  diagram?: GeometryDiagram; difficulty_level?: number; order_index?: number;
};
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
