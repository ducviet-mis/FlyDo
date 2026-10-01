import type { ChapterWeight, LevelWeights, PersonalExamConfig, PersonalExamLevel, PersonalExamQuestion, PersonalExamSession, PersonalExamTemplate } from './types';

export const PERSONAL_EXAM_SESSION_PREFIX = 'flydo:personal-exam:v1:';
export const PERSONAL_EXAM_LEVELS: PersonalExamLevel[] = [1, 2, 3, 4];
export const LEVEL_META: Record<PersonalExamLevel, { label: string; target: string; estimatedSeconds: number }> = {
  1: { label: 'Level 1', target: 'Nhận biết', estimatedSeconds: 45 },
  2: { label: 'Level 2', target: 'Thông hiểu', estimatedSeconds: 75 },
  3: { label: 'Level 3', target: 'Vận dụng', estimatedSeconds: 120 },
  4: { label: 'Level 4', target: 'Vận dụng cao', estimatedSeconds: 180 },
};
export const DEFAULT_LEVEL_WEIGHTS: LevelWeights = { 1: 40, 2: 40, 3: 20, 4: 0 };
export const LEVEL_PRESETS: { name: string; weights: LevelWeights }[] = [
  { name: 'Củng cố nền tảng', weights: { 1: 60, 2: 40, 3: 0, 4: 0 } },
  { name: 'Luyện cân bằng', weights: DEFAULT_LEVEL_WEIGHTS },
  { name: 'Thử thách', weights: { 1: 10, 2: 30, 3: 50, 4: 10 } },
];

export function sumWeights(items: ChapterWeight[] | LevelWeights): number {
  return Array.isArray(items) ? items.reduce((sum, item) => sum + item.weight, 0) : Object.values(items).reduce((sum, value) => sum + value, 0);
}

/** Largest remainder; stable input order breaks ties. Never changes the total. */
export function allocateByWeights<T extends string | number>(total: number, items: Array<{ id: T; weight: number }>): Map<T, number> {
  const result = new Map<T, number>(items.map(item => [item.id, 0]));
  const positive = items.filter(item => Number.isFinite(item.weight) && item.weight > 0);
  const weightTotal = positive.reduce((sum, item) => sum + item.weight, 0);
  if (!Number.isInteger(total) || total <= 0 || !Number.isFinite(weightTotal) || !weightTotal) return result;
  const fractions = positive.map(item => {
    const exact = total * item.weight / weightTotal;
    const whole = Math.floor(exact);
    result.set(item.id, whole);
    return { id: item.id, fraction: exact - whole };
  });
  let remaining = total - [...result.values()].reduce((sum, value) => sum + value, 0);
  for (const item of fractions.sort((a, b) => b.fraction - a.fraction)) {
    if (remaining-- <= 0) break;
    result.set(item.id, (result.get(item.id) || 0) + 1);
  }
  return result;
}

export function equalChapterWeights(chapters: string[]): ChapterWeight[] {
  const weights = allocateByWeights(100, chapters.map(chapter => ({ id: chapter, weight: 1 })));
  return chapters.map(chapter => ({ chapter, weight: weights.get(chapter) || 0 }));
}

export function getLevelQuestionNeeds(count: number, weights: LevelWeights) {
  return allocateByWeights(count, PERSONAL_EXAM_LEVELS.map(level => ({ id: level, weight: weights[level] })));
}

