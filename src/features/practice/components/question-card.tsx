'use client';

import React from 'react';
import { Question } from '../types';
import { MathRenderer } from './math-renderer';
import { AnswerOptions } from './answer-options';
import { SolutionDisplay } from './solution-display';
import { Progress } from '@/components/ui/progress';
import { BookmarkCheck, BookmarkPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GeometryDiagram } from '@/features/geometry/components/geometry-diagram';
import { ReportQuestionButton } from '@/features/question-reports/report-question-button';

interface QuestionCardProps {
  question: Question;
  currentIndex: number;
  totalQuestions: number;
  selectedAnswer: number | null;
  isCorrect: boolean | null;
  showSolution: boolean;
  onSelectAnswer: (idx: number) => void;
  onNext: () => void;
  isSaved?: boolean;
  onToggleSave?: () => void;
}

export function QuestionCard({
  question,
  currentIndex,
  totalQuestions,
  selectedAnswer,
  isCorrect,
  showSolution,
  onSelectAnswer,
  onNext,
  isSaved,
  onToggleSave
}: QuestionCardProps) {
  const progressPercent = ((currentIndex) / totalQuestions) * 100;

  return (
    <div className="study-question w-full">
      <div className="mb-3 flex items-center justify-between gap-3 px-4 md:px-1">
        <p className="text-sm font-semibold text-foreground">Câu <span className="text-primary">{currentIndex + 1}</span><span className="ml-1 font-normal text-muted-foreground">/ {totalQuestions}</span></p>
        <ReportQuestionButton key={question.id} source="practice" questionId={question.id} />
      </div>

      <Progress value={progressPercent} aria-label="Vị trí câu hỏi" className="mb-5 h-1 bg-track md:mb-6 [&>div]:bg-primary" />

      <div className="bg-card rounded-none md:rounded-xl shadow-none md:shadow-card border-y md:border border-border p-5 sm:p-7 md:p-9">
        <div className="mb-6 flex flex-col items-stretch gap-4 md:mb-10 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 text-lg font-medium leading-relaxed text-foreground md:text-xl">
            <MathRenderer content={question.content} />
          </div>

          {onToggleSave && (
            <Button
              type="button"
              variant="outline"
              onClick={onToggleSave}
              className={`min-h-11 w-full shrink-0 rounded-xl px-4 font-semibold transition-colors sm:w-auto ${isSaved ? 'border-primary bg-primary-soft text-primary hover:bg-primary-soft/80 hover:text-primary' : 'border-primary/40 bg-card text-primary hover:border-primary hover:bg-primary-soft'}`}
              title={isSaved ? 'Nhấn để bỏ lưu câu hỏi' : 'Lưu câu hỏi để làm lại sau'}
              aria-label={isSaved ? 'Bỏ lưu câu hỏi' : 'Lưu câu hỏi để làm lại sau'}
              aria-pressed={!!isSaved}
            >
              {isSaved ? <BookmarkCheck aria-hidden="true" className="h-5 w-5" /> : <BookmarkPlus aria-hidden="true" className="h-5 w-5" />}
              <span aria-live="polite">{isSaved ? 'Đã lưu câu này' : 'Lưu câu này'}</span>
            </Button>
          )}
        </div>

        <GeometryDiagram data={question.diagram} />

        <AnswerOptions
          options={question.options}
          selectedAnswer={selectedAnswer}
          correctAnswer={question.correctAnswer}
          onSelect={onSelectAnswer}
        />

        {showSolution && (
          <SolutionDisplay
            isCorrect={isCorrect!}
            correctAnswer={question.correctAnswer}
            solution={question.solution}
            onNext={onNext}
            isLastQuestion={currentIndex === totalQuestions - 1}
          />
        )}
      </div>
    </div>
  );
}
