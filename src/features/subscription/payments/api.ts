import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import type { PaidPlanCode } from '../types';
import { isPaymentId, type PaymentDetail, type PaymentPage, type PaymentCursor, type PaymentFilter } from './types';

export class PaymentError extends Error { constructor(message: string, public code = 'REQUEST') { super(message); this.name = 'PaymentError'; } }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const date = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
const nullable = (v: unknown, check: (v: unknown) => boolean) => v === null || check(v);
const integer = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;
const string = (v: unknown) => typeof v === 'string';
function order(v: unknown) {
  if (!object(v) || !isPaymentId(v.id as string) || ![0,1].includes(v.flow_version as number)
    || !['draft','pending','approved','rejected','cancelled'].includes(v.status as string)
    || !date(v.created_at) || !nullable(v.confirmed_at,date) || !nullable(v.reviewed_at,date)
    || !integer(v.amount_vnd) || !nullable(v.list_price_vnd,integer) || !integer(v.discount_percent) || !integer(v.discount_amount_vnd)
    || !string(v.transfer_code) || !string(v.plan_code) || !nullable(v.order_code,string)
    || !nullable(v.subscription_id,x=>isPaymentId(x as string)) || !nullable(v.result_expires_at,date) || !nullable(v.admin_note,string)) return false;
  const buyer = v.buyer_snapshot; const plan = v.plan_snapshot; const bank = v.bank_snapshot;
  return nullable(buyer,x=>object(x)&&string(x.name)&&string(x.email)&&string(x.phone))
    && nullable(plan,x=>object(x)&&string(x.name)&&['flymax','flyinfinity'].includes(x.account_tier as string)&&nullable(x.duration_days,integer))
    && nullable(bank,x=>object(x)&&string(x.bank_name)&&string(x.account_number)&&string(x.account_holder)&&nullable(x.qr_image_url,string))
    && (v.flow_version===0 || (!!buyer && !!plan && !!bank && !!v.order_code));
}
async function call(name: string, args: Record<string, unknown>, admin = false): Promise<Record<string, unknown>> {
  const uid = useAuthStore.getState().user?.id;
  if (!uid) throw new PaymentError('Vui lòng đăng nhập lại.', 'AUTH');
  let response;
  try { response = await getSupabaseClient().rpc(name, args); }
  catch { throw new PaymentError('Chưa kết nối được. Thông tin đơn vẫn được giữ; hãy thử lại.'); }
  if (useAuthStore.getState().user?.id !== uid) throw new PaymentError('Tài khoản đã thay đổi.', 'ACCOUNT_CHANGED');
  if (response.error) {
    const code = response.error.code;
    if (['PGRST202','42883','42P01','42703'].includes(code ?? '')) throw new PaymentError(admin
      ? 'Thanh toán chưa sẵn sàng. Cần chạy manual-payments.sql trước khi tiếp nhận đơn.'
      : 'Thanh toán chưa sẵn sàng. Vui lòng liên hệ hỗ trợ hoặc quay lại sau.', 'MIGRATION');
    if (['42501','PGRST301'].includes(code ?? '')) throw new PaymentError('Phiên đăng nhập hoặc quyền truy cập không hợp lệ. Vui lòng đăng nhập lại.', 'AUTH');
    throw new PaymentError('Chưa xử lý được yêu cầu. Vui lòng làm mới đơn và thử lại.');
  }
  const data: unknown = response.data;
  if (!object(data)) throw new PaymentError('Dữ liệu đơn chưa hợp lệ. Vui lòng làm mới.');
  if (data.success === false) throw new PaymentError(string(data.message) ? data.message as string : 'Không thể xử lý yêu cầu.', string(data.code) ? data.code as string : 'REQUEST');
  if (data.success !== true) throw new PaymentError('Chưa nhận được kết quả xác nhận từ máy chủ.');
  return data;
}
async function detail(name: string, args: Record<string, unknown>, admin = false): Promise<PaymentDetail> {
  const data = await call(name,args,admin);
  if (!order(data.order) || !Array.isArray(data.events) || !data.events.every(e=>object(e)&&isPaymentId(e.id as string)&&string(e.event_type)&&string(e.body)&&date(e.created_at)))
    throw new PaymentError('Chi tiết đơn chưa hợp lệ. Vui lòng làm mới.');
  return data as unknown as PaymentDetail;
}
export const preparePaymentOrder = (planCode: PaidPlanCode, requestId: string) => detail('prepare_payment_order',{p_plan_code:planCode,p_request_id:requestId});
export const confirmPaymentOrder = (id: string) => detail('confirm_payment_order',{p_order_id:id});
export const cancelPaymentOrder = (id: string) => detail('cancel_payment_order',{p_order_id:id});
export const getPaymentOrder = (id: string, admin = false) => detail(admin?'admin_get_payment_order':'get_my_payment_order',{p_order_id:id},admin);
export const approvePaymentOrder = (id: string) => detail('admin_approve_payment_order',{p_order_id:id},true);
export const replyPaymentOrder = (id: string, message: string) => detail('admin_reply_payment_order',{p_order_id:id,p_message:message},true);
export const rejectPaymentOrder = (id: string, message: string) => detail('admin_reject_payment_order',{p_order_id:id,p_message:message},true);
export async function getPaymentOrders(options: {admin?: boolean;status: PaymentFilter;search?: string;cursor?: PaymentCursor;limit?: number}): Promise<PaymentPage> {
  const data = await call(options.admin?'admin_get_payment_orders':'get_my_payment_orders',{
    p_status:options.status,p_limit:options.limit??20,p_cursor_created_at:options.cursor?.created_at??null,p_cursor_id:options.cursor?.id??null,
    ...(options.admin?{p_search:options.search??''}:{}),
  },options.admin);
  if (!Array.isArray(data.items) || !data.items.every(order) || !object(data.summary) || !integer(data.summary.approved_total_vnd) || !integer(data.summary.pending_count)
    || !nullable(data.next_cursor,x=>object(x)&&date(x.created_at)&&isPaymentId(x.id as string))) throw new PaymentError('Danh sách đơn chưa hợp lệ. Vui lòng làm mới.');
  return data as unknown as PaymentPage;
}
export const paymentErrorMessage = (error: unknown) => error instanceof PaymentError ? error.message : 'Chưa xử lý được yêu cầu. Hãy kiểm tra kết nối rồi thử lại.';
