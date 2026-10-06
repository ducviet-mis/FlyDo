'use client';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Copy, ReceiptText } from 'lucide-react';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '../utils';
import { PaymentStatusBadge,paymentDate } from './payment-status';
import type { PaymentDetail,PaymentOrder } from './types';
import { usePaymentDialogFocus } from './use-payment-dialog-focus';

export function PaymentBankDetails({order}:{order:PaymentOrder}) {
  const [copied,setCopied]=useState('');const [error,setError]=useState('');const [qrFailed,setQrFailed]=useState(false);
  const bank=order.bank_snapshot;
  const copy=async(label:string,value:string)=>{try{await navigator.clipboard.writeText(value);setCopied(label);setError('');}catch{setError('Không thể sao chép tự động. Bạn có thể chọn và sao chép nội dung bên dưới.');}};
  if(!bank)return <p className="text-sm text-muted-foreground">Chưa có thông tin ngân hàng lưu cho đơn này.</p>;
  const qr=bank.qr_image_url;
  const safeQR=qr&&/^https:\/\//i.test(qr);
  return <section aria-label="Thông tin chuyển khoản" className="space-y-3">
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
      <dl className="min-w-0 divide-y divide-border rounded-xl border border-border px-4">
        {[['Ngân hàng',bank.bank_name],['Số tài khoản',bank.account_number],['Chủ tài khoản',bank.account_holder],['Nội dung chuyển khoản',order.transfer_code]].map(([label,value])=><div key={label} className="flex min-w-0 items-center gap-2 py-3">
          <div className="min-w-0 flex-1"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 select-text break-words text-sm font-semibold [overflow-wrap:anywhere]">{value}</dd></div>
          {['Số tài khoản','Nội dung chuyển khoản'].includes(label)&&<Button type="button" size="icon" variant="ghost" className="h-11 w-11 shrink-0" aria-label={`Sao chép ${label.toLowerCase()}`} onClick={()=>void copy(label,value)}><Copy aria-hidden="true" className="h-4 w-4"/></Button>}
        </div>)}
      </dl>
      {safeQR&&!qrFailed?<div className="flex items-center justify-center rounded-xl border bg-white p-3"><img src={qr} onError={()=>setQrFailed(true)} alt="QR tài khoản nhận tiền" width={160} height={160} className="max-w-[160px] object-contain" referrerPolicy="no-referrer"/></div>:<div className="flex items-center justify-center rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">Chuyển khoản bằng thông tin tài khoản bên cạnh.</div>}
    </div>
    {copied&&<p role="status" className="text-xs text-success">Đã sao chép {copied.toLowerCase()}.</p>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    <p className="rounded-xl bg-warning-soft p-3 text-sm leading-relaxed text-warning">QR chỉ là tài khoản nhận tiền. Hãy kiểm tra ngân hàng, nhập đúng <strong>{formatCurrency(order.amount_vnd)}</strong> và toàn bộ nội dung chuyển khoản của đơn.</p>
  </section>;
}
export function PaymentOrderContent({detail}:{detail:PaymentDetail}) {
  const {order,events}=detail;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-primary-soft/40 p-4">
      <div><p className="text-xs text-muted-foreground">Gói đăng ký</p><p className="mt-1 font-semibold">{order.plan_snapshot?.name??'Chưa có thông tin gói lưu'}</p>
        {order.plan_snapshot&&<p className="mt-1 text-sm text-muted-foreground">{order.plan_snapshot.duration_days===null?'Trọn đời':`${order.plan_snapshot.duration_days} ngày`}</p>}</div>
      <div><p className="text-xs text-muted-foreground">{order.status==='approved'&&order.flow_version===1?'Tiền đã đối chiếu':'Số tiền của đơn'}</p><p className="mt-1 text-2xl font-bold tabular-nums text-primary">{formatCurrency(order.amount_vnd)}</p></div>
    </div>
    {order.discount_percent>0&&<dl className="grid grid-cols-2 gap-2 text-sm"><dt className="text-muted-foreground">Giá gốc</dt><dd className="text-right">{order.list_price_vnd===null?'Chưa có thông tin lưu':formatCurrency(order.list_price_vnd)}</dd><dt className="text-muted-foreground">Ưu đãi {order.discount_source==='streak'?'streak':'giới thiệu'} · {order.discount_percent}%</dt><dd className="text-right text-success">−{formatCurrency(order.discount_amount_vnd)}</dd></dl>}
    <section><h3 className="mb-2 text-sm font-semibold">Người mua</h3><p className="break-words text-sm [overflow-wrap:anywhere]">{order.buyer_snapshot?`${order.buyer_snapshot.name} · ${order.buyer_snapshot.phone}`:'Chưa có thông tin lưu'}</p><p className="mt-1 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">{order.buyer_snapshot?.email}</p></section>
    {order.flow_version===0&&<p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">Đơn từ dữ liệu cũ. Không suy ra đã nhận tiền hoặc cấp gói khi chưa có kết quả lưu. Cần đối chiếu thủ công.</p>}
    {order.flow_version===1&&order.status==='draft'&&<PaymentBankDetails key={order.id} order={order}/>}
    {order.status==='pending'&&<p className="rounded-xl bg-warning-soft p-3 text-sm leading-relaxed text-warning">Chờ ADMIN đối chiếu giao dịch ngân hàng. Gói chưa được kích hoạt từ yêu cầu này.</p>}
    {order.status==='approved'&&order.flow_version===1&&order.subscription_id&&<p role="status" className="rounded-xl bg-success-soft p-3 text-sm text-success">Đã kích hoạt. {order.result_expires_at?`Thời hạn ghi nhận: ${paymentDate(order.result_expires_at)}.`:'FlyInfinity trọn đời.'}</p>}
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm"><dt className="text-muted-foreground">Mã đơn</dt><dd className="break-all text-right font-mono">{order.order_code??'Chưa có thông tin lưu'}</dd><dt className="text-muted-foreground">Tạo đơn</dt><dd className="text-right">{paymentDate(order.created_at)}</dd><dt className="text-muted-foreground">Báo chuyển tiền</dt><dd className="text-right">{paymentDate(order.confirmed_at)}</dd><dt className="text-muted-foreground">Kiểm tra</dt><dd className="text-right">{paymentDate(order.reviewed_at)}</dd></dl>
    {order.status!=='draft'&&<section><h3 className="text-sm font-semibold">Nội dung chuyển khoản đã lưu</h3><p className="mt-2 select-text break-words rounded-xl border p-3 text-sm [overflow-wrap:anywhere]">{order.transfer_code}</p></section>}
    {(events.length>0||order.admin_note)&&<section className="border-t pt-4"><h3 className="mb-3 text-sm font-semibold">Tiến trình &amp; phản hồi</h3><ol className="space-y-3">{events.map(event=><li key={event.id} className="border-l-2 border-primary/25 pl-3"><p className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">{event.body}</p><p className="mt-1 text-xs text-muted-foreground">{paymentDate(event.created_at)}</p></li>)}</ol>{!events.some(e=>e.body===order.admin_note)&&order.admin_note&&<p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-muted p-3 text-sm [overflow-wrap:anywhere]">{order.admin_note}</p>}</section>}
  </div>;
}
export function OrderDetailDialog({open,onOpenChange,detail,loading,error,actions}:{open:boolean;onOpenChange:(open:boolean)=>void;detail:PaymentDetail|null;loading:boolean;error:string;actions?:ReactNode}) {
  const focus=usePaymentDialogFocus();
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent {...focus} className="max-w-2xl p-0 motion-reduce:animate-none">
    <DialogHeader className="border-b px-5 py-5 pr-14 sm:px-6 sm:pr-14"><DialogTitle className="flex items-center gap-2"><ReceiptText className="h-5 w-5 text-primary" aria-hidden="true"/>Chi tiết đơn</DialogTitle><DialogDescription>Thông tin mua gói và phản hồi được lưu theo từng đơn.</DialogDescription>{detail&&<div className="pt-2"><PaymentStatusBadge order={detail.order}/></div>}</DialogHeader>
    <div className="space-y-4 px-5 pb-2 sm:px-6">{loading&&<p role="status" className="text-sm text-muted-foreground">Đang tải chi tiết…</p>}{error&&<p role="alert" className="rounded-xl bg-destructive-soft p-3 text-sm text-destructive">{error}</p>}{detail&&<PaymentOrderContent detail={detail}/>}</div>
    <DialogFooter className="gap-3 border-t px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-col sm:space-x-0 sm:px-6">{actions}<Button type="button" variant="outline" onClick={()=>onOpenChange(false)} className="min-h-11">Đóng</Button></DialogFooter>
  </DialogContent></Dialog>;
}
