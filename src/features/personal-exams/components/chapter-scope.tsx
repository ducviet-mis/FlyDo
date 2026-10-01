'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { ChapterWeight } from '../types';
import type { PersonalExamLesson } from '../bank';
import type { PersonalExamCandidate } from '../utils';

interface ChapterScopeProps {
  chapter: string;
  index: number;
  value?: ChapterWeight;
  lessons: PersonalExamLesson[];
  candidates: PersonalExamCandidate[];
  needed: number;
  onToggle: (selected: boolean) => void;
  onWeight: (weight: number) => void;
  onLessons: (ids: string[]) => void;
}

export function ChapterScope({ chapter, index, value, lessons, candidates, needed, onToggle, onWeight, onLessons }: ChapterScopeProps) {
  const [expanded, setExpanded] = useState(false);
  const selected = (value?.weight || 0) > 0;
  const ids = value?.lessonIds || lessons.map(lesson => lesson.id);
  const selectedIds = new Set(ids);
  const available = candidates.filter(question => selectedIds.has(question.lessonId)).length;
  const countByLesson = new Map(lessons.map(lesson => [lesson.id, 0]));
  candidates.forEach(question => countByLesson.set(question.lessonId, (countByLesson.get(question.lessonId) || 0) + 1));
  const id = `scope-chapter-${index}`;

  return <div className={cn('min-w-0 rounded-xl border', selected ? 'border-primary/35 bg-primary-soft/25' : 'border-border bg-card')}>
    <div className="flex flex-wrap items-center gap-2 p-3 sm:gap-3 sm:p-4">
      <label htmlFor={id} className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3">
        <input id={id} type="checkbox" className="h-5 w-5 shrink-0 accent-primary" checked={selected} disabled={candidates.length === 0} onChange={event => onToggle(event.target.checked)} />
        <span className="min-w-0"><span className="block text-sm font-semibold leading-6 [overflow-wrap:anywhere]">{chapter}</span><span className="block text-xs leading-5 text-muted-foreground">{selected ? `${ids.length}/${lessons.length} bài · ${available} câu hợp lệ` : `${lessons.length} bài · ${candidates.length} câu hợp lệ`}</span></span>
      </label>
      {selected && <div className="flex items-center gap-1.5">
        <Input aria-label={`Tỉ lệ chương ${chapter}`} type="number" inputMode="numeric" min={1} max={100} step={1} value={value?.weight || ''} onChange={event => onWeight(Math.min(100, Math.max(1, Math.round(Number(event.target.value)))))} className="h-11 w-[4.5rem] px-2 text-center text-base tabular-nums" />
        <span className="text-sm text-muted-foreground">%</span>
      </div>}
      <button type="button" aria-expanded={expanded} aria-controls={`${id}-lessons`} aria-label={`${expanded ? 'Ẩn' : 'Chọn'} bài trong ${chapter}`} onClick={() => setExpanded(open => !open)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ChevronDown aria-hidden="true" className={cn('h-4 w-4 motion-safe:transition-transform', expanded && 'rotate-180')} /></button>
    </div>
    {selected && <p className={cn('px-4 pb-3 text-xs leading-5', available < needed ? 'text-destructive' : 'text-muted-foreground')}>Dự kiến {needed} câu trong đề · Ngân hàng có {available} câu{available < needed ? ' — chưa đủ' : ''}</p>}
    <div id={`${id}-lessons`} hidden={!expanded} className="border-t border-border p-3 sm:p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-medium text-muted-foreground">Chọn những bài bạn đã học</p><button type="button" disabled={!selected} onClick={() => onLessons(lessons.filter(lesson => (countByLesson.get(lesson.id) || 0) > 0).map(lesson => lesson.id))} className="min-h-11 rounded-lg px-3 text-sm font-medium text-primary disabled:opacity-50">Chọn tất cả bài có câu</button></div>
      {lessons.map(lesson => <label key={lesson.id} className={cn('flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-2 py-2.5', !selected && 'opacity-60')}>
        <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-primary" checked={selected && selectedIds.has(lesson.id)} disabled={!selected || !countByLesson.get(lesson.id)} onChange={event => onLessons(event.target.checked ? [...ids, lesson.id] : ids.filter(id => id !== lesson.id))} />
        <span className="min-w-0 flex-1 text-sm leading-6 [overflow-wrap:anywhere]">{lesson.title}</span><span className="shrink-0 text-xs leading-6 tabular-nums text-muted-foreground">{countByLesson.get(lesson.id) || 0} câu</span>
      </label>)}
      {!selected && <p className="mt-2 text-xs text-muted-foreground">Chọn chương trước để chọn từng bài.</p>}
    </div>
  </div>;
}
