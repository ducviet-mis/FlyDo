'use client';
import { useEffect,useRef,useState } from 'react';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { getSupabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter } from '@/components/ui/dialog';
import { preparePaymentOrder,paymentErrorMessage } from '../payments/api';
import { PaymentOrderContent } from '../payments/order-detail-dialog';
import { PaymentStatusBadge } from '../payments/payment-status';
import { CustomerPaymentActions } from '../payments/customer-payment-actions';
import type { PaymentDetail } from '../payments/types';
import type { PaidPlan } from '../types';
import { usePaymentDialogFocus } from '../payments/use-payment-dialog-focus';

interface PaymentDialogProps {open:boolean;onOpenChange:(open:boolean)=>void;plan:PaidPlan|null}
export function PaymentDialog({open,onOpenChange,plan}:PaymentDialogProps) {
  const user=useAuthStore(s=>s.user);
  return <Dialog open={open} onOpenChange={onOpenChange}>{open&&plan&&user&&<Checkout key={`${user.id}:${plan.code}`} plan={plan} onClose={()=>onOpenChange(false)}/>}
    {open&&(!user||!plan)&&<DialogContent><DialogHeader><DialogTitle>Thanh toán gói</DialogTitle><DialogDescription>Vui lòng đăng nhập và chọn gói để tiếp tục.</DialogDescription></DialogHeader><Button variant="outline" onClick={()=>onOpenChange(false)}>Đóng</Button></DialogContent>}
  </Dialog>;
}
function Checkout({plan,onClose}:{plan:PaidPlan;onClose:()=>void}) {
  const focus=usePaymentDialogFocus();
  const user=useAuthStore(s=>s.user)!;const refreshUser=useAuthStore(s=>s.refreshUser);
  const [name,setName]=useState(user.name??'');const [phone,setPhone]=useState(user.phone??'');
  const [detail,setDetail]=useState<PaymentDetail|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const requestId=useRef<string|null>(null);const lock=useRef(false);const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const prepare=async()=>{
    if(lock.current)return;
    const uid=user.id;const normalizedName=name.trim().replace(/\s+/g,' ');const normalizedPhone=phone.replace(/[ -]/g,'');
    if(/[\u0000-\u001f\u007f]/.test(name)||normalizedName.length<2||normalizedName.length>80||!/^\+?\d{8,15}$/.test(normalizedPhone)){setError('Cần họ tên 2–80 ký tự và số điện thoại gồm 8–15 chữ số.');return;}
    lock.current=true;setBusy(true);setError('');
    try{
      if(normalizedName!==user.name||normalizedPhone!==user.phone){
        const {error:saveError}=await getSupabaseClient().from('profiles').update({name:normalizedName,phone:normalizedPhone}).eq('id',uid);
        if(saveError)throw Error('profile-save');
        if(!mounted.current||useAuthStore.getState().user?.id!==uid)return;
        await refreshUser();
      }
      if(!mounted.current||useAuthStore.getState().user?.id!==uid)return;
      requestId.current??=crypto.randomUUID();
      const quote=await preparePaymentOrder(plan.code,requestId.current);
      if(mounted.current&&useAuthStore.getState().user?.id===uid)setDetail(quote);
    }catch(error){if(mounted.current&&useAuthStore.getState().user?.id===uid)setError(error instanceof Error&&error.message==='profile-save'?'Chưa lưu được họ tên/SĐT. Chưa có đơn mới; hãy kiểm tra kết nối rồi thử lại.':paymentErrorMessage(error));}
    finally{if(mounted.current){lock.current=false;setBusy(false);}}
  };
  return <DialogContent {...focus} className="max-w-2xl p-0 motion-reduce:animate-none">
    <DialogHeader className="border-b px-5 py-5 pr-14 sm:px-6 sm:pr-14"><DialogTitle className="text-xl">{detail?'Đơn chuyển khoản':`Thanh toán ${plan.name} · ${plan.billingLabel}`}</DialogTitle><DialogDescription>{detail?'Thông tin và số tiền đã được chốt cho đơn này.':'Kiểm tra thông tin liên hệ rồi tạo đơn để nhận số tiền và hướng dẫn chuyển khoản chính thức.'}</DialogDescription>{detail&&<div className="pt-2"><PaymentStatusBadge order={detail.order}/></div>}</DialogHeader>
    <div className="space-y-4 px-5 sm:px-6">
      {error&&<p role="alert" className="rounded-xl bg-destructive-soft p-3 text-sm text-destructive">{error}</p>}
      {!detail?<form id="payment-prepare" onSubmit={e=>{e.preventDefault();void prepare();}} className="space-y-4">
        <div className="rounded-xl border p-4 text-sm"><p className="font-semibold">{plan.name} · {plan.billingLabel}</p><p className="mt-1 text-muted-foreground">Giá và ưu đãi chính thức được máy chủ chốt khi tạo đơn. Nếu đang có đơn chưa kết thúc, bạn sẽ tiếp tục đơn đó.</p></div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="payment-name">Họ và tên trên tài khoản</Label><Input id="payment-name" autoComplete="name" value={name} onChange={e=>setName(e.target.value)} maxLength={80} disabled={busy} className="min-h-11"/></div><div className="space-y-2"><Label htmlFor="payment-phone">Số điện thoại liên hệ</Label><Input id="payment-phone" type="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} maxLength={30} disabled={busy} className="min-h-11"/></div></div>
        <p className="break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">Tài khoản: {user.email}</p><p className="text-xs leading-relaxed text-muted-foreground">Tên và SĐT được lưu vào hồ sơ để tạo nội dung chuyển khoản. SĐT là thông tin liên hệ, chưa xác minh bằng OTP.</p>
      </form>:<>
        {detail.order.plan_code!==plan.code&&<p className="rounded-xl bg-warning-soft p-3 text-sm text-warning">Bạn đang có đơn {detail.order.plan_snapshot?.name??detail.order.plan_code} chưa kết thúc. Hãy xử lý đơn này trước khi đổi gói; số tiền bên dưới thuộc đơn đang có.</p>}
        <PaymentOrderContent detail={detail}/>
      </>}
    </div>
    <DialogFooter className="gap-3 border-t px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-col sm:space-x-0 sm:px-6">
      {detail?<CustomerPaymentActions key={detail.order.id} detail={detail} onChange={setDetail}/>:<Button type="submit" form="payment-prepare" disabled={busy} className="min-h-11 w-full">Tạo đơn chuyển khoản</Button>}
      <Button type="button" variant="outline" onClick={onClose} className="min-h-11">Đóng</Button>
    </DialogFooter>
  </DialogContent>;
}
