'use client';
import { useEffect,useRef,useState } from 'react';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { approvePaymentOrder,replyPaymentOrder,rejectPaymentOrder,paymentErrorMessage } from './api';
import { OrderDetailDialog } from './order-detail-dialog';
import { PaymentFilters,PaymentOrderList,PaymentRefresh } from './payment-order-list';
import { usePaymentOrder,usePaymentOrders } from './use-payment-orders';
import { isPaymentId,type PaymentFilter,type PaymentDetail } from './types';
interface AdminProps{initialOrderId?:string;onOrderIdChange?:(id:string|null)=>void}
export function AdminPayments(props:AdminProps){const uid=useAuthStore(s=>s.user?.id);return uid?<AdminWorkspace key={uid} {...props}/>:null;}
function AdminWorkspace({initialOrderId,onOrderIdChange}:AdminProps){
  const [status,setStatus]=useState<PaymentFilter>('pending');const [search,setSearch]=useState('');const [query,setQuery]=useState('');
  const [selection,setSelection]=useState({source:initialOrderId,value:isPaymentId(initialOrderId)?initialOrderId:null});
  const selected=selection.source===initialOrderId?selection.value:isPaymentId(initialOrderId)?initialOrderId:null;
  useEffect(()=>{const timer=setTimeout(()=>setQuery(search.trim()),300);return()=>clearTimeout(timer);},[search]);
  const list=usePaymentOrders({admin:true,status,search:query});const current=usePaymentOrder(selected,true);
  const select=(id:string|null)=>{setSelection({source:initialOrderId,value:id});onOrderIdChange?.(id);};
  return <section data-payment-focus-fallback tabIndex={-1} className="space-y-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Quản lý thanh toán">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"><div><p className="text-sm text-muted-foreground">Đơn chờ kiểm tra</p><p className="mt-1 text-2xl font-bold tabular-nums">{list.summary.pending_count}</p></div><PaymentRefresh onClick={()=>void list.refresh()} disabled={list.loading}/><p className="w-full text-sm leading-relaxed text-muted-foreground">Khách xác nhận chỉ là yêu cầu kiểm tra. Đối chiếu giao dịch thực nhận trên ngân hàng trước khi bấm kích hoạt.</p></div>
    <div className="space-y-2"><Label htmlFor="payment-search">Tìm mã đơn, tên, email hoặc SĐT</Label><Input id="payment-search" type="search" autoComplete="off" placeholder="VD: FD123…, họ tên hoặc SĐT" maxLength={100} value={search} onChange={e=>setSearch(e.target.value)} className="min-h-11"/></div>
    <PaymentFilters admin value={status} onChange={setStatus}/>
    <PaymentOrderList {...list} admin next={!!list.next_cursor} refresh={()=>void list.refresh()} loadMore={()=>void list.loadMore()} onSelect={id=>select(id)}/>
    <OrderDetailDialog open={!!selected} onOpenChange={open=>{if(!open)select(null);}} detail={current.detail} loading={current.loading} error={current.error} actions={<>
      {current.error&&<Button type="button" variant="outline" className="min-h-11" onClick={()=>void current.refresh()}>Thử tải chi tiết lại</Button>}
      {current.detail&&<AdminActions key={current.detail.order.id} detail={current.detail} refresh={()=>{void current.refresh();void list.refresh();}} onChange={detail=>{current.replace(detail);void list.refresh();}}/>}
    </>}/>
  </section>;
}
function AdminActions({detail,onChange,refresh}:{detail:PaymentDetail;onChange:(detail:PaymentDetail)=>void;refresh:()=>void}){
  const uid=useAuthStore(s=>s.user?.id);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [error,setError]=useState('');const lock=useRef(false);const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const act=async(action:'approve'|'reply'|'reject')=>{
    if(lock.current||!uid)return;if(action!=='approve'&&!message.trim())return;
    lock.current=true;setBusy(true);setError('');
    try{const updated=await (action==='approve'?approvePaymentOrder(detail.order.id):action==='reply'?replyPaymentOrder(detail.order.id,message):rejectPaymentOrder(detail.order.id,message));if(mounted.current&&useAuthStore.getState().user?.id===uid){onChange(updated);setMessage('');}}
    catch(error){if(mounted.current&&useAuthStore.getState().user?.id===uid){setError(paymentErrorMessage(error));refresh();}}
    finally{if(mounted.current){lock.current=false;setBusy(false);}}
  };
  if(detail.order.flow_version!==1||detail.order.status!=='pending')return null;
  return <div className="w-full space-y-4">
    {error&&<p role="alert" className="rounded-xl bg-destructive-soft p-3 text-sm text-destructive">{error}</p>}
    <div className="rounded-xl border border-success/25 bg-success-soft p-4"><p className="mb-3 text-sm leading-relaxed text-success">Chỉ bấm khi đã kiểm tra đúng số tiền, nội dung và tài khoản nhận trên ngân hàng. Một lần bấm sẽ cấp/gia hạn gói ngay.</p><Button type="button" className="min-h-11 w-full whitespace-normal" disabled={busy} onClick={()=>void act('approve')}>Đã nhận tiền · Kích hoạt</Button></div>
    <div className="space-y-2"><Label htmlFor="payment-admin-message">Phản hồi / lý do — khách hàng sẽ đọc được</Label><textarea id="payment-admin-message" value={message} onChange={e=>setMessage(e.target.value)} maxLength={1000} disabled={busy} rows={3} className="w-full resize-y rounded-xl border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"/><div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" className="min-h-11" disabled={busy||!message.trim()} onClick={()=>void act('reply')}>Gửi phản hồi</Button><Button type="button" variant="outline" className="min-h-11 text-destructive" disabled={busy||!message.trim()} onClick={()=>void act('reject')}>Không duyệt</Button><span className="ml-auto text-xs text-muted-foreground">{message.length}/1.000</span></div></div>
  </div>;
}
