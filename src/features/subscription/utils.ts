import type { User } from '@/features/auth/types';
import type { AccountTier, PaidPlanCode } from './types';

const REFERRAL_DISCOUNT_PLANS: PaidPlanCode[] = [
  'flymax_half_yearly',
  'flymax_yearly',
  'flyinfinity',
];

export function getEffectiveAccountTier(user: User | null | undefined): AccountTier {
  if (!user) return 'flygo';
  if (user.accountTier === 'flyinfinity') return 'flyinfinity';

  if (user.accountTier === 'flymax') {
    if (!user.subscriptionExpiresAt) return 'flygo';
    return new Date(user.subscriptionExpiresAt).getTime() > Date.now() ? 'flymax' : 'flygo';
  }

  return 'flygo';
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(value) + 'đ';
}

export function formatExpiryDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function createTransferCode(userId?: string): string {
  const suffix = userId ? userId.replace(/-/g, '').slice(0, 8).toUpperCase() : 'DANGNHAP';
  return `FLYDO ${suffix}`;
}

export function isReferralDiscountEligible(planCode: PaidPlanCode): boolean {
  return REFERRAL_DISCOUNT_PLANS.includes(planCode);
}

export function clampReferralDiscount(value?: number): number {
  return Math.min(20, Math.max(0, Number(value) || 0));
}

export function calculateReferralDiscount(price: number, discountPercent?: number): number {
  return Math.floor(price * clampReferralDiscount(discountPercent) / 100);
}

// Referral rewards remain capped at 20%; a selected streak offer can be 50%.
export function calculateSubscriptionDiscount(price: number, discountPercent?: number): number {
  const percent = Math.min(50, Math.max(0, Number(discountPercent) || 0));
  return Math.floor(price * percent / 100);
}

export function getStreakDiscountPercent(planCode: PaidPlanCode, expiresAt?: string | null): number {
  return isReferralDiscountEligible(planCode) && expiresAt && new Date(expiresAt).getTime() > Date.now() ? 50 : 0;
}

export function canRedeemReferralCode(user: User | null | undefined, now = Date.now()): boolean {
  if (!user || user.referralRedeemedAt || !user.referralEligibleUntil) return false;
  const deadline = new Date(user.referralEligibleUntil).getTime();
  return Number.isFinite(deadline) && deadline > now;
}
