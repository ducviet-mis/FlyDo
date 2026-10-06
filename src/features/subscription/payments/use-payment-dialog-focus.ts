'use client';
import { useRef } from 'react';
// These dialogs are opened from controlled state, not a Radix DialogTrigger.
export function usePaymentDialogFocus() {
  const opener=useRef<HTMLElement|null>(null);
  return {
    onOpenAutoFocus:()=>{opener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;},
    onCloseAutoFocus:(event:Event)=>{
      event.preventDefault();
      const target=opener.current?.isConnected&&opener.current!==document.body?opener.current:
        document.querySelector<HTMLElement>('[data-payment-focus-fallback]');
      target?.focus({preventScroll:true});
    },
  };
}
