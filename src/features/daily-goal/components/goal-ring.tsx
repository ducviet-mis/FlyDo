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
    <div className={`min-w-0 border-r border-border/60 first:pl-0 last:border-0 last:pr-0 ${compact ? 'px-3' : 'px-4'}`}>
      <dt className="flex items-center gap-1.5 text-xs font-medium leading-5 text-muted-foreground sm:text-sm">{!compact && <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />}{label}</dt>
      <dd className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <span className={`vivux-stat-number ${compact ? 'text-2xl' : 'text-3xl'}`}>{current}</span>
        <span className="text-xs text-muted-foreground">{suffix === '%' ? '%' : `/ ${target} ${suffix}`}</span>
      </dd>
      <div className={`mt-3 flex items-center gap-1.5 ${tone}`} role="img" aria-label={`${label}: ${current}/${target} ${suffix}, ${percent}%`}>
        <svg viewBox="0 0 76 76" className="h-6 w-6 shrink-0 -rotate-90" aria-hidden="true">
          <circle cx="38" cy="38" r={radius} fill="none" stroke="currentColor" strokeWidth="5" className="text-track" />
          <circle cx="38" cy="38" r={radius} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} className="transition-[stroke-dashoffset] duration-220 motion-reduce:transition-none" />
        </svg>
        <span aria-hidden="true" className="text-xs leading-4 text-muted-foreground">{suffix === '%' ? 'Tỷ lệ đúng' : `${percent}% mục tiêu`}</span>
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
        <div><CardTitle as="h2">Hôm nay của bạn</CardTitle><p className="mt-1 text-xs leading-5 text-muted-foreground">Câu hỏi từ tự luyện · Thời gian online trên FlyDo</p></div>
        <GoalSettingDialog />
      </CardHeader>
      <CardContent className={compact ? 'p-4 pt-0' : undefined}>
        <dl className="grid grid-cols-3 gap-0">
          <GoalMetric compact={compact} label="Câu hoàn thành" icon={ListChecks} percent={percentages.questions} current={progress.questionsCount} target={goals.questionsCount} suffix="câu" tone="text-info" />
          <GoalMetric compact={compact} label="Thời gian học" icon={Clock3} percent={percentages.study} current={progress.studyMinutes} target={goals.studyMinutes} suffix="phút" tone="text-primary" />
          <GoalMetric compact={compact} label="Chính xác" icon={Target} percent={currentAccuracy} current={currentAccuracy} target={100} suffix="%" tone="text-special" />
        </dl>
      </CardContent>
    </Card>
  );
}
