import { fetchAllPages } from '@/features/practice/data/fetch-all-pages';
import { getSupabaseClient } from '@/lib/supabase/client';
import type { GeometryDiagram } from '@/features/geometry/types';
import type { PersonalExamLevel, PersonalExamQuestion } from './types';
import type { PersonalExamCandidate } from './utils';

export type PersonalExamLesson = { id: string; grade: number; chapter: string; title: string; chapter_sort_order?: number | null; sort_order?: number | null };
type QuestionRow = { id: unknown; lesson_id: unknown; content: unknown; options: unknown; correct_answer: unknown; difficulty_level?: unknown; solution?: unknown; has_math?: unknown; diagram?: unknown };
export type PersonalExamBank = { lessons: PersonalExamLesson[]; candidates: PersonalExamCandidate[]; excludedCount: number };

function validRow(row: QuestionRow, lessons: Map<string, PersonalExamLesson>) {
  const level = Number(row.difficulty_level || 1);
  return typeof row.id === 'string' && row.id.length > 0 && typeof row.lesson_id === 'string' && lessons.has(row.lesson_id)
    && Number.isInteger(level) && level >= 1 && level <= 4
    && typeof row.content === 'string' && row.content.trim().length > 0
    && Array.isArray(row.options) && row.options.length >= 2 && row.options.length <= 6 && row.options.every(option => typeof option === 'string' && option.trim())
    && Number.isInteger(row.correct_answer) && Number(row.correct_answer) >= 0 && Number(row.correct_answer) < row.options.length;
}

export function readBankCandidates(rows: QuestionRow[], lessons: PersonalExamLesson[]): Pick<PersonalExamBank, 'candidates' | 'excludedCount'> {
  const lessonById = new Map(lessons.map(lesson => [lesson.id, lesson]));
  const seen = new Set<string>();
  const candidates: PersonalExamCandidate[] = [];
  let excludedCount = 0;
  for (const row of rows) {
    if (!validRow(row, lessonById) || seen.has(row.id as string)) { excludedCount++; continue; }
    const lesson = lessonById.get(row.lesson_id as string)!;
    candidates.push({ id: row.id as string, lessonId: lesson.id, chapter: lesson.chapter, difficultyLevel: Number(row.difficulty_level || 1) as PersonalExamLevel });
    seen.add(row.id as string);
  }
  return { candidates, excludedCount };
}

/** Page every request and chunk IN filters to avoid both row caps and URL limits. */
async function readQuestions(ids: string[], column: 'id' | 'lesson_id', full: boolean) {
  const supabase = getSupabaseClient();
  const rows: QuestionRow[] = [];
  for (let offset = 0; offset < ids.length; offset += 50) {
    rows.push(...await fetchAllPages<QuestionRow>(async (from, to) => supabase.from('practice_questions')
      .select(full ? 'id, lesson_id, content, options, correct_answer, difficulty_level, solution, has_math, diagram' : 'id, lesson_id, content, options, correct_answer, difficulty_level')
      .in(column, ids.slice(offset, offset + 50)).order('id').range(from, to)));
  }
  return rows;
}

export async function loadPersonalExamBank(grade: number): Promise<PersonalExamBank> {
  const supabase = getSupabaseClient();
  const lessons = await fetchAllPages<PersonalExamLesson>(async (from, to) => supabase.from('practice_lessons')
    .select('id, grade, chapter, title, chapter_sort_order, sort_order').eq('grade', grade)
    .order('chapter_sort_order').order('chapter').order('sort_order').order('title').order('id').range(from, to));
  const rows = await readQuestions(lessons.map(lesson => lesson.id), 'lesson_id', false);
  return { lessons, ...readBankCandidates(rows, lessons) };
}

export async function loadPersonalExamQuestions(ids: string[], lessons: PersonalExamLesson[]): Promise<PersonalExamQuestion[]> {
  const rows = await readQuestions([...new Set(ids)], 'id', true);
  const { candidates } = readBankCandidates(rows, lessons);
  const lessonById = new Map(lessons.map(lesson => [lesson.id, lesson]));
  const rowById = new Map<string, QuestionRow>();
  for (const row of rows) if (validRow(row, lessonById) && !rowById.has(row.id as string)) rowById.set(row.id as string, row);
  return candidates.map(candidate => {
    const row = rowById.get(candidate.id)!;
    return { ...candidate, lessonTitle: lessons.find(lesson => lesson.id === candidate.lessonId)?.title, content: row.content as string, options: row.options as string[], correctAnswer: row.correct_answer as number,
      solution: typeof row.solution === 'string' ? row.solution : '', hasMath: Boolean(row.has_math), diagram: row.diagram as GeometryDiagram | undefined };
  });
}
