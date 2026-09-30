'use client';

import { useEffect } from 'react';

interface UseQuestionNavProps {
  onNext: () => void;
  onPrev: () => void;
  onSelect: (index: number) => void;
  isAnswered: boolean;
}

export function useQuestionNav({ onNext, onPrev, onSelect, isAnswered }: UseQuestionNavProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      if (target?.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
      if (e.key === 'ArrowRight' && isAnswered) {
        onNext();
      } else if (e.key === 'Enter' && isAnswered) {
        onNext();
      } else if (e.key === 'ArrowLeft') {
        onPrev();
      } else if (['1', '2', '3', '4'].includes(e.key) && !isAnswered) {
        onSelect(parseInt(e.key) - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNext, onPrev, onSelect, isAnswered]);
}
