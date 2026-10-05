'use client';

import { Input } from '@/components/ui/input';

export function ShortAnswerInput({ questionId, value, disabled, onChange }: {
  questionId: string; value: string; disabled: boolean; onChange: (value: string) => void;
}) {
  const id = `exam-answer-${questionId}`, hint = `${id}-hint`;
  return <div className="max-w-xl space-y-3 rounded-xl border border-border bg-muted/30 p-4 sm:p-5">
    <label htmlFor={id} className="block text-sm font-semibold text-foreground">Nhập đáp án</label>
    <Input id={id} type="text" inputMode="text" value={value} disabled={disabled}
      autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
      aria-describedby={hint} placeholder="Ví dụ: 5 hoặc 1/2"
      className="h-12 bg-surface text-base text-foreground"
      onChange={(event) => { if (Array.from(event.target.value).length <= 100) onChange(event.target.value); }} />
    <div id={hint} className="flex flex-wrap justify-between gap-2 text-xs leading-5 text-muted-foreground">
      <span>Chỉ nhập đáp án, không cần viết lời giải.</span><span>{Array.from(value).length}/100 ký tự</span>
    </div>
  </div>;
}
