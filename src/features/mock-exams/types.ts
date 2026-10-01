export interface MockExamSummary {
  id: string;
  title: string;
  duration: number;
  topic_id?: string | null;
}

export interface MockExamAttempt {
  id: string;
  exam_id: string;
  score: number;
  correct_count: number;
  total_questions: number;
  duration_used: number;
  created_at: string;
}
