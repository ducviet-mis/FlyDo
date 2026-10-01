'use client';

import React, { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shuffle } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface MixModeDialogProps {
  lessonId: string;
  lessonTitle: string;
  totalQuestions: number;
}

export function MixModeDialog({ lessonId, lessonTitle, totalQuestions }: MixModeDialogProps) {
  const router = useRouter();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(20);
  const [ratio, setRatio] = useState({ l1: 40, l2: 30, l3: 20, l4: 10 });

  const totalRatio = ratio.l1 + ratio.l2 + ratio.l3 + ratio.l4;

  const handleStart = () => {
    if (totalRatio !== 100) {
      alert('Tổng tỉ lệ phải bằng 100%');
      return;
    }
    if (count <= 0) {
      alert('Số lượng câu hỏi phải lớn hơn 0');
      return;
    }

    setOpen(false);
    // Chuyển hướng với các tham số tỉ lệ
    router.push(`/practice/${lessonId}?mode=mix&count=${count}&l1=${ratio.l1}&l2=${ratio.l2}&l3=${ratio.l3}&l4=${ratio.l4}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="h-11 shrink-0 rounded-lg text-sm font-medium"
        >
          <Shuffle className="h-4 w-4" aria-hidden="true" />
          Trộn câu theo tỉ lệ
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="text-xl">Trộn câu bài tập</DialogTitle>
          <DialogDescription>
            {lessonTitle} • Hiện có {totalQuestions} câu trong kho
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div className="grid gap-2">
            <Label htmlFor={`${inputId}-count`} className="font-semibold text-foreground">
              Tổng số câu muốn làm
            </Label>
            <Input
              id={`${inputId}-count`}
              type="number"
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value) || 0)}
              className="h-11 text-base"
            />
          </div>

          <fieldset className="space-y-4">
            <legend className="sr-only">Tỉ lệ câu hỏi theo mức độ</legend>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">Thiết lập tỉ lệ %</span>
              <span aria-live="polite" className={`text-sm font-bold ${totalRatio === 100 ? 'text-success' : 'text-destructive'}`}>
                Tổng: {totalRatio}%
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor={`${inputId}-l1`} className="text-xs leading-5 text-muted-foreground">Level 1 (Nhận biết)</Label>
                <div className="relative">
                  <Input
                    type="number"
                    id={`${inputId}-l1`} value={ratio.l1}
                    onChange={(e) => setRatio(p => ({ ...p, l1: parseInt(e.target.value) || 0 }))}
                    className="h-11 pr-6 text-base"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor={`${inputId}-l2`} className="text-xs leading-5 text-muted-foreground">Level 2 (Thông hiểu)</Label>
                <div className="relative">
                  <Input
                    type="number"
                    id={`${inputId}-l2`} value={ratio.l2}
                    onChange={(e) => setRatio(p => ({ ...p, l2: parseInt(e.target.value) || 0 }))}
                    className="h-11 pr-6 text-base"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor={`${inputId}-l3`} className="text-xs leading-5 text-muted-foreground">Level 3 (Vận dụng)</Label>
                <div className="relative">
                  <Input
                    type="number"
                    id={`${inputId}-l3`} value={ratio.l3}
                    onChange={(e) => setRatio(p => ({ ...p, l3: parseInt(e.target.value) || 0 }))}
                    className="h-11 pr-6 text-base"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor={`${inputId}-l4`} className="text-xs leading-5 text-muted-foreground">Level 4 (Vận dụng cao)</Label>
                <div className="relative">
                  <Input
                    type="number"
                    id={`${inputId}-l4`} value={ratio.l4}
                    onChange={(e) => setRatio(p => ({ ...p, l4: parseInt(e.target.value) || 0 }))}
                    className="h-11 pr-6 text-base"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                </div>
              </div>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">Tổng tỉ lệ cần bằng 100% để bắt đầu luyện tập.</p>
          </fieldset>
        </div>

        <Button
          onClick={handleStart}
          disabled={totalRatio !== 100 || count <= 0}
          className="w-full h-11 bg-primary hover:bg-primary-hover text-primary-foreground rounded-md"
        >
          Bắt đầu làm bài
        </Button>
      </DialogContent>
    </Dialog>
  );
}
