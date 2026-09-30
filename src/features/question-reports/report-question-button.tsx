'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Flag, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { getSupabaseClient } from '@/lib/supabase/client';
import { REPORT_REASONS, reportError, validateReport, type ReportSource } from './report-model';

export function ReportQuestionButton({ source, questionId }: { source: ReportSource; questionId: string }) {
  const user = useAuthStore((state) => state.user);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const lock = useRef(false);
  const formId = useId();

  useEffect(() => {
    setReason(''); setDetails(''); setError(''); setSent(false); setOpen(false);
  }, [user?.id, questionId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current || !user) return;
    const validation = validateReport(reason, details);
    if (validation) { setError(validation); return; }
    lock.current = true; setBusy(true); setError('');
    const reporterId = user.id;
    try {
      const { error: requestError } = await getSupabaseClient().rpc('submit_question_report', {
        p_source: source, p_question_id: questionId, p_reason: reason, p_details: details.trim(),
      });
      if (useAuthStore.getState().user?.id !== reporterId) return;
      if (requestError) setError(reportError(requestError));
      else { setSent(true); setDetails(''); }
    } catch { setError('Mất kết nối. Vui lòng thử lại.'); }
    finally { lock.current = false; setBusy(false); }
  }

  return <Dialog open={open} onOpenChange={(value) => { if (!lock.current) setOpen(value); }}>
    <DialogTrigger asChild><Button type="button" variant="ghost" className="min-h-11 shrink-0 gap-2 text-muted-foreground" aria-label="Báo lỗi câu hỏi">
      <Flag className="h-4 w-4" aria-hidden="true" /> Báo lỗi
    </Button></DialogTrigger>
    <DialogContent className="motion-reduce:animate-none" onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onPointerDownOutside={(event) => { if (busy) event.preventDefault(); }}>
      <DialogHeader><DialogTitle>Báo lỗi câu hỏi</DialogTitle><DialogDescription>
        Góp ý của bạn giúp FlyDo cải thiện bộ câu hỏi. Phản hồi sẽ được gửi vào Thông báo.
      </DialogDescription></DialogHeader>
      {!user ? <div className="space-y-4"><p>Vui lòng đăng nhập để gửi báo lỗi.</p><Button asChild><Link href="/login">Đăng nhập</Link></Button></div>
        : sent ? <div className="space-y-4" role="status"><CheckCircle2 className="h-10 w-10 text-success" aria-hidden="true" />
          <p className="font-semibold">Đã tiếp nhận báo lỗi của bạn</p><p className="text-sm text-muted-foreground">Nếu đã báo câu này trước đó và chưa được xử lý, hệ thống giữ báo lỗi đang có, không tạo trùng.</p>
          <Button type="button" className="min-h-11" onClick={() => setOpen(false)}>Tiếp tục học</Button></div>
        : <form onSubmit={submit} className="space-y-4">
          <fieldset disabled={busy} className="space-y-2"><legend className="mb-2 text-sm font-semibold">Bạn gặp vấn đề gì? (bắt buộc)</legend>
            {Object.entries(REPORT_REASONS).map(([value, label]) => <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm ${reason === value ? 'border-primary bg-primary-soft' : 'border-border hover:bg-muted'}`}>
              <input type="radio" name={`${formId}-reason`} value={value} checked={reason === value} onChange={() => { setReason(value); setError(''); }} className="h-4 w-4 accent-primary" />{label}
            </label>)}
          </fieldset>
          <div><label htmlFor={`${formId}-details`} className="mb-2 block text-sm font-semibold">Mô tả thêm {reason === 'other' ? '(bắt buộc)' : '(không bắt buộc)'}</label>
            <textarea id={`${formId}-details`} disabled={busy} value={details} maxLength={2000} onChange={(event) => setDetails(event.target.value)} rows={3} className="w-full rounded-xl border border-border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Ví dụ: Em tính được đáp án C, nhưng hệ thống chọn B…" aria-describedby={`${formId}-hint ${formId}-error`} />
            <p id={`${formId}-hint`} className="text-xs text-muted-foreground">{details.length}/2.000 ký tự. Nội dung câu hỏi được gửi kèm tự động.</p>
          </div>
          <p id={`${formId}-error`} role="alert" className="text-sm text-destructive">{error}</p>
          {source === 'mock_exam' && <p className="text-xs text-muted-foreground">Đồng hồ thi vẫn chạy trong lúc báo lỗi. Đáp án của bạn không bị thay đổi.</p>}
          <DialogFooter className="gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Hủy</Button><Button type="submit" disabled={busy} className="min-h-11">{busy && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}{busy ? 'Đang gửi…' : 'Gửi báo lỗi'}</Button></DialogFooter>
        </form>}
    </DialogContent>
  </Dialog>;
}
