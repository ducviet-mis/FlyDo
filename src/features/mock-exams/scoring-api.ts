import { getSupabaseClient } from '@/lib/supabase/client';
import type { QuestionType } from './question-model';
import type { SectionPoints } from './scoring';

export type { SectionPoints } from './scoring';

export interface ScoringExam {
  id: string;
  title: string;
  duration: number;
  scoring_mode: 'legacy_equal' | 'sectioned';
  section_points: SectionPoints;
  scoring_ready: boolean;
  scoring_revision: number;
  [key: string]: unknown;
}

export interface ScoringQuestion {
  id: string;
  content: string;
  question_type: QuestionType;
  order_index?: number;
  diagram?: unknown;
  options: string[];
  statements: { content: string; correct_answer: boolean; solution?: string }[];
  points_override: number | null;
  max_points: number | null;
  [key: string]: unknown;
}

export interface ScoringDetails {
  exam: ScoringExam;
  questions: ScoringQuestion[];
  revision: number;
  errors: string[];
  count?: number;
}

export class ScoringRpcError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'ScoringRpcError';
  }
}

async function scoringRpc(name: string, args: Record<string, unknown>): Promise<ScoringDetails> {
  const { data, error } = await getSupabaseClient().rpc(name, args);
  if (error) throw new ScoringRpcError(error.message, error.code);
  if (!data || !data.exam || !Array.isArray(data.questions) || !Number.isInteger(data.revision) || !Array.isArray(data.errors)) {
    throw new ScoringRpcError('Không nhận được cấu hình điểm hợp lệ. Hãy tải lại cấu hình.');
  }
  // Validation errors can describe a successfully saved, incomplete draft.
  return data as ScoringDetails;
}

export function getMockExamScoring(examId: string): Promise<ScoringDetails> {
  return scoringRpc('admin_get_mock_exam_scoring', { p_exam_id: examId });
}

export function previewMockExamImport(examId: string, questions: readonly unknown[], revision: number): Promise<ScoringDetails> {
  return scoringRpc('admin_preview_mock_exam_import', { p_exam_id: examId, p_questions: questions, p_expected_revision: revision });
}

export function saveMockExamScoring(examId: string, sectionPoints: SectionPoints, overrides: Record<string, number | null>, revision: number, publish = false): Promise<ScoringDetails> {
  return scoringRpc('admin_save_mock_exam_scoring', { p_exam_id: examId, p_section_points: sectionPoints, p_overrides: overrides, p_expected_revision: revision, p_publish: publish });
}

export function deleteMockExamQuestion(examId: string, questionId: string, revision: number): Promise<ScoringDetails> {
  return scoringRpc('admin_delete_mock_exam_question', { p_exam_id: examId, p_question_id: questionId, p_expected_revision: revision });
}

export function importMockExamQuestions(examId: string, questions: readonly unknown[], revision: number): Promise<ScoringDetails> {
  return scoringRpc('admin_import_mock_exam_questions', { p_exam_id: examId, p_questions: questions, p_expected_revision: revision });
}
