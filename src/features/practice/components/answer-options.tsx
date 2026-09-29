'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { MathRenderer, formatOptionMath } from './math-renderer';
import { Check, X } from 'lucide-react';

interface AnswerOptionsProps {
  options: string[];
  selectedAnswer: number | null;
  correctAnswer: number;
  onSelect: (index: number) => void;
}

export function AnswerOptions({ options, selectedAnswer, correctAnswer, onSelect }: AnswerOptionsProps) {
  const letters = ['A', 'B', 'C', 'D'];
  const isAnswered = selectedAnswer !== null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 mt-4 md:mt-6">
      {options.map((option, idx) => {
        const isSelected = selectedAnswer === idx;
        const isCorrect = correctAnswer === idx;
        const answerState = isAnswered
          ? (isCorrect ? 'correct' : isSelected ? 'wrong' : 'neutral')
          : (isSelected ? 'selected' : 'idle');

        let stateClass = "bg-card border-border hover:border-primary hover:bg-primary-soft shadow-soft";
        let letterClass = "bg-muted text-muted-foreground font-bold";

        if (isAnswered) {
          if (isCorrect) {
            stateClass = "bg-success-soft border-success shadow-card ring-2 ring-success/20";
            letterClass = "bg-success text-success-foreground font-bold";
          } else if (isSelected && !isCorrect) {
            stateClass = "bg-destructive-soft border-destructive shadow-soft";
            letterClass = "bg-destructive text-destructive-foreground font-bold";
          } else {
            stateClass = "bg-card border-border";
          }
        }

        return (
          <button
            key={idx}
            data-answer-state={answerState}
            onClick={() => onSelect(idx)}
            disabled={isAnswered}
            aria-pressed={isSelected}
            aria-label={`${letters[idx]}: ${option}${isAnswered ? (isCorrect ? '. Đáp án đúng' : isSelected ? '. Bạn đã chọn, chưa chính xác' : '') : ''}`}
            className={cn(
              "sol-answer-option flex min-w-0 items-center gap-3 md:gap-4 p-4 md:p-5 rounded-xl border transition-colors duration-200 text-left group disabled:cursor-default",
              stateClass,
              !isAnswered && "hover:shadow-soft"
            )}
          >
            <div className={cn(
              "w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-sm transition-colors",
              letterClass,
              !isAnswered && "group-hover:bg-primary-soft group-hover:text-primary"
            )}>
              {letters[idx]}
            </div>
            <div className="min-w-0 flex-1 overflow-x-auto text-foreground">
              <MathRenderer content={formatOptionMath(option)} />
            </div>
            {isAnswered && isCorrect && <Check aria-hidden="true" className="h-5 w-5 shrink-0 text-success" />}
            {isAnswered && isSelected && !isCorrect && <X aria-hidden="true" className="h-5 w-5 shrink-0 text-destructive" />}
          </button>
        );
      })}
    </div>
  );
}
