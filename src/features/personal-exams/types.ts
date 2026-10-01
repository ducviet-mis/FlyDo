import type { GeometryDiagram } from '@/features/geometry/types';

export type PersonalExamMode = 'practice' | 'exam';

export type PersonalExamLevel = 1 | 2 | 3 | 4;

export type ChapterWeight = {
  chapter: string;
  weight: number;
  /** Omitted in older templates means all lessons in this chapter. */
  lessonIds?: string[];
};

export type LevelWeights = Record<PersonalExamLevel, number>;

export type PersonalExamQuestion = {
  id: string;
  lessonId: string;
  lessonTitle?: string;
  chapter: string;
  content: string;
  options: string[];
  correctAnswer: number;
  solution: string;
  hasMath: boolean;
  difficultyLevel: PersonalExamLevel;
  diagram?: GeometryDiagram;
};

export type PersonalExamConfig = {
  title: string;
  grade: number;
  mode: PersonalExamMode;
  chapterWeights: ChapterWeight[];
  levelWeights: LevelWeights;
  questionCount: number;
  durationMinutes: number;
};

export type PersonalExamSession = {
  version: 1;
  id: string;
  config: PersonalExamConfig;
  questions: PersonalExamQuestion[];
  createdAt: string;
  ownerId?: string;
  startedAt?: string;
  deadlineAt?: number;
  answers?: Record<string, number>;
  submittedAt?: string;
  durationUsedSeconds?: number;
};

export type PersonalExamTemplate = PersonalExamConfig & {
  id: string;
  createdAt: string;
  updatedAt: string;
};
