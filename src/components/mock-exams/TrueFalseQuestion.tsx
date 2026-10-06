'use client';

import { useId } from 'react';
import { MathRenderer } from '@/features/practice/components/math-renderer';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { isTrueFalseAnswer, type TrueFalseAnswer } from '@/features/mock-exams/question-model';

type Props = {
  questionId: string;
  statements: { content: string }[];
  value: unknown;
  disabled?: boolean;
  onChange: (answer: TrueFalseAnswer) => void;
};

export function TrueFalseQuestion({ questionId, statements, value, disabled = false, onChange }: Props) {
  const instanceId = useId();
  const answer: TrueFalseAnswer = isTrueFalseAnswer(value) ? value : [null, null, null, null];
  function choose(index: number, choice: boolean | null) {
    const next: TrueFalseAnswer = [...answer];
    next[index] = choice;
    onChange(next);
  }
  return <div className="space-y-4">
    {statements.map((statement, index) => {
      const letter = String.fromCharCode(97 + index), name = `${instanceId}-${questionId}-${index}`;
      return <fieldset key={index} disabled={disabled} className="min-w-0 rounded-xl border border-border p-4">
        <legend className="max-w-full px-1 text-foreground">
          <span className="mr-2 font-semibold">{letter})</span>
          <span className="inline-block max-w-full align-middle break-words"><MathRenderer content={statement.content} /></span>
        </legend>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {[true, false].map((choice) => {
            const id = `${name}-${choice}`;
            return <label key={id} htmlFor={id} className={cn(
              'flex min-h-11 min-w-20 cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-base has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
              answer[index] === choice ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-card text-foreground',
              disabled && 'cursor-default opacity-60',
            )}>
              <input id={id} name={name} type="radio" value={String(choice)} checked={answer[index] === choice}
                disabled={disabled} aria-label={`${choice ? 'Đúng' : 'Sai'}, ý ${letter}`}
                className="h-4 w-4 accent-primary" onChange={() => choose(index, choice)} />
              {choice ? 'Đúng' : 'Sai'}
            </label>;
          })}
          <Button type="button" variant="ghost" className="min-h-11 px-3 text-muted-foreground"
            disabled={disabled || answer[index] === null} aria-label={`Bỏ chọn ý ${letter}`} onClick={() => choose(index, null)}>Bỏ chọn</Button>
        </div>
      </fieldset>;
    })}
  </div>;
}