export function getConfigIssues(config: PersonalExamConfig): string[] {
  const issues: string[] = [];
  if (![6, 7, 8, 9].includes(config.grade)) issues.push('Hãy chọn lớp từ 6 đến 9.');
  if (!['exam', 'practice'].includes(config.mode)) issues.push('Hãy chọn Tự luyện hoặc Thi thử.');
  if (!Number.isInteger(config.questionCount) || config.questionCount < 5 || config.questionCount > 100) issues.push('Số câu phải là số nguyên từ 5 đến 100.');
  if (!Number.isInteger(config.durationMinutes) || config.durationMinutes < 5 || config.durationMinutes > 180) issues.push('Thời lượng phải là số nguyên từ 5 đến 180 phút.');
  if (typeof config.title !== 'string' || config.title.length > 80) issues.push('Tên đề không được dài quá 80 ký tự.');
  if (!Array.isArray(config.chapterWeights) || !config.chapterWeights.length) issues.push('Hãy chọn ít nhất một chương.');
  else {
    if (new Set(config.chapterWeights.map(item => item.chapter)).size !== config.chapterWeights.length) issues.push('Danh sách chương bị trùng. Hãy chọn lại phạm vi.');
    if (config.chapterWeights.some(item => typeof item.chapter !== 'string' || !item.chapter.trim() || !Number.isInteger(item.weight) || item.weight < 0 || item.weight > 100
      || (item.lessonIds !== undefined && (!Array.isArray(item.lessonIds) || item.lessonIds.some(id => typeof id !== 'string' || !id) || new Set(item.lessonIds).size !== item.lessonIds.length)))) issues.push('Tỉ lệ chương và bài đã chọn chưa hợp lệ.');
    if (sumWeights(config.chapterWeights) !== 100) issues.push('Tổng tỉ lệ chương phải bằng 100%.');
    if (!config.chapterWeights.some(item => item.weight > 0)) issues.push('Hãy chọn ít nhất một chương có tỉ lệ lớn hơn 0%.');
  }
  if (!config.levelWeights || PERSONAL_EXAM_LEVELS.some(level => !Number.isInteger(config.levelWeights[level]) || config.levelWeights[level] < 0 || config.levelWeights[level] > 100)
    || Object.keys(config.levelWeights).length !== 4 || sumWeights(config.levelWeights) !== 100) issues.push('Tổng tỉ lệ Level phải bằng 100%, mỗi tỉ lệ là số nguyên từ 0 đến 100.');
  return issues;
}

export type PersonalExamCandidate = Pick<PersonalExamQuestion, 'id' | 'lessonId' | 'chapter' | 'difficultyLevel'>;
export type PersonalExamPlan = {
  valid: boolean;
  issues: string[];
  chapterNeeds: Map<string, number>;
  levelNeeds: Map<PersonalExamLevel, number>;
  cells: Map<string, LevelWeights>;
  availableByChapter: Map<string, number>;
  availableByLevel: LevelWeights;
  candidates: PersonalExamCandidate[];
};

type FlowEdge = { to: number; reverse: number; capacity: number; original: number; cost: number };

/** Exact chapter AND level quotas, constrained by the real bank.
 * Min-cost flow prefers each chapter's proportional mix; residual edges avoid
 * greedy false negatives. No borrowing that changes either chosen quota.
 */
