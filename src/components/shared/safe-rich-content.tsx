'use client';
import { useEffect, useState } from 'react';
import { sanitizeRichHtml } from '@/lib/security/safe-content';

export function SafeRichContent({ html, className }: { html: string; className?: string }) {
  const [clean, setClean] = useState('');
  useEffect(() => { setClean(sanitizeRichHtml(html)); }, [html]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: clean }} />;
}
