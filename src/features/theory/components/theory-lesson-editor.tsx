'use client';

import { useId, useState } from 'react';
import { Code2, Eye, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RichTextEditor } from '@/features/handbook/components/rich-text-editor';
import { TheoryContent } from './theory-content';
import { isTheoryJson, parseTheoryDocument, theoryJsonSource } from '../theory-document';
import type { TheoryDocument } from '../types';

export function TheoryLessonEditor({ content, onChange, onMetadata, onDraftChange }: {
  content: string;
  onChange: (content: string) => void;
  onMetadata: (document: TheoryDocument) => void;
  onDraftChange: (pending: boolean) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(() => isTheoryJson(content));
  const [draft, setDraft] = useState(() => isTheoryJson(content) ? theoryJsonSource(content) : '');
  const [errors, setErrors] = useState<string[]>([]);
  const [applied, setApplied] = useState(false);

  function applyJson() {
    const result = parseTheoryDocument(draft);
    setErrors(result.errors);
    if (!result.document) return;
    const normalized = JSON.stringify(result.document, null, 2);
    setDraft(normalized);
    onChange(normalized);
    onMetadata(result.document);
    onDraftChange(false);
    setApplied(true);
  }

  return (
    <div className="space-y-4">
      <Button type="button" variant="outline" onClick={() => setOpen(true)} className="min-h-11">
        <Code2 className="h-4 w-4" aria-hidden="true" />Nhập lý thuyết kèm hình bằng JSON
      </Button>
      {open && <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
        <Label htmlFor={id}>Dán JSON lý thuyết</Label>
        <p id={`${id}-help`} className="text-sm text-muted-foreground">Dán trọn JSON có sections và diagram, chọn “Kiểm tra và áp dụng”, rồi lưu bài bên dưới. Tên bài và mô tả trong JSON sẽ được điền tự động.</p>
        <Textarea id={id} value={draft} onChange={(event) => {
          setDraft(event.target.value);
          setErrors([]);
          setApplied(false);
          onDraftChange(event.target.value !== content);
        }} spellCheck={false} aria-describedby={`${id}-help${errors.length ? ` ${id}-errors` : ''}`} aria-invalid={errors.length > 0}
          className="min-h-80 font-mono text-sm" placeholder={'{"title":"Tên bài","summary":"Mô tả ngắn","sections":[{"heading":"1. Khái niệm","blocks":[{"content":"Nội dung lý thuyết","example":"Ví dụ minh họa","diagram":{"type":"geometry"}}]}]}'} />
        {errors.length > 0 && <div id={`${id}-errors`} role="alert" className="text-sm text-destructive">{errors.map((error, index) => <p key={index}>{error}</p>)}</div>}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={applyJson} className="min-h-11"><Eye className="h-4 w-4" aria-hidden="true" />Kiểm tra và áp dụng</Button>
          <Button type="button" variant="ghost" onClick={() => {
            setDraft(isTheoryJson(content) ? theoryJsonSource(content) : '');
            setErrors([]);
            onDraftChange(false);
            setOpen(false);
          }} className="min-h-11"><X className="h-4 w-4" aria-hidden="true" />{draft && draft !== content ? 'Bỏ bản JSON chưa áp dụng' : 'Đóng ô nhập'}</Button>
        </div>
        {applied && <p role="status" className="text-sm text-success">Đã áp dụng nội dung và hình. Chọn “Lưu thay đổi” hoặc “Thêm bài lý thuyết” để lưu.</p>}
      </div>}
      {isTheoryJson(content) ? <div className="rounded-xl border border-border p-4 sm:p-6"><p className="mb-4 text-sm font-semibold text-muted-foreground">Xem trước nội dung lý thuyết</p><TheoryContent html={content} /></div>
        : <RichTextEditor content={content} onChange={onChange} />}
    </div>
  );
}
