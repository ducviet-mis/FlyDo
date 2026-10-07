'use client';

import { useEffect, useState } from 'react';
import { Clock3, ListChecks, Target, type LucideIcon } from 'lucide-react';
import { useDailyGoal } from '../hooks/use-daily-goal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GoalSettingDialog } from './goal-setting-dialog';

function GoalMetric({ percent, current, target, label, suffix, tone, icon: Icon, compact = false }: {
  percent: number; current: number; target: number; label: string; suffix: string; tone: string; icon: LucideIcon; compact?: boolean;
}) {
  const radius = 31;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - Math.min(100, percent) / 100 * circumference;
  return (
    <div className={compact ? 'flex min-w-0 flex-col items-start gap-2 border-r border-border/60 px-3 first:pl-0 last:border-0 last:pr-0 sm:flex-row sm:items-center sm:gap-3' : 'flex min-w-0 items-center gap-4 border-b border-border/60 py-4 last:border-0 sm:flex-col sm:items-start sm:gap-3 sm:border-b-0 sm:border-r sm:px-4 sm:first:pl-0 sm:last:pr-0'}>
      <div className={`relative ${compact ? 'h-11 w-11' : 'h-[76px] w-[76px]'} shrink-0 ${tone}`} role="img" aria-label={`${label}: ${current}/${target} ${suffix}, ${percent}%`}>
        <svg viewBox="0 0 76 76" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="38" cy="38" r={radius} fill="none" stroke="currentColor" strokeWidth="5" className="text-track" />
          <circle cx="38" cy="38" r={radius} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} className="transition-[stroke-dashoffset] duration-220" />
        </svg>
        <span className={`absolute inset-0 flex items-center justify-center ${compact ? 'text-[10px]' : 'text-base'} font-bold tabular-nums text-foreground`}>{percent}%</span>
      </div>
      <div className="min-w-0">
        <p className={`flex items-center gap-1.5 ${compact ? 'text-xs' : 'text-sm'} font-medium text-muted-foreground`}>{!compact && <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />}{label}</p>
        <p className="mt-1.5 flex flex-wrap items-baseline gap-1.5"><span className={`vivux-stat-number ${compact ? 'text-xl' : 'text-2xl'}`}>{current}</span><span className={`${compact ? 'text-xs' : 'text-sm'} text-muted-foreground`}>/ {target} {suffix}</span></p>
      </div>
    </div>
  );
}

export function GoalRing({ compact = false }: { compact?: boolean }) {
  const { percentages, progress, goals, currentAccuracy } = useDailyGoal();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return (
    <Card className={compact ? 'h-full' : undefined}>
      <CardHeader className={`flex flex-row items-start justify-between gap-3 ${compact ? 'p-4 pb-3' : 'pb-5'}`}>
        <div><CardTitle as="h2">Hôm nay của bạn</CardTitle>{!compact && <p className="mt-1 text-sm text-muted-foreground">Mỗi chút tập trung đều đáng ghi nhận.</p>}</div>
        <GoalSettingDialog />
      </CardHeader>
      <CardContent className={compact ? 'grid grid-cols-3 gap-0 p-4 pt-0' : 'grid grid-cols-1 gap-0 sm:grid-cols-3'}>
        <GoalMetric compact={compact} label="Thời gian học" icon={Clock3} percent={percentages.study} current={progress.studyMinutes} target={goals.studyMinutes} suffix="phút" tone="text-primary" />
        <GoalMetric compact={compact} label="Câu hoàn thành" icon={ListChecks} percent={percentages.questions} current={progress.questionsCount} target={goals.questionsCount} suffix="câu" tone="text-info" />
        <GoalMetric compact={compact} label="Chính xác" icon={Target} percent={currentAccuracy} current={currentAccuracy} target={100} suffix="%" tone="text-special" />
      </CardContent>
    </Card>
  );
}
