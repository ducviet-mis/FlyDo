'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Flag, Loader2, RefreshCw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getSupabaseClient } from '@/lib/supabase/client';
import { MathRenderer, formatOptionMath } from '@/features/practice/components/math-renderer';
import { GeometryDiagram } from '@/features/geometry/components/geometry-diagram';
import { REPORT_REASONS, REPORT_STATUSES, reportError, type QuestionReport, type ReportResponse, type ReportStatus } from '@/features/question-reports/report-model';

const PAGE_SIZE = 20;
const fieldClass = 'min-h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const formatDate = (value: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const sourceLabel = (source: string) => source === 'practice' ? 'Tự luyện' : 'Thi thử';

function StatusBadge({ status }: { status: ReportStatus }) {
  const color = status === 'resolved' ? 'bg-success-soft text-success' : status === 'rejected' ? 'bg-muted text-muted-foreground' : 'bg-primary-soft text-primary';
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${color}`}>{REPORT_STATUSES[status]}</span>;
}

export default function QuestionReportsPage() {
  const [reports, setReports] = useState<QuestionReport[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [reasonFilter, setReasonFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<QuestionReport | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError('');
      try {
        let query = getSupabaseClient().from('question_reports').select('*', { count: 'exact' });
        if (statusFilter !== 'all') query = query.eq('status', statusFilter);
        if (sourceFilter !== 'all') query = query.eq('source', sourceFilter);
        if (reasonFilter !== 'all') query = query.eq('reason', reasonFilter);
        const result = await query.order('created_at', { ascending: false }).order('id').range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (cancelled) return;
        if (result.error) { setError(reportError(result.error)); setReports([]); setTotal(0); }
        else { setReports((result.data ?? []) as QuestionReport[]); setTotal(result.count ?? 0); }
      } catch { if (!cancelled) setError('Mất kết nối. Hãy thử làm mới danh sách.'); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [page, statusFilter, sourceFilter, reasonFilter, revision]);

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div>
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Flag className="h-5 w-5 text-primary" aria-hidden="true" /> Tiếp nhận & phản hồi</h2>
      <p className="mt-2 text-sm text-muted-foreground">Tiếp nhận góp ý từ Tự luyện và Thi thử. Phản hồi được gửi riêng đến người báo lỗi.</p>
    </div><Button variant="outline" disabled={loading} onClick={() => setRevision((value) => value + 1)}><RefreshCw className="h-4 w-4" aria-hidden="true" /> Làm mới</Button></div>
    <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-3">
      <label className="space-y-2 text-sm font-medium"><span className="block">Tình trạng</span><select className={`${fieldClass} w-full`} value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(0); }}><option value="all">Tất cả tình trạng</option>{Object.entries(REPORT_STATUSES).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
      <label className="space-y-2 text-sm font-medium"><span className="block">Nguồn</span><select className={`${fieldClass} w-full`} value={sourceFilter} onChange={(event) => { setSourceFilter(event.target.value); setPage(0); }}><option value="all">Tất cả nguồn</option><option value="practice">Tự luyện</option><option value="mock_exam">Thi thử</option></select></label>
      <label className="space-y-2 text-sm font-medium"><span className="block">Lý do</span><select className={`${fieldClass} w-full`} value={reasonFilter} onChange={(event) => { setReasonFilter(event.target.value); setPage(0); }}><option value="all">Tất cả lý do</option>{Object.entries(REPORT_REASONS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
    </div>
    {error && <p role="alert" className="rounded-xl bg-destructive-soft p-4 text-sm text-destructive">{error}</p>}
    {loading ? <p role="status" className="py-10 text-center text-muted-foreground">Đang tải báo lỗi…</p> : <>
      <p className="text-sm text-muted-foreground">{total} báo lỗi phù hợp</p>
      {!reports.length && !error && <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">Chưa có báo lỗi trong bộ lọc này.</div>}
      <div className="admin-record-list">{reports.map((report) => <button data-admin-report key={report.id} type="button" onClick={() => setSelected(report)} className="admin-record block w-full text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{sourceLabel(report.source)}{report.grade ? ` · Lớp ${report.grade}` : ''} · {formatDate(report.created_at)}</span><StatusBadge status={report.status} /></div>
        <h3 className="break-words font-semibold">{report.source_title}</h3><p className="mt-1 text-sm font-medium text-primary">{REPORT_REASONS[report.reason]}</p>
        <p className="mt-2 line-clamp-2 break-words text-sm text-muted-foreground">{report.details || 'Không có mô tả thêm'}</p>
        <p className="mt-3 break-words text-xs text-muted-foreground">{report.reporter_name} · {report.reporter_email} · #{report.id.slice(0, 8)}</p>
        <span className="mt-3 inline-block text-sm font-semibold">Xem câu hỏi & phản hồi →</span>
      </button>)}</div>
      {total > PAGE_SIZE && <div className="flex items-center justify-center gap-3"><Button variant="outline" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Trước</Button><span className="text-sm">Trang {page + 1}/{Math.ceil(total / PAGE_SIZE)}</span><Button variant="outline" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((value) => value + 1)}>Sau</Button></div>}
    </>}
    {selected && <ReportDetail key={selected.id} initialReport={selected} onClose={() => setSelected(null)} onUpdated={() => setRevision((value) => value + 1)} />}
  </div>;
}

function ReportDetail({ initialReport, onClose, onUpdated }: { initialReport: QuestionReport; onClose: () => void; onUpdated: () => void }) {
  const [report, setReport] = useState(initialReport);
  const [history, setHistory] = useState<ReportResponse[]>([]);
  const [status, setStatus] = useState<ReportStatus>(initialReport.status);
  const [response, setResponse] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(true);
  const lock = useRef(false);
  const request = useRef<{ id: string; status: ReportStatus; response: string } | null>(null);
  const question = report.question_snapshot;

  const refreshDetail = useCallback(async () => {
    const client = getSupabaseClient();
    const [reportResult, historyResult] = await Promise.all([
      client.from('question_reports').select('*').eq('id', initialReport.id).single(),
      client.from('question_report_responses').select('id, report_id, body, status, created_at').eq('report_id', initialReport.id).order('created_at'),
    ]);
    if (reportResult.error) throw reportResult.error;
    if (historyResult.error) throw historyResult.error;
    return { report: reportResult.data as QuestionReport, history: (historyResult.data ?? []) as ReportResponse[] };
  }, [initialReport.id]);

  useEffect(() => {
    let cancelled = false;
    refreshDetail().then((data) => { if (!cancelled) { setReport(data.report); setStatus(data.report.status); setHistory(data.history); } }).catch(() => { if (!cancelled) setHistoryError('Chưa thể tải tình trạng mới nhất. Đóng và mở lại để thử lại.'); }).finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [refreshDetail]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    if (['resolved', 'rejected'].includes(status) && !response.trim()) { setError('Hãy viết phản hồi trước khi kết thúc báo lỗi.'); return; }
    if (response.trim().length > 1500) { setError('Phản hồi tối đa 1.500 ký tự.'); return; }
    lock.current = true; setBusy(true); setError(''); setMessage('');
    // Reuse the token for retries after a lost response, preventing duplicate notifications.
    if (!request.current || request.current.response !== response.trim() || request.current.status !== status) {
      request.current = { id: crypto.randomUUID(), status, response: response.trim() };
    }
    try {
      const result = await getSupabaseClient().rpc('respond_question_report', {
        p_report_id: report.id, p_status: status, p_response: response.trim(),
        p_request_id: request.current.id, p_expected_updated_at: report.updated_at,
      });
      if (result.error) { setError(reportError(result.error)); return; }
      setMessage(response.trim() ? 'Đã gửi phản hồi vào Thông báo của người báo lỗi.' : 'Đã cập nhật tình trạng.');
      setResponse(''); request.current = null; onUpdated();
      try { const data = await refreshDetail(); setReport(data.report); setHistory(data.history); setStatus(data.report.status); }
      catch { setHistoryError('Đã lưu thành công. Đóng và mở lại để tải dữ liệu mới nhất.'); }
    } catch { setError('Mất kết nối. Vui lòng thử lại.'); }
    finally { lock.current = false; setBusy(false); }
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !lock.current) onClose(); }}>
    <DialogContent className="max-w-3xl motion-reduce:animate-none" onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onPointerDownOutside={(event) => { if (busy) event.preventDefault(); }}>
      <DialogHeader><DialogTitle>Chi tiết báo lỗi #{report.id.slice(0, 8)}</DialogTitle><DialogDescription>{sourceLabel(report.source)} · {report.source_title}</DialogDescription></DialogHeader>
      <div className="flex flex-wrap items-center gap-2"><StatusBadge status={report.status} /><span className="text-xs text-muted-foreground">{formatDate(report.created_at)}</span></div>
      <div className="space-y-2 rounded-xl bg-muted p-4 text-sm"><p className="break-words font-semibold">{report.reporter_name} · {report.reporter_email}</p><p>{REPORT_REASONS[report.reason]}</p><p className="whitespace-pre-wrap break-words">{report.details || 'Không có mô tả thêm'}</p>{report.chapter && <p className="text-muted-foreground">Chương: {report.chapter}</p>}</div>
      <section className="min-w-0 space-y-4 rounded-xl border border-border p-4">
        <h3 className="font-semibold">Câu hỏi tại thời điểm báo lỗi</h3><p className="break-all text-xs text-muted-foreground">ID: {report.question_id}{question.difficulty_level ? ` · Level ${question.difficulty_level}` : ''}</p>
        <MathRenderer content={question.content} /><GeometryDiagram data={question.diagram} />
        <div className="grid gap-2 sm:grid-cols-2">{question.options.map((option, index) => <div key={index} className={`min-w-0 rounded-lg border p-3 text-sm ${index === question.correct_answer ? 'border-success bg-success-soft' : 'border-border'}`}><p className="mb-1 font-semibold">{String.fromCharCode(65 + index)}{index === question.correct_answer ? ' · Đáp án hệ thống' : ''}</p><MathRenderer content={formatOptionMath(option)} /></div>)}</div>
        <h4 className="text-sm font-semibold">Lời giải hệ thống</h4>{question.solution ? <MathRenderer content={question.solution} variant="solution" /> : <p className="text-sm text-muted-foreground">Chưa có lời giải.</p>}
        <p className="text-xs text-muted-foreground">Bản lưu này giữ nguyên dù câu hỏi gốc được sửa hoặc xóa. Xử lý báo lỗi không tự thay đổi đáp án hay điểm thi.</p>
      </section>
      <section className="space-y-3"><h3 className="font-semibold">Lịch sử phản hồi</h3>{historyLoading && <p role="status" className="text-sm text-muted-foreground">Đang tải…</p>}{historyError && <p role="alert" className="text-sm text-destructive">{historyError}</p>}
        {!historyLoading && !history.length && !historyError && <p className="text-sm text-muted-foreground">Chưa có phản hồi.</p>}{history.map((item) => <div key={item.id} className="rounded-xl bg-primary-soft p-3"><p className="mb-2 text-xs text-muted-foreground">{formatDate(item.created_at)} · {REPORT_STATUSES[item.status]}</p><p className="whitespace-pre-wrap break-words text-sm">{item.body}</p></div>)}
      </section>
      <form onSubmit={save} className="space-y-4 border-t border-border pt-4">
        <label className="block space-y-2 text-sm font-semibold"><span className="block">Cập nhật tình trạng</span><select className={`${fieldClass} w-full`} value={status} disabled={busy || historyLoading || !!historyError} onChange={(event) => { setStatus(event.target.value as ReportStatus); setMessage(''); }}>{Object.entries(REPORT_STATUSES).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
        <label className="block space-y-2 text-sm font-semibold"><span className="block">Phản hồi cho học sinh</span><textarea rows={4} maxLength={1500} value={response} disabled={busy} onChange={(event) => { setResponse(event.target.value); setMessage(''); }} className={`${fieldClass} w-full`} placeholder="Giải thích kết quả kiểm tra và hướng xử lý…" /></label>
        <p className="text-xs text-muted-foreground">{response.length}/1.500 ký tự. Có thể chỉ đổi sang “Đang kiểm tra”; khi kết thúc cần kèm phản hồi.</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm text-success">{message}</p>}
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Đóng</Button><Button type="submit" disabled={busy || historyLoading || !!historyError || (!response.trim() && status === report.status)} className="min-h-11">{busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}{busy ? 'Đang lưu…' : response.trim() ? 'Lưu & gửi phản hồi' : 'Lưu tình trạng'}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
