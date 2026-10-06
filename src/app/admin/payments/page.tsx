'use client';
import { Suspense } from 'react';
import { useRouter,useSearchParams } from 'next/navigation';
import { AdminPayments } from '@/features/subscription/payments/admin-payments';
import { isPaymentId } from '@/features/subscription/payments/types';
function PaymentsPageContent(){
  const query=useSearchParams();const router=useRouter();const order=query.get('order');
  return <AdminPayments initialOrderId={isPaymentId(order)?order:undefined} onOrderIdChange={id=>router.replace(`/admin/payments${id?`?order=${id}`:''}`,{scroll:false})}/>;
}
export default function PaymentsPage(){return <Suspense fallback={<p className="text-muted-foreground">Đang tải thanh toán…</p>}><PaymentsPageContent/></Suspense>;}