export function getPersonalExamPlan(config: PersonalExamConfig, bank: PersonalExamCandidate[]): PersonalExamPlan {
  const issues = getConfigIssues(config);
  const chapters = config.chapterWeights.filter(item => item.weight > 0);
  const scope = new Map(chapters.map(item => [item.chapter, item.lessonIds ? new Set(item.lessonIds) : null]));
  const seen = new Set<string>();
  const candidates = bank.filter(question => {
    if (!question.id || seen.has(question.id) || !PERSONAL_EXAM_LEVELS.includes(question.difficultyLevel) || !scope.has(question.chapter)) return false;
    const lessons = scope.get(question.chapter);
    if (lessons && !lessons.has(question.lessonId)) return false;
    seen.add(question.id);
    return true;
  });
  const availableByChapter = new Map(chapters.map(item => [item.chapter, 0]));
  const availableByLevel: LevelWeights = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const capacity = new Map(chapters.map(item => [item.chapter, { 1: 0, 2: 0, 3: 0, 4: 0 } as LevelWeights]));
  for (const question of candidates) {
    availableByChapter.set(question.chapter, (availableByChapter.get(question.chapter) || 0) + 1);
    availableByLevel[question.difficultyLevel]++;
    capacity.get(question.chapter)![question.difficultyLevel]++;
  }
  const chapterNeeds = allocateByWeights(config.questionCount, chapters.map(item => ({ id: item.chapter, weight: item.weight })));
  const levelNeeds = getLevelQuestionNeeds(config.questionCount, config.levelWeights);
  const cells = new Map(chapters.map(item => [item.chapter, { 1: 0, 2: 0, 3: 0, 4: 0 } as LevelWeights]));
  const plan = { valid: false, issues, chapterNeeds, levelNeeds, cells, availableByChapter, availableByLevel, candidates };
  if (issues.length) return plan;
  for (const chapter of chapters) {
    const need = chapterNeeds.get(chapter.chapter) || 0;
    const available = availableByChapter.get(chapter.chapter) || 0;
    if (available < need) issues.push(`${chapter.chapter}: cần ${need} câu, chỉ có ${available} câu hợp lệ trong các bài đã chọn.`);
  }
  for (const level of PERSONAL_EXAM_LEVELS) {
    const need = levelNeeds.get(level) || 0;
    if (availableByLevel[level] < need) issues.push(`Level ${level}: cần ${need} câu, chỉ có ${availableByLevel[level]} câu hợp lệ. Giảm tỉ lệ hoặc chọn thêm bài.`);
  }
  if (issues.length) return plan;

  const source = 0, levelStart = chapters.length + 1, sink = levelStart + 4;
  const graph: FlowEdge[][] = Array.from({ length: sink + 1 }, () => []);
  const addEdge = (from: number, to: number, amount: number, cost = 0) => {
    const edge = { to, reverse: graph[to].length, capacity: amount, original: amount, cost };
    graph[from].push(edge);
    graph[to].push({ to: from, reverse: graph[from].length - 1, capacity: 0, original: 0, cost: -cost });
    return edge;
  };
  const tracked: { chapter: string; level: PersonalExamLevel; edge: FlowEdge }[] = [];
  chapters.forEach((chapter, index) => {
    const need = chapterNeeds.get(chapter.chapter) || 0;
    addEdge(source, index + 1, need);
    PERSONAL_EXAM_LEVELS.forEach((level, levelIndex) => {
      let remaining = capacity.get(chapter.chapter)![level];
      const ideal = need * (levelNeeds.get(level) || 0) / config.questionCount;
      const base = Math.min(remaining, Math.floor(ideal));
      tracked.push({ chapter: chapter.chapter, level, edge: addEdge(index + 1, levelStart + levelIndex, base) });
      remaining -= base;
      if (remaining && ideal % 1) {
        tracked.push({ chapter: chapter.chapter, level, edge: addEdge(index + 1, levelStart + levelIndex, 1, 1000 - Math.round((ideal % 1) * 1000)) });
        remaining--;
      }
      tracked.push({ chapter: chapter.chapter, level, edge: addEdge(index + 1, levelStart + levelIndex, remaining, 1000) });
    });
  });
  PERSONAL_EXAM_LEVELS.forEach((level, index) => addEdge(levelStart + index, sink, levelNeeds.get(level) || 0));
  let flow = 0;
  while (flow < config.questionCount) {
    const distance = Array(graph.length).fill(Infinity) as number[];
    const previous: { from: number; edge: number }[] = [];
    const queue = [source];
    const queued = new Set([source]);
    distance[source] = 0;
    for (let head = 0; head < queue.length; head++) {
      const node = queue[head]; queued.delete(node);
      graph[node].forEach((edge, index) => {
        if (edge.capacity <= 0 || distance[edge.to] <= distance[node] + edge.cost) return;
        distance[edge.to] = distance[node] + edge.cost;
        previous[edge.to] = { from: node, edge: index };
        if (!queued.has(edge.to)) { queued.add(edge.to); queue.push(edge.to); }
      });
    }
    if (!Number.isFinite(distance[sink])) break;
    let amount = config.questionCount - flow;
    for (let node = sink; node !== source; node = previous[node].from) amount = Math.min(amount, graph[previous[node].from][previous[node].edge].capacity);
    for (let node = sink; node !== source; node = previous[node].from) {
      const edge = graph[previous[node].from][previous[node].edge];
      edge.capacity -= amount;
      graph[node][edge.reverse].capacity += amount;
    }
    flow += amount;
  }
  if (flow !== config.questionCount) issues.push('Ngân hàng chưa có tổ hợp câu đáp ứng đồng thời tỉ lệ chương và Level. Hãy giảm số câu, đổi tỉ lệ hoặc chọn thêm bài. Hệ thống không tự lấy bù từ chương khác.');
  else for (const { chapter, level, edge } of tracked) cells.get(chapter)![level] += edge.original - edge.capacity;
  plan.valid = issues.length === 0;
  return plan;
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [next[index], next[swap]] = [next[swap], next[index]];
  }
  return next;
}

