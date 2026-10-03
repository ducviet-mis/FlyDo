import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { MathRenderer } from '@/features/practice/components/math-renderer';
import { GeometryDiagram } from '@/features/geometry/components/geometry-diagram';
import type { DragFillData, TheoryQuestion, TrueFalseData } from '../types';

export function TheoryQuestionPreview({ question, index }: { question: TheoryQuestion; index: number }) {
  const isTrueFalse = question.question_type === 'true_false';

  return (
    <Card className="rounded-2xl border-border bg-card shadow-soft">
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-primary text-primary-foreground">Câu {index + 1}</Badge>
          <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
            {isTrueFalse ? 'Đúng / Sai' : 'Kéo thả điền khuyết'}
          </Badge>
        </div>
        <div className="font-semibold text-foreground"><MathRenderer content={question.prompt} /></div>
        <GeometryDiagram data={question.data.diagram} showValidationError />

        {isTrueFalse ? (
          <div className="space-y-3">
            {(question.data as TrueFalseData).statements.map((statement, statementIndex) => (
              <div key={statementIndex} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-muted/40 p-4">
                <div className="min-w-0 flex-1"><MathRenderer content={statement.text} /></div>
                <Badge variant="outline" className={statement.answer ? 'shrink-0 border-success/40 bg-success-soft text-success' : 'shrink-0 border-destructive/40 bg-destructive-soft text-destructive'}>
                  {statement.answer ? 'Đúng' : 'Sai'}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/40 p-4 leading-8 text-foreground">
              {(question.data as DragFillData).template.split(/(\{\{\d+\}\})/g).map((part, partIndex) => {
                const match = part.match(/^\{\{(\d+)\}\}$/);
                if (!match) return <MathRenderer key={partIndex} content={part} />;
                const answer = (question.data as DragFillData).answers[Number(match[1]) - 1];
                return <Badge key={partIndex} className="mx-1 bg-success text-success-foreground"><MathRenderer content={answer} /></Badge>;
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              {(question.data as DragFillData).options.map((option) => <Badge key={option} variant="outline" className="border-primary/40 bg-primary-soft px-3 py-1.5 text-primary"><MathRenderer content={option} /></Badge>)}
            </div>
          </div>
        )}

        {question.solution && <div className="rounded-xl border border-success/30 bg-success-soft p-4 text-sm leading-6 text-foreground"><span className="font-bold text-success">Giải thích: </span><MathRenderer content={question.solution} variant="solution" /></div>}
      </CardContent>
    </Card>
  );
}
