import type { AccountTier } from '../types';
export type PaymentStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'cancelled';
export type PaymentFilter = 'all' | 'open' | 'pending' | 'approved' | 'closed' | 'draft';
export interface PaymentOrder {
  id: string; flow_version: number; order_code: string | null; plan_code: string; status: PaymentStatus;
  created_at: string; confirmed_at: string | null; reviewed_at: string | null; transfer_code: string;
  amount_vnd: number; list_price_vnd: number | null; discount_percent: number; discount_amount_vnd: number;
  discount_source: 'none' | 'referral' | 'streak' | null;
  buyer_snapshot: { name: string; email: string; phone: string } | null;
  plan_snapshot: { name: string; account_tier: AccountTier; duration_days: number | null } | null;
  bank_snapshot: { bank_name: string; account_number: string; account_holder: string; qr_image_url: string | null } | null;
  subscription_id: string | null; result_expires_at: string | null; admin_note: string | null;
  user_id?: string; reviewed_by?: string | null;
}
export interface PaymentEvent { id: string; event_type: string; body: string; created_at: string; actor_id?: string }
export interface PaymentDetail { order: PaymentOrder; events: PaymentEvent[] }
export interface PaymentCursor { created_at: string; id: string }
export interface PaymentPage { items: PaymentOrder[]; next_cursor: PaymentCursor | null; summary: { approved_total_vnd: number; pending_count: number } }
export const isPaymentId = (value: string | null | undefined): value is string => !!value && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);
