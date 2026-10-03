import type { GeometryDiagram } from '@/features/geometry/types';

export type TheoryQuestionType = 'true_false' | 'drag_fill';

export type TrueFalseStatement = {
  text: string;
  answer: boolean;
};

export type TrueFalseData = {
  statements: TrueFalseStatement[];
  diagram?: GeometryDiagram;
};

export type DragFillData = {
  template: string;
  options: string[];
  answers: string[];
  diagram?: GeometryDiagram;
};

export type TheoryContentBlock = {
  content: string;
  items?: string[];
  example?: string;
  diagram?: GeometryDiagram;
  caption?: string;
};

export type TheoryDocument = {
  title?: string;
  summary?: string;
  sections: Array<{ heading: string; blocks: TheoryContentBlock[] }>;
};

export type TheoryQuestion = {
  id?: string;
  lesson_id?: string;
  question_type: TheoryQuestionType;
  prompt: string;
  data: TrueFalseData | DragFillData;
  solution: string;
  order_index?: number;
};

export type TheoryLesson = {
  id: string;
  grade: number;
  chapter: string;
  title: string;
  summary: string;
  content: string;
  sort_order: number;
  chapter_sort_order: number;
  is_published: boolean;
  created_at?: string;
  updated_at?: string;
};
