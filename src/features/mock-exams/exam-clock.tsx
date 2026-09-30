'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

// Keep the one-second updates inside the clock, not the question / geometry tree.
export const ExamClock = memo(function ExamClock({ deadlineAt, onExpire, getRemaining }: {
  deadlineAt: number;
  onExpire: () => void;
  getRemaining?: () => number;
}) {
  const [remaining, setRemaining] = useState(() => getRemaining ? getRemaining() : Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000)));
  const expireRef = useRef(onExpire);
  useEffect(() => { expireRef.current = onExpire; }, [onExpire]);
  useEffect(() => {
    let expired = false;
    const update = () => {
      const seconds = getRemaining ? getRemaining() : Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000));
      setRemaining(seconds);
      if (seconds === 0 && !expired) { expired = true; expireRef.current(); }
    };
    update();
    const timer = window.setInterval(update, 1000);
    document.addEventListener('visibilitychange', update);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, [deadlineAt, getRemaining]);
  const time = `${Math.floor(remaining / 60).toString().padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}`;
  return <div className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold font-mono text-sm sm:text-lg transition-colors',
    remaining < 300 ? 'bg-destructive-soft text-destructive motion-safe:animate-pulse' : 'bg-muted text-foreground')} aria-label={`Thời gian còn lại: ${time}`}>
    <Clock aria-hidden="true" className="w-4 h-4 shrink-0" />
    <span className="min-w-[5ch] tabular-nums">{time}</span>
  </div>;
});
