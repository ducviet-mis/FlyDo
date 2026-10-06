import { MathRenderer } from '@/features/practice/components/math-renderer';
import { isTrueFalseAnswer } from '@/features/mock-exams/question-model';
import { cn } from '@/lib/utils';

export type GradedStatement = { content: string; correct_answer: boolean; solution?: string };

// Used only for graded results and the authenticated ADMIN report snapshot viewer.
export function TrueFalseReview({ statements, answer, showStudentAnswer = false }: {
  statements: GradedStatement[]; answer?: unknown; showStudentAnswer?: boolean;
}) {
  const choices = isTrueFalseAnswer(answer) ? answer : [null, null, null, null];
  return <div className="mb-6 space-y-3">
    {statements.map((statement, index) => {
      const choice = choices[index], chosen = typeof choice === 'boolean';
      const correct = chosen && choice === statement.correct_answer;
      return <div key={index} data-statement-review className={cn('min-w-0 rounded-xl border p-4',
        !showStudentAnswer || !chosen ? 'border-border bg-muted/30' : correct ? 'border-success bg-success-soft' : 'border-destructive bg-destructive-soft')}>
        <div className="mb-3 flex min-w-0 items-start gap-2"><span className="font-semibold">{String.fromCharCode(97 + index)})</span>
          <div className="min-w-0 flex-1 break-words"><MathRenderer content={statement.content} /></div></div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {showStudentAnswer && <p>Bạn chọn: <span className="font-semibold">{chosen ? choice ? 'Đúng' : 'Sai' : 'Chưa chọn'}</span>
            {chosen && <span className={cn('ml-2 font-semibold', correct ? 'text-success' : 'text-destructive')}>{correct ? '· Chính xác' : '· Chưa chính xác'}</span>}</p>}
          <p>Đáp án chuẩn: <span className="font-semibold">{statement.correct_answer ? 'Đúng' : 'Sai'}</span></p>
        </div>
        {statement.solution && <div className="mt-3 border-t border-border pt-3"><p className="mb-2 text-sm font-semibold">Lời giải ý {String.fromCharCode(97 + index)}</p><MathRenderer content={statement.solution} variant="solution" /></div>}
      </div>;
    })}
  </div>;
}
