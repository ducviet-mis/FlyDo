'use client';

interface AccuracyPieChartProps { correct: number; wrong: number; accuracy: number; }
export function AccuracyPieChart({ correct, wrong, accuracy }: AccuracyPieChartProps) {
  const total = correct + wrong;
  const correctPercent = total ? correct / total * 100 : 0;
  const gap = correct > 0 && wrong > 0 ? 100 / 120 : 0; // Same 3-degree separation.
  return (
    <div role="img" aria-label={`Chính xác ${accuracy} phần trăm. ${correct} câu đúng, ${wrong} câu sai.`}>
      <div className="relative h-[180px] w-full">
        <svg viewBox="0 0 180 180" className="mx-auto h-[180px] w-[180px] max-w-full" aria-hidden="true">
          {total === 0 ? <circle cx="90" cy="90" r="63" fill="none" stroke="rgb(var(--color-track))" strokeWidth="10" /> : <g transform="rotate(-90 90 90)" fill="none" strokeWidth="10">
            {correct > 0 && <circle cx="90" cy="90" r="63" pathLength="100" stroke="rgb(var(--color-success))" strokeDasharray={`${Math.max(0, correctPercent - gap)} 100`} strokeDashoffset={-gap / 2}><title>Đúng: {correct} câu</title></circle>}
            {wrong > 0 && <circle cx="90" cy="90" r="63" pathLength="100" stroke="rgb(var(--color-danger))" strokeDasharray={`${Math.max(0, 100 - correctPercent - gap)} 100`} strokeDashoffset={-correctPercent - gap / 2}><title>Sai: {wrong} câu</title></circle>}
          </g>}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="vivux-stat-number text-3xl">{accuracy}%</span><span className="mt-1 text-xs text-muted-foreground">chính xác</span></div>
      </div>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 pb-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" />Đúng {correct}</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-destructive" />Sai {wrong}</span>
      </div>
    </div>
  );
}
