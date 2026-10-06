'use client';
import { useEffect,useRef,useState } from 'react';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '../utils';
import { OrderDetailDialog } from './order-detail-dialog';
import { PaymentFilters,PaymentOrderList,PaymentRefresh } from './payment-order-list';
import { CustomerPaymentActions } from './customer-payment-actions';
import { usePaymentOrder,usePaymentOrders } from './use-payment-orders';
import { isPaymentId,type PaymentFilter } from './types';
interface HistoryProps {initialOrderId?:string;onOrderIdChange?:(id:string|null)=>void}
export function PaymentHistory(props:HistoryProps){const uid=useAuthStore(s=>s.user?.id);return uid?<History key={uid} {...props}/>:<p>Vui lòng đăng nhập để xem lịch sử thanh toán.</p>;}
function History({initialOrderId,onOrderIdChange}:HistoryProps){
  const [status,setStatus]=useState<PaymentFilter>('all');
  const [selection,setSelection]=useState({source:initialOrderId,value:isPaymentId(initialOrderId)?initialOrderId:null});
  const selected=selection.source===initialOrderId?selection.value:isPaymentId(initialOrderId)?initialOrderId:null;
  const list=usePaymentOrders({status});const current=usePaymentOrder(selected);
  const refreshUser=useAuthStore(s=>s.refreshUser);const refreshed=useRef(new Set<string>());
  useEffect(()=>{
    const approved=[...list.items,...(current.detail?[current.detail.order]:[])].filter(order=>order.flow_version===1&&order.status==='approved'&&order.subscription_id);
    const unseen=approved.filter(order=>!refreshed.current.has(order.subscription_id!));
    if(unseen.length){unseen.forEach(order=>refreshed.current.add(order.subscription_id!));void refreshUser();}
  },[list.items,current.detail,refreshUser]);
  const select=(id:string|null)=>{setSelection({source:initialOrderId,value:id});onOrderIdChange?.(id);};
  return <section data-payment-focus-fallback tabIndex={-1} className="space-y-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-labelledby="payment-history-title">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="payment-history-title" className="text-xl font-bold">Lịch sử thanh toán</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Theo dõi đơn mua gói, kết quả kiểm tra và phản hồi của FlyDo.</p></div><PaymentRefresh onClick={()=>void list.refresh()} disabled={list.loading}/></header>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Tổng tiền đã được ADMIN đối chiếu</p><p className="text-xl font-bold tabular-nums text-primary">{formatCurrency(list.summary.approved_total_vnd)}</p><p className="w-full text-xs leading-relaxed text-muted-foreground">Chỉ tính đơn mới đã duyệt và có kết quả cấp gói. Đơn chờ kiểm tra, đơn cũ và quà tặng không được tính vào tổng này.</p></div>
    <PaymentFilters value={status} onChange={setStatus}/>
    <PaymentOrderList {...list} next={!!list.next_cursor} refresh={()=>void list.refresh()} loadMore={()=>void list.loadMore()} onSelect={id=>select(id)}/>
    <OrderDetailDialog open={!!selected} onOpenChange={open=>{if(!open)select(null);}} detail={current.detail} loading={current.loading} error={current.error} actions={<>
      {current.error&&<Button type="button" variant="outline" className="min-h-11" onClick={()=>void current.refresh()}>Thử tải chi tiết lại</Button>}
      {current.detail&&<CustomerPaymentActions key={current.detail.order.id} detail={current.detail} showHistory={false} onChange={detail=>{current.replace(detail);void list.refresh();}}/>}
    </>}/>
  </section>;
}
