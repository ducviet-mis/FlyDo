'use client';
import Link from 'next/link';
import { useEffect,useRef,useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { cancelPaymentOrder,confirmPaymentOrder,paymentErrorMessage } from './api';
import type { PaymentDetail } from './types';
export function CustomerPaymentActions({detail,onChange,showHistory = true}:{detail:PaymentDetail;onChange:(detail:PaymentDetail)=>void;showHistory?:boolean}) {
  const uid=useAuthStore(s=>s.user?.id);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [ack,setAck]=useState(false);const lock=useRef(false);const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const act=async(cancel=false)=>{
    if(!uid||lock.current||(cancel&&!ack))return;lock.current=true;setBusy(true);setError('');
    try{const updated=await (cancel?cancelPaymentOrder:confirmPaymentOrder)(detail.order.id);if(mounted.current&&useAuthStore.getState().user?.id===uid)onChange(updated);}
    catch(error){if(mounted.current&&useAuthStore.getState().user?.id===uid)setError(paymentErrorMessage(error));}
    finally{if(mounted.current){lock.current=false;setBusy(false);}}
  };
  if(detail.order.flow_version===0)return null;
  return <div className="w-full space-y-3">
    {error&&<p role="alert" className="rounded-xl bg-destructive-soft p-3 text-sm text-destructive">{error}</p>}
    {detail.order.status==='draft'&&<>
      <Button type="button" disabled={busy} onClick={()=>void act()} className="min-h-11 w-full whitespace-normal">Tôi đã chuyển tiền</Button>
      <p className="text-xs leading-relaxed text-muted-foreground">Chỉ xác nhận sau khi chuyển tiền. Thao tác này gửi yêu cầu kiểm tra, chưa kích hoạt gói.</p>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3"><label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)} disabled={busy} className="h-4 w-4 accent-primary"/>Tôi chưa chuyển tiền</label><Button type="button" variant="outline" className="min-h-11" disabled={busy||!ack} onClick={()=>void act(true)}>Hủy đơn nháp</Button></div>
      <p className="text-xs text-muted-foreground">Hủy chỉ dành cho đơn chưa chuyển tiền; không phải yêu cầu hoàn tiền. Đóng cửa sổ vẫn giữ đơn.</p>
    </>}
    {showHistory&&detail.order.status!=='draft'&&<Button asChild variant="outline" className="min-h-11 w-full"><Link href={`/profile?tab=payments&order=${detail.order.id}`}>Xem lịch sử thanh toán</Link></Button>}
  </div>;
}
