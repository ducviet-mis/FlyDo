'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronUp, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Hide, never unmount, so editor state and unfinished JSON survive folding.
export function AdminCreatePanel({ title, description, actionLabel, openKey, children }: {
  title: string;
  description?: string;
  actionLabel: string;
  openKey?: string | null;
  children: ReactNode;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [foldedKey, setFoldedKey] = useState<string | null | undefined>(undefined);
  const isOpen = expanded || Boolean(openKey && openKey !== foldedKey);
  return <section className="admin-create-panel" aria-labelledby={`${id}-title`}>
    <div className="admin-create-heading">
      <div className="min-w-0">
        <h2 id={`${id}-title`} className="text-base font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>}
      </div>
      <Button type="button" variant={isOpen ? 'outline' : 'default'} data-admin-create-toggle
        aria-expanded={isOpen} aria-controls={`${id}-form`}
        onClick={() => { setExpanded(!isOpen); setFoldedKey(openKey); }} className="min-h-11 shrink-0">
        {isOpen ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
        {isOpen ? 'Thu gọn' : actionLabel}
      </Button>
    </div>
    <div id={`${id}-form`} hidden={!isOpen} className="admin-create-body">{children}</div>
  </section>;
}
