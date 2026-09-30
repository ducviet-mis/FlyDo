'use client';

import { useState } from 'react';
import { Target, Clock, ActivitySquare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TimeFilterTabs } from './time-filter-tabs';
import { AccuracyPieChart } from './accuracy-pie-chart';
import { useStats } from '../hooks/use-stats';
import { TimeFilter } from '../types';

export function StatsOverviewCard() {
  const [filter, setFilter] = useState<TimeFilter>('week');
  const stats = useStats(filter);
  const metrics = [
    { label: 'Tổng câu hỏi', value: stats.totalQuestions, unit: 'câu', icon: Target, tone: 'text-primary bg-primary-soft' },
    { label: 'Thời gian học', value: stats.totalMinutes, unit: 'phút', icon: Clock, tone: 'text-special bg-special-soft' },
    { label: 'Câu làm đúng', value: stats.correctCount, unit: 'câu', icon: ActivitySquare, tone: 'text-success bg-success-soft' },
  ];
  return (
    <Card level="supporting">
      <CardHeader className="gap-4 pb-5">
        <CardTitle as="h2">Tổng quan học tập</CardTitle>
        <TimeFilterTabs value={filter} onChange={setFilter} />
      </CardHeader>
      {stats.error && <p role="alert" className="px-6 pb-4 text-sm text-destructive">{stats.error}</p>}
      <CardContent className="grid grid-cols-1 items-center gap-6 sm:grid-cols-[1fr_200px]">
        <div className="divide-y divide-border">
          {metrics.map(({ label, value, unit, icon: Icon, tone }) => (
            <div key={label} className="flex items-center gap-3 py-4 first:pt-0 last:pb-0">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${tone}`}><Icon aria-hidden="true" className="h-[18px] w-[18px]" /></div>
              <div className="min-w-0 flex-1"><p className="text-sm text-muted-foreground">{label}</p></div>
              <p className="whitespace-nowrap"><span className="vivux-stat-number text-2xl">{value}</span> <span className="text-xs text-muted-foreground">{unit}</span></p>
            </div>
          ))}
        </div>
        <div className="rounded-lg bg-muted/40 p-2">
          <AccuracyPieChart correct={stats.correctCount} wrong={stats.wrongCount} accuracy={stats.accuracy} />
        </div>
      </CardContent>
    </Card>
  );
}
