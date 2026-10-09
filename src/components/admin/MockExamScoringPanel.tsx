'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { LockKeyhole, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { allocateSectionPoints, DEFAULT_SECTION_POINTS, formatPoints, parsePointInput, pointUnits, QUESTION_TYPE_LABELS, SECTION_TYPES, type SectionPoints } from '@/features/mock-exams/scoring';
import { deleteMockExamQuestion, getMockExamScoring, saveMockExamScoring, ScoringRpcError, type ScoringDetails, type ScoringExam } from '@/features/mock-exams/scoring-api';

interface Props {
  examId: string;
  onChanged?: (exam: ScoringExam) => void;
  onClose?: () => void;
}
type FieldError = { message: string; field?: string };
type TextPoints = Record<keyof SectionPoints, string>;
const textPoints = (points: SectionPoints): TextPoints => ({ multiple_choice: formatPoints(points.multiple_choice), true_false: formatPoints(points.true_false), short_answer: formatPoints(points.short_answer) });
const adminEmail = (email?: string | null) => email === 'vietdang293.vn@gmail.com' || email === 'vietdang293@gmail.com';

export function MockExamScoringPanel({ examId, onChanged, onClose }: Props) {
  const { user, initialized, isLoading } = useAuthStore();
  const allowed = initialized && !isLoading && !!user && adminEmail(user.email);
  // Remount the editor on account or exam changes, invalidating pending callbacks.
  if (!allowed) return null;
  return <ScoringEditor key={`${user.id}:${examId}`} examId={examId} accountId={user.id} onChanged={onChanged} onClose={onClose} />;
}

