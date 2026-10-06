'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { getPaymentOrder, getPaymentOrders, paymentErrorMessage } from './api';
import type { PaymentDetail, PaymentFilter, PaymentPage } from './types';
const empty: PaymentPage = {items:[],next_cursor:null,summary:{approved_total_vnd:0,pending_count:0}};

export function usePaymentOrders(options: {admin?: boolean; status: PaymentFilter; search?: string}) {
  const uid = useAuthStore(s=>s.user?.id);
  const {admin = false,status,search = ''} = options;
  const key = JSON.stringify([uid,admin,status,search]);
  const sequence = useRef(0); const moreLock = useRef(false);
  const [state,setState] = useState({key:'',page:empty,loading:false,loadingMore:false,error:''});
  const refresh = useCallback(async () => {
    const seq = ++sequence.current; moreLock.current=false;
    if (!uid) return;
    setState(old=>({key,page:old.key===key?old.page:empty,loading:true,loadingMore:false,error:''}));
    try {
      const page=await getPaymentOrders({admin,status,search});
      if (seq===sequence.current && useAuthStore.getState().user?.id===uid) setState({key,page,loading:false,loadingMore:false,error:''});
    } catch (error) {
      if (seq===sequence.current && useAuthStore.getState().user?.id===uid) setState(old=>({...old,key,loading:false,error:paymentErrorMessage(error)}));
    }
  },[uid,key,admin,status,search]);
  const invalidate=useCallback(()=>{sequence.current++;},[]);
  useEffect(()=>{let cancelled=false;queueMicrotask(()=>{if(!cancelled)void refresh();}); return()=>{cancelled=true;invalidate();};},[refresh,invalidate]);
  const visible = state.key===key && !!uid ? state : {key,page:empty,loading:!!uid,loadingMore:false,error:''};
  const loadMore = async () => {
    if (!uid || !visible.page.next_cursor || visible.loading || moreLock.current) return;
    moreLock.current=true; const seq=sequence.current; const cursor=visible.page.next_cursor;
    setState(old=>({...old,loadingMore:true,error:''}));
    try {
      const page=await getPaymentOrders({admin,status,search,cursor});
      if (seq===sequence.current && useAuthStore.getState().user?.id===uid) setState(old=>({...old,loadingMore:false,page:{...page,items:[...old.page.items,...page.items.filter(o=>!old.page.items.some(p=>p.id===o.id))]}}));
    } catch (error) {if(seq===sequence.current && useAuthStore.getState().user?.id===uid)setState(old=>({...old,loadingMore:false,error:paymentErrorMessage(error)}));}
    finally {if(seq===sequence.current)moreLock.current=false;}
  };
  const hasOpen = visible.page.items.some(o=>o.status==='draft'||o.status==='pending') || visible.page.summary.pending_count>0;
  useEffect(()=>{
    const focus=()=>{if(document.visibilityState!=='hidden')void refresh();};
    window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);
    const timer=hasOpen?window.setInterval(focus,60000):null;
    return()=>{window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);if(timer!==null)window.clearInterval(timer);};
  },[refresh,hasOpen]);
  return {...visible.page,loading:visible.loading,loadingMore:visible.loadingMore,error:visible.error,refresh,loadMore};
}
export function usePaymentOrder(id: string | null, admin = false) {
  const uid=useAuthStore(s=>s.user?.id); const key=JSON.stringify([uid,id,admin]);const sequence=useRef(0);
  const [state,setState]=useState<{key:string;detail:PaymentDetail|null;loading:boolean;error:string}>({key:'',detail:null,loading:false,error:''});
  const refresh=useCallback(async()=>{
    const seq=++sequence.current;if(!uid||!id)return;
    setState(old=>({key,detail:old.key===key?old.detail:null,loading:true,error:''}));
    try {const detail=await getPaymentOrder(id,admin);if(seq===sequence.current&&useAuthStore.getState().user?.id===uid)setState({key,detail,loading:false,error:''});}
    catch(error){if(seq===sequence.current&&useAuthStore.getState().user?.id===uid)setState({key,detail:null,loading:false,error:paymentErrorMessage(error)});}
  },[uid,id,admin,key]);
  const invalidate=useCallback(()=>{sequence.current++;},[]);
  useEffect(()=>{let cancelled=false;queueMicrotask(()=>{if(!cancelled)void refresh();});return()=>{cancelled=true;invalidate();};},[refresh,invalidate]);
  const visible=state.key===key&&uid&&id?state:{key,detail:null,loading:!!uid&&!!id,error:''};
  const pending=visible.detail?.order.status==='pending';
  useEffect(()=>{const focus=()=>{if(document.visibilityState!=='hidden')void refresh();};window.addEventListener('focus',focus);const timer=pending?window.setInterval(focus,60000):null;
    return()=>{window.removeEventListener('focus',focus);if(timer!==null)window.clearInterval(timer);};},[refresh,pending]);
  const replace=(detail:PaymentDetail)=>{
    if(useAuthStore.getState().user?.id===uid&&detail.order.id===id){sequence.current++;setState({key,detail,loading:false,error:''});}
  };
  return {detail:visible.detail,loading:visible.loading,error:visible.error,refresh,replace};
}
