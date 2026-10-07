import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TimeFilter } from '../types';

interface TimeFilterTabsProps {
  value: TimeFilter;
  onChange: (value: TimeFilter) => void;
}

export function TimeFilterTabs({ value, onChange }: TimeFilterTabsProps) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as TimeFilter)} className="w-full sm:w-auto">
      <TabsList aria-label="Khoảng thời gian thống kê" className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-4">
        <TabsTrigger value="today" className="min-h-11 whitespace-normal px-2 text-xs leading-5 sm:text-sm">Hôm nay</TabsTrigger>
        <TabsTrigger value="week" className="min-h-11 whitespace-normal px-2 text-xs leading-5 sm:text-sm">7 ngày gần nhất</TabsTrigger>
        <TabsTrigger value="month" className="min-h-11 whitespace-normal px-2 text-xs leading-5 sm:text-sm">30 ngày gần nhất</TabsTrigger>
        <TabsTrigger value="all" className="min-h-11 whitespace-normal px-2 text-xs leading-5 sm:text-sm">Toàn bộ</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