function ScoringEditor({ examId, accountId, onChanged, onClose }: Props & { accountId: string }) {
  const [details, setDetails] = useState<ScoringDetails | null>(null);
  const [sections, setSections] = useState<TextPoints>(textPoints(DEFAULT_SECTION_POINTS));
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [conflict, setConflict] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [status, setStatus] = useState('');
  const focusErrors = useRef(false);
  const alive = useRef(true);
  const inFlight = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const errorSummary = useRef<HTMLDivElement>(null);
  const currentAccount = () => {
    const auth = useAuthStore.getState();
    return alive.current && auth.initialized && !auth.isLoading && auth.user?.id === accountId && adminEmail(auth.user.email);
  };
  const accept = (result: ScoringDetails) => {
    setDetails(result);
    setSections(textPoints(result.exam.scoring_mode === 'legacy_equal' ? DEFAULT_SECTION_POINTS : result.exam.section_points ?? DEFAULT_SECTION_POINTS));
    setOverrides(Object.fromEntries(result.questions.map(q => [q.id, q.points_override == null ? '' : formatPoints(q.points_override)])));
    setDirty(false); setConflict(false);
    setErrors(result.errors.map(message => ({ message })));
  };
  const fail = (error: unknown) => {
    const message = error instanceof Error ? error.message : 'Không thể cập nhật cấu hình. Hãy thử lại.';
    const stale = (error instanceof ScoringRpcError && error.code === '40001') || /revision|stale|conflict|phiên bản/i.test(message);
    setConflict(stale);
    setErrors([{ message: stale ? 'Cấu hình đã được thay đổi ở nơi khác. Hãy tải lại cấu hình để đối chiếu trước khi lưu.' : message }]);
    focusErrors.current = true;
  };
  useEffect(() => {
    let cancelled = false;
    alive.current = true;
    heading.current?.focus();
    getMockExamScoring(examId).then(result => { if (!cancelled && currentAccount()) accept(result); })
      .catch(error => { if (!cancelled && currentAccount()) fail(error); })
      .finally(() => { if (!cancelled && currentAccount()) setLoading(false); });
    return () => { cancelled = true; alive.current = false; };
    // The editor is keyed by these identifiers; callbacks never reuse another editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, accountId]);
  useEffect(() => {
    if (focusErrors.current) { errorSummary.current?.focus(); focusErrors.current = false; }
  }, [errors]);

  const preview = useMemo(() => {
    const fieldErrors: FieldError[] = [];
    const points = {} as SectionPoints;
    for (const type of SECTION_TYPES) {
      const value = parsePointInput(sections[type]);
      if (value == null) fieldErrors.push({ field: `scoring-section-${type}`, message: `${QUESTION_TYPE_LABELS[type]}: nhập số từ 0 đến 10, tối đa 4 chữ số thập phân.` });
      points[type] = value ?? Number.NaN;
    }
    const locked: Record<string, number | null> = {};
    const questions = (details?.questions ?? []).map(q => {
      const text = overrides[q.id] ?? '';
      const value = text.trim() === '' ? null : parsePointInput(text, false);
      if (text.trim() !== '' && value == null) fieldErrors.push({ field: `scoring-override-${q.id}`, message: `Điểm câu ${q.content.slice(0, 40)}: nhập số lớn hơn 0 đến 10, tối đa 4 chữ số thập phân.` });
      locked[q.id] = value;
      return { ...q, points_override: text.trim() !== '' && value == null ? Number.NaN : value };
    });
    const allocation = allocateSectionPoints(points, questions);
    // Incomplete drafts may have empty sections or totals other than 10, but
    // cannot replace a valid allocation with impossible fixed-point arithmetic.
    const allocationErrors: FieldError[] = [];
    for (const type of SECTION_TYPES) {
      const total = pointUnits(points[type]);
      const rows = questions.filter(q => q.question_type === type);
      if (total == null || rows.length === 0 || rows.some(q => q.points_override != null && pointUnits(q.points_override, false) == null)) continue;
      const fixed = rows.reduce((sum, q) => sum + (q.points_override == null ? 0 : pointUnits(q.points_override, false)!), 0);
      const auto = rows.filter(q => q.points_override == null).length;
      if (fixed > total || (auto === 0 && fixed !== total) || (auto > 0 && total - fixed < auto)) {
        allocationErrors.push({ field: `scoring-section-${type}`, message: `${QUESTION_TYPE_LABELS[type]}: tổng điểm cố định và điểm còn tự chia không hợp lệ. Điều chỉnh tổng phần hoặc về tự chia; mỗi câu phải có điểm dương.` });
      }
    }
    return { ...allocation, points, locked, fieldErrors, blockingErrors: [...fieldErrors, ...allocationErrors] };
  }, [details, sections, overrides]);
  const legacy = details?.exam.scoring_mode === 'legacy_equal';
  const disabled = busy || loading || conflict;
  const mutate = async (operation: () => Promise<ScoringDetails>, success: string) => {
    if (inFlight.current || !currentAccount()) return;
    inFlight.current = true; setBusy(true); setStatus('');
    try {
      const result = await operation();
      if (!currentAccount()) return;
      accept(result); setStatus(success); onChanged?.(result.exam);
      if (result.errors.length) focusErrors.current = true;
    } catch (error) { if (currentAccount()) fail(error); }
    finally { inFlight.current = false; if (currentAccount()) setBusy(false); }
  };
  const save = async () => {
    if (!details || disabled || legacy) return;
    const problems = preview.blockingErrors;
    if (problems.length) { setErrors(problems); focusErrors.current = true; return; }
    await mutate(() => saveMockExamScoring(examId, preview.points, preview.locked, details.revision, preview.valid), preview.valid ? 'Đã lưu cấu trúc điểm. Đề đã sẵn sàng sử dụng, không cần duyệt thêm.' : 'Đã lưu cấu trúc điểm chưa hoàn chỉnh. Đề chưa thể sử dụng; nhập đủ câu và sửa các mục được báo lỗi.');
  };
  const reload = async () => {
    if (dirty && !confirm('Tải lại cấu hình sẽ thay các giá trị đang nhập bằng cấu hình mới nhất. Tiếp tục?')) return;
    await mutate(() => getMockExamScoring(examId), 'Đã tải lại cấu hình mới nhất.');
  };
  const convert = async () => {
    if (!details || disabled) return;
    if (preview.blockingErrors.length) { setErrors(preview.blockingErrors); focusErrors.current = true; return; }
    if (!confirm(`Chuyển đề sang phân điểm theo phần với ${SECTION_TYPES.map(type => `${QUESTION_TYPE_LABELS[type]} ${formatPoints(preview.points[type])} điểm`).join(', ')}? Cấu trúc hợp lệ sẽ áp dụng ngay cho các phiên thi mới. Lịch sử và phiên đang thi giữ cách chấm cũ.`)) return;
    await mutate(() => saveMockExamScoring(examId, preview.points, {}, details.revision, preview.valid), preview.valid ? 'Đã chuyển chế độ và áp dụng cấu trúc điểm.' : 'Đã chuyển sang phân điểm theo phần. Cần hoàn thiện các mục báo lỗi trước khi sử dụng.');
  };
  const remove = async (questionId: string, number: number) => {
    if (!details || disabled) return;
    if (dirty) { setErrors([{ message: 'Hãy lưu cấu trúc điểm trước khi xóa câu để phân lại điểm theo cấu hình đã lưu.' }]); focusErrors.current = true; return; }
    if (!confirm(`Xóa câu ${number}? Hệ thống sẽ phân lại điểm cho các câu tự chia, giữ điểm cố định của câu còn lại. Lịch sử và phiên đang thi giữ nguyên.`)) return;
    await mutate(() => deleteMockExamQuestion(examId, questionId, details.revision), `Đã xóa câu ${number} và cập nhật phân điểm.`);
  };
  const edit = () => { setDirty(true); setStatus(''); setErrors([]); };
  const fieldError = (field: string) => errors.find(error => error.field === field)?.message;
  const rows = legacy ? [...(details?.questions ?? [])].sort((a,b) => (a.order_index ?? 0) - (b.order_index ?? 0) || a.id.localeCompare(b.id)) : preview.questions;
  const numberById = new Map(rows.map((q, index) => [q.id, index + 1]));

  return <section aria-labelledby="scoring-panel-title" className="min-w-0 space-y-5 rounded-2xl border border-border bg-card p-4 text-foreground sm:p-6">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><h2 id="scoring-panel-title" ref={heading} tabIndex={-1} className="break-words text-lg font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Điểm & cấu trúc{details ? ` · ${details.exam.title}` : ''}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{legacy ? 'Chế độ cũ' : details?.exam.scoring_ready ? 'Đang sử dụng' : 'Chưa đủ cấu trúc'} · Dùng để chỉnh tổng điểm phần và điểm từng câu. JSON hợp lệ được đưa vào sử dụng ngay khi nhập.</p></div>
      {onClose && <Button type="button" variant="ghost" size="icon" aria-label="Đóng điểm và cấu trúc" disabled={busy} onClick={() => { if (!dirty || confirm('Đóng panel và bỏ các thay đổi điểm chưa lưu?')) onClose(); }}><X className="h-4 w-4" aria-hidden="true" /></Button>}
    </div>
    {errors.length > 0 && <div ref={errorSummary} tabIndex={-1} role="alert" aria-labelledby="scoring-error-title" className="space-y-2 rounded-lg border border-destructive/30 bg-destructive-soft p-4 text-destructive focus:outline-none focus:ring-2 focus:ring-ring">
      <h3 id="scoring-error-title" className="font-semibold">Cần kiểm tra cấu hình</h3><ul className="list-disc space-y-1 pl-5">{errors.map((error,index) => <li key={index}>{error.field ? <a className="underline" href={`#${error.field}`} onClick={event => { event.preventDefault(); document.getElementById(error.field!)?.focus(); }}>{error.message}</a> : error.message}</li>)}</ul>
    </div>}
    {status && <p role="status" className="text-sm text-foreground">{status}</p>}
    {loading ? <p role="status">Đang tải cấu hình điểm...</p> : !details ? <Button type="button" variant="outline" disabled={busy} onClick={() => void reload()}>Tải lại cấu hình</Button> : <>
      {legacy && <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4"><p>Đề giữ cách chấm cũ: 10 × số câu đúng / tổng số câu. Chưa có điểm riêng từng câu.</p><p className="text-sm text-muted-foreground">{details.questions.length} câu. Chỉnh tổng điểm dự kiến bên dưới trước khi xác nhận chuyển chế độ. Chỉ ảnh hưởng phiên thi mới.</p><Button type="button" variant="outline" disabled={disabled} onClick={() => void convert()}>Chuyển sang phân điểm theo phần</Button></div>}
      <>
        <fieldset disabled={disabled} className="min-w-0 space-y-3"><legend className="mb-3 font-semibold">{legacy ? 'Tổng điểm dự kiến sau khi chuyển' : 'Tổng điểm từng phần'}</legend>
          <div className="grid min-w-0 gap-4 sm:grid-cols-3">{SECTION_TYPES.map(type => {
            const field = `scoring-section-${type}`, error = fieldError(field);
            return <div key={type} className="min-w-0 space-y-2"><Label htmlFor={field}>{QUESTION_TYPE_LABELS[type]}</Label><Input id={field} value={sections[type]} disabled={disabled} inputMode="decimal" className="h-11 bg-surface text-base tabular-nums" aria-invalid={!!error} aria-describedby={error ? `${field}-error` : 'scoring-decimal-help'} onChange={event => { edit(); setSections(current => ({ ...current, [type]: event.target.value })); }} />{error && <p id={`${field}-error`} className="text-sm text-destructive">{error}</p>}</div>;
          })}</div>
          <p id="scoring-decimal-help" className="text-sm text-muted-foreground">Nhận dấu phẩy hoặc dấu chấm, tối đa 4 chữ số thập phân. Điểm cố định giữ nguyên khi đổi tổng phần.</p>
        </fieldset>
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4"><p className="font-semibold tabular-nums">{legacy ? 'Tổng dự kiến' : 'Tổng đề'}: {preview.fieldErrors.length ? '—' : formatPoints(preview.total_points)} / 10 điểm</p><p className="text-sm text-muted-foreground">{legacy ? 'Các tổng điểm này chưa áp dụng cho đề cũ. Chuyển chế độ cần xác nhận; lịch sử cùng phiên đang thi giữ cách chấm cũ.' : 'Cấu trúc hợp lệ được áp dụng ngay khi lưu, không cần duyệt. Bạn có thể lưu tổng điểm trước khi nhập câu; đề chỉ dùng được khi tổng đúng 10, đủ câu và mọi câu có điểm dương.'}</p>
          {preview.errors.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{preview.errors.map((message,index) => <li key={index}>{message}</li>)}</ul>}
        </div>
      </>
      <div className="space-y-4">{SECTION_TYPES.map(type => {
        const group = rows.filter(q => q.question_type === type);
        const fixedUnits = group.reduce((sum,q) => sum + (pointUnits(q.points_override) ?? 0),0);
        const auto = group.filter(q => q.points_override == null);
        const totalUnits = pointUnits(preview.points[type]);
        const autoUnits = auto.map(q => q.max_points == null ? null : pointUnits(q.max_points));
        const remainder = !legacy && autoUnits.every(value => value != null) && new Set(autoUnits).size > 1;
        return <section key={type} aria-label={`Phần ${QUESTION_TYPE_LABELS[type]}`} className="min-w-0 space-y-3 rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">{QUESTION_TYPE_LABELS[type]} · {group.length} câu</h3>{!legacy && group.length > 0 && <Button type="button" variant="outline" className="min-h-11" disabled={disabled} aria-label={`Chia đều lại phần ${QUESTION_TYPE_LABELS[type]}`} onClick={() => { if (confirm(`Chia đều lại phần ${QUESTION_TYPE_LABELS[type]}? Các điểm cố định của phần này sẽ về tự chia.`)) { edit(); setOverrides(current => ({ ...current, ...Object.fromEntries(group.map(q => [q.id,''])) })); } }}>Chia đều lại cả phần</Button>}</div>
          {!legacy && <p className="text-sm text-muted-foreground tabular-nums">Cố định: {formatPoints(fixedUnits/10000)} điểm · Còn tự chia: {totalUnits == null ? '—' : formatPoints((totalUnits-fixedUnits)/10000)} điểm cho {auto.length} câu.</p>}
          {remainder && <p className="text-sm text-muted-foreground">Phần dư 0,0001 điểm được chia cho các câu đầu theo thứ tự gốc; tổng điểm phần được giữ chính xác.</p>}
          {group.length === 0 && <p className="text-sm text-muted-foreground">Chưa có câu hỏi trong phần này.</p>}
          {group.map(q => {
            const number = numberById.get(q.id)!, field = `scoring-override-${q.id}`, error = fieldError(field);
            return <article key={q.id} data-scoring-question={q.id} className="min-w-0 space-y-3 border-t border-border pt-3">
              <details className="min-w-0"><summary className="min-h-11 cursor-pointer break-words py-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Câu {number} · {q.content.length > 100 ? `${q.content.slice(0,100)}…` : q.content}</summary><p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{q.content}</p>{q.statements?.length > 0 && <ol className="mt-2 list-[lower-alpha] space-y-2 pl-5 text-sm">{q.statements.map((statement,index) => <li key={index} className="break-words">{statement.content}</li>)}</ol>}</details>
              <div className="flex flex-wrap items-end gap-3">
                {!legacy && <>
                  <div className="min-w-0 w-full space-y-2 sm:w-48 sm:flex-none">
                    <Label htmlFor={field} className="block">Điểm cố định câu {number}</Label>
                    <Input id={field} value={overrides[q.id] ?? ''} disabled={disabled} inputMode="decimal" placeholder="Tự chia" className="h-11 bg-surface text-base tabular-nums" aria-invalid={!!error} aria-describedby={error ? `${field}-error` : 'scoring-override-help'} onChange={event => { edit(); setOverrides(current => ({ ...current,[q.id]:event.target.value })); }} />
                    {error && <p id={`${field}-error`} className="text-sm text-destructive">{error}</p>}
                  </div>
                  <div className="min-w-0 py-2 text-sm">
                    <p>Điểm tối đa: <span data-max-points className="font-semibold tabular-nums">{q.max_points == null ? 'Chưa phân được' : `${formatPoints(q.max_points)} điểm`}</span></p>
                    <p className="mt-1 inline-flex items-center gap-1 text-muted-foreground">{q.points_override == null ? 'Tự chia' : <><LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />Đã chỉnh</>}</p>
                  </div>
                  <Button type="button" variant="outline" disabled={disabled || !overrides[q.id]?.trim()} aria-label={`Về tự chia câu ${number}`} onClick={() => { edit(); setOverrides(current => ({ ...current,[q.id]:'' })); }}>Về tự chia</Button>
                </>}
                <Button type="button" variant="outline" size="icon" className="text-destructive" disabled={disabled} aria-label={`Xóa câu ${number}`} onClick={() => void remove(q.id,number)}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
              </div>
            </article>;
          })}
        </section>;
      })}</div>
      {!legacy && <p id="scoring-override-help" className="text-sm text-muted-foreground">Để trống điểm cố định là tự chia. Nhập điểm để khóa câu đó; các câu còn lại tự chia phần điểm còn dư.</p>}
      <div className="flex flex-wrap gap-3 border-t border-border pt-4">
        <Button type="button" variant="outline" disabled={busy} onClick={() => void reload()}>Tải lại cấu hình</Button>
        {!legacy && <Button type="button" disabled={disabled} onClick={() => void save()}>{busy ? 'Đang lưu...' : 'Lưu cấu trúc điểm'}</Button>}
      </div>
    </>}
  </section>;
}
