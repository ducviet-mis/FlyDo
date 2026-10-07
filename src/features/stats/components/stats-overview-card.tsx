'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Target, Clock, ActivitySquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TimeFilterTabs } from './time-filter-tabs';
import { AccuracyPieChart } from './accuracy-pie-chart';
import { useStats } from '../hooks/use-stats';
import { TimeFilter } from '../types';

export function StatsOverviewCard() {
  const [filter, setFilter] = useState<TimeFilter>('week');
  const stats = useStats(filter);
  const metrics = [
    { label: 'Câu đã làm', value: stats.totalQuestions, unit: 'câu', icon: Target },
    { label: 'Thời gian học', value: stats.totalMinutes, unit: 'phút', icon: Clock },
    { label: 'Chính xác', value: stats.accuracy, unit: '%', icon: ActivitySquare },
  ];
  const period = { today: 'Riêng hôm nay', week: '7 ngày gần nhất · Bao gồm hôm nay', month: '30 ngày gần nhất · Bao gồm hôm nay', all: 'Tích lũy toàn bộ · Từ khi bắt đầu học' }[filter];
  return (
    <Card level="supporting" className="min-w-0">
      <CardHeader className="gap-4 pb-5">
        <div><CardTitle as="h2">Kết quả học tập</CardTitle><p className="mt-1 text-sm leading-6 text-muted-foreground">Câu hỏi và độ chính xác từ tự luyện; thời gian online trên toàn FlyDo.</p></div>
        <TimeFilterTabs value={filter} onChange={setFilter} />
      </CardHeader>
      {stats.error && <p role="alert" className="px-6 pb-4 text-sm text-destructive">{stats.error}</p>}
      <CardContent className="space-y-5">
        <p className="text-xs font-medium leading-5 text-muted-foreground">{period}</p>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {metrics.map(({ label, value, unit, icon: Icon }) => (
            <div key={label} className="flex min-w-0 items-center justify-between gap-3 border-b border-border/60 pb-3 sm:block sm:border-b-0 sm:border-r sm:pr-3 sm:last:border-0">
              <dt className="flex items-center gap-1.5 text-sm text-muted-foreground"><Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />{label}</dt>
              <dd className="flex flex-wrap items-baseline gap-1.5 sm:mt-2"><span className="vivux-stat-number text-2xl sm:text-3xl">{value}</span> <span className="text-xs text-muted-foreground">{unit}</span></dd>
            </div>
          ))}
        </dl>
        <div className="grid min-w-0 gap-4 border-t border-border pt-5 sm:grid-cols-[minmax(0,1fr)_200px] sm:items-center">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">Chi tiết đúng / sai</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{stats.totalQuestions > 0 ? 'Kết quả các câu tự luyện đã ghi nhận trong khoảng thời gian đã chọn. Không bao gồm điểm thi thử.' : stats.error ? 'Thống kê chưa tải đầy đủ. Hãy kiểm tra kết nối.' : 'Chưa có kết quả tự luyện trong khoảng này. Bắt đầu một bài học để ghi nhận tiến độ.'}</p>
            {!stats.error && <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild variant="outline" className="min-h-11"><Link href={stats.totalQuestions ? '#continue-learning' : '#practice-heading'}>{stats.totalQuestions ? 'Tiếp tục học' : 'Chọn bài để học'}</Link></Button>
              {stats.wrongCount > 0 && <Button asChild variant="ghost" className="min-h-11"><Link href="/practice/wrong">Ôn câu sai</Link></Button>}
            </div>}
          </div>
          <div className="rounded-lg bg-muted/40 p-2">
            <AccuracyPieChart correct={stats.correctCount} wrong={stats.wrongCount} accuracy={stats.accuracy} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
