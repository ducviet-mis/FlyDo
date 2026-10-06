'use client';
import { ArrowUpRight,RefreshCw,ReceiptText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '../utils';
import { PaymentStatusBadge,paymentDate } from './payment-status';
import type { PaymentFilter,PaymentOrder } from './types';
export const historyFilters: {value:PaymentFilter;label:string}[]=[{value:'all',label:'Tất cả'},{value:'open',label:'Chờ xử lý'},{value:'approved',label:'Đã kích hoạt'},{value:'closed',label:'Không duyệt / Đã hủy'}];
export function PaymentFilters({value,onChange,admin=false}:{value:PaymentFilter;onChange:(value:PaymentFilter)=>void;admin?:boolean}) {
  const filters=admin?[{value:'pending' as const,label:'Chờ kiểm tra'},...historyFilters.filter(f=>f.value!=='open'),{value:'draft' as const,label:'Nháp'}]:historyFilters;
  return <div aria-label="Lọc đơn thanh toán" className="flex flex-wrap gap-2">{filters.map(f=><Button key={f.value} type="button" variant={value===f.value?'default':'outline'} aria-pressed={value===f.value} onClick={()=>onChange(f.value)} className="min-h-11 whitespace-normal px-3 text-xs sm:text-sm">{f.label}</Button>)}</div>;
}
export function PaymentOrderList({items,loading,loadingMore,error,next,refresh,loadMore,onSelect,admin=false}:{items:PaymentOrder[];loading:boolean;loadingMore:boolean;error:string;next:boolean;refresh:()=>void;loadMore:()=>void;onSelect:(id:string)=>void;admin?:boolean}) {
  return <div className="space-y-3">
    {error&&<div role="alert" className="rounded-xl border border-destructive/25 bg-destructive-soft p-4 text-sm text-destructive"><p>{error}</p><Button type="button" variant="outline" className="mt-3 min-h-11" onClick={refresh}>Thử lại</Button></div>}
    {loading&&<p role="status" className="py-4 text-sm text-muted-foreground">Đang tải danh sách đơn…</p>}
    {!loading&&!error&&items.length===0&&<div className="rounded-xl border border-dashed px-5 py-10 text-center"><ReceiptText aria-hidden="true" className="mx-auto mb-3 h-7 w-7 text-muted-foreground"/><p className="font-semibold">Chưa có đơn trong mục này</p><p className="mt-2 text-sm text-muted-foreground">Các đơn mua gói bằng chuyển khoản sẽ xuất hiện ở đây.</p></div>}
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">{items.map(order=><li key={order.id} className="flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{order.plan_snapshot?.name??'Gói từ dữ liệu cũ'}</p><PaymentStatusBadge order={order}/></div>
        {admin&&<><p className="mt-2 break-words text-sm [overflow-wrap:anywhere]">{order.buyer_snapshot?.name??'Chưa có thông tin người mua lưu'}{order.buyer_snapshot?.phone&&` · ${order.buyer_snapshot.phone}`}</p><p className="mt-1 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">{order.buyer_snapshot?.email}</p></>}
        <p className="mt-2 text-xs text-muted-foreground"><span className="font-mono">{order.order_code??'Mã đơn cũ'}</span> · {paymentDate(admin?order.confirmed_at??order.created_at:order.created_at)}</p>
      </div><div className="flex shrink-0 items-center justify-between gap-4 sm:flex-col sm:items-end sm:gap-2"><p className="font-semibold tabular-nums">{formatCurrency(order.amount_vnd)}</p><Button type="button" variant="outline" className="min-h-11" onClick={()=>onSelect(order.id)}>{order.status==='draft'&&!admin?'Tiếp tục thanh toán':'Chi tiết'}<ArrowUpRight aria-hidden="true" className="h-4 w-4"/></Button></div>
    </li>)}</ul>
    {next&&<Button type="button" variant="outline" onClick={loadMore} disabled={loadingMore||loading} className="min-h-11 w-full">{loadingMore?'Đang tải thêm…':'Xem thêm đơn'}</Button>}
  </div>;
}
export function PaymentRefresh({onClick,disabled}:{onClick:()=>void;disabled:boolean}){return <Button type="button" variant="outline" className="min-h-11" onClick={onClick} disabled={disabled}><RefreshCw aria-hidden="true" className="h-4 w-4"/>Làm mới</Button>;}