/** Choose only the planned IDs before requesting heavy solutions/diagrams. */
export function pickPersonalExamCandidateIds(plan: PersonalExamPlan): string[] {
  if (!plan.valid) throw new Error(plan.issues.join(' '));
  const ids: string[] = [];
  for (const [chapter, counts] of plan.cells) for (const level of PERSONAL_EXAM_LEVELS) {
    ids.push(...shuffle(plan.candidates.filter(question => question.chapter === chapter && question.difficultyLevel === level)).slice(0, counts[level]).map(question => question.id));
  }
  return ids;
}

export function buildPersonalExam(config: PersonalExamConfig, questions: PersonalExamQuestion[]): { questions: PersonalExamQuestion[]; warnings: string[] } {
  const valid = questions.filter(question => typeof question.content === 'string' && question.content.trim()
    && Array.isArray(question.options) && question.options.length >= 2 && question.options.length <= 6 && question.options.every(option => typeof option === 'string' && option.trim())
    && Number.isInteger(question.correctAnswer) && question.correctAnswer >= 0 && question.correctAnswer < question.options.length);
  const plan = getPersonalExamPlan(config, valid);
  if (!plan.valid) throw new Error(plan.issues.join(' '));
  const byId = new Map<string, PersonalExamQuestion>();
  for (const question of valid) if (!byId.has(question.id)) byId.set(question.id, question);
  const picked = pickPersonalExamCandidateIds(plan).map(id => byId.get(id)!);
  if (picked.length !== config.questionCount || new Set(picked.map(question => question.id)).size !== picked.length) throw new Error('Ngân hàng đã thay đổi. Hãy tải lại ngân hàng rồi tạo đề.');
  return { questions: shuffle(picked), warnings: [] };
}

export function getEstimatedSeconds(count: number, weights: LevelWeights): number {
  const needs = getLevelQuestionNeeds(count, weights);
  return PERSONAL_EXAM_LEVELS.reduce((sum, level) => sum + (needs.get(level) || 0) * LEVEL_META[level].estimatedSeconds, 0);
}

export function createPersonalExamSession(config: PersonalExamConfig, questions: PersonalExamQuestion[], ownerId?: string): PersonalExamSession {
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return { version: 1, id, config, questions, createdAt: new Date().toISOString(), ...(ownerId ? { ownerId } : {}) };
}

/** JSONB chapter_weights already accepts lessonIds; older templates remain compatible. */
export function parsePersonalExamTemplate(value: unknown): PersonalExamTemplate | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.name !== 'string' || !row.name.trim() || !Array.isArray(row.chapter_weights) || !row.level_weights || typeof row.level_weights !== 'object') return null;
  const config = { title: row.name, grade: row.grade, mode: row.mode, chapterWeights: row.chapter_weights, levelWeights: row.level_weights, questionCount: row.question_count, durationMinutes: row.duration_minutes } as PersonalExamConfig;
  try { if (getConfigIssues(config).length) return null; } catch { return null; }
  return { ...config, id: row.id, createdAt: String(row.created_at || ''), updatedAt: String(row.updated_at || '') };
}

export function personalExamStorageKey(id: string) { return `${PERSONAL_EXAM_SESSION_PREFIX}${id}`; }
export function activePersonalExamKey(owner: string) { return `${PERSONAL_EXAM_SESSION_PREFIX}active:${owner}`; }
export function formatMinutes(seconds: number) { const minutes = Math.round(seconds / 60); return minutes < 1 ? 'dưới 1 phút' : `${minutes} phút`; }
