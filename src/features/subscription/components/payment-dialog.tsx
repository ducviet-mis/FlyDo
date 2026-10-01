'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clipboard, Landmark, QrCode, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { useStreak } from '@/features/streak/hooks/use-streak';
import { calculateSubscriptionDiscount, clampReferralDiscount, createTransferCode, formatCurrency, getStreakDiscountPercent, isReferralDiscountEligible } from '../utils';
import type { PaidPlan, PaymentSettings } from '../types';

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: PaidPlan | null;
}

const EMPTY_SETTINGS: PaymentSettings = {
  bankName: 'Chưa cấu hình',
  accountNumber: 'Chưa cấu hình',
  accountHolder: 'Chưa cấu hình',
  qrImageUrl: '',
};

export function PaymentDialog({ open, onOpenChange, plan }: PaymentDialogProps) {
  const user = useAuthStore((state) => state.user);
  const { discountExpiresAt } = useStreak();
  const [settings, setSettings] = useState<PaymentSettings>(EMPTY_SETTINGS);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmedDemo, setConfirmedDemo] = useState(false);
  const transferCode = useMemo(() => createTransferCode(user?.id), [user?.id]);
  const discountPercent = plan && isReferralDiscountEligible(plan.code)
    ? Math.max(clampReferralDiscount(user?.referralDiscountPercent), getStreakDiscountPercent(plan.code, discountExpiresAt))
    : 0;
  const discountAmount = plan ? calculateSubscriptionDiscount(plan.price, discountPercent) : 0;
  const amountDue = plan ? plan.price - discountAmount : 0;

  useEffect(() => {
    if (!open) return;
    setConfirmedDemo(false);

    const loadSettings = async () => {
      const supabase = getSupabaseClient();
      const { data } = await supabase
        .from('payment_settings')
        .select('bank_name, account_number, account_holder, qr_image_url')
        .eq('id', 1)
        .maybeSingle();

      if (data) {
        setSettings({
          bankName: data.bank_name || EMPTY_SETTINGS.bankName,
          accountNumber: data.account_number || EMPTY_SETTINGS.accountNumber,
          accountHolder: data.account_holder || EMPTY_SETTINGS.accountHolder,
          qrImageUrl: data.qr_image_url || '',
        });
      }
    };

    void loadSettings();
  }, [open]);

  const copyText = async (label: string, value: string) => {
    if (!value || value === 'Chưa cấu hình') return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  };

  if (!plan) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 motion-reduce:animate-none">
        <DialogHeader className="border-b border-border py-5 pl-5 pr-14 sm:pl-7">
          <DialogTitle className="text-xl font-bold">Thanh toán {plan.name}</DialogTitle>
          <DialogDescription>
            Giao diện thanh toán chuyển khoản đang ở chế độ demo. FlyDo chưa tự động trừ tiền hoặc kích hoạt gói.
          </DialogDescription>
        </DialogHeader>

        <div className="mx-5 rounded-xl border border-primary/20 bg-primary-soft/50 p-4 sm:mx-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Gói đã chọn</p>
              <p className="mt-1 font-bold text-foreground">{plan.name} · {plan.billingLabel}</p>
            </div>
            <div className="shrink-0">
              <p className="text-xs text-muted-foreground">Số tiền thanh toán</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-primary">{formatCurrency(amountDue)}</p>
              {discountPercent > 0 && <p className="mt-0.5 text-xs font-semibold text-success">Đã giảm {discountPercent}%</p>}
            </div>
          </div>
          {discountPercent > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
              <span className="text-muted-foreground">Ưu đãi {discountPercent === 50 ? 'streak' : 'giới thiệu'} ({discountPercent}%)</span>
              <span className="font-semibold tabular-nums text-success">−{formatCurrency(discountAmount)}</span>
            </div>
          )}
        </div>

        <div className="grid items-start gap-4 px-5 sm:px-7 sm:grid-cols-[minmax(0,1fr)_200px]">
          <div className="min-w-0 space-y-3">
            <PaymentRow icon={Landmark} label="Ngân hàng" value={settings.bankName} />
            <PaymentRow icon={Clipboard} label="Số tài khoản" value={settings.accountNumber} onCopy={() => copyText('account', settings.accountNumber)} copied={copied === 'account'} />
            <PaymentRow icon={ShieldCheck} label="Chủ tài khoản" value={settings.accountHolder} />
            <PaymentRow icon={Clipboard} label="Nội dung chuyển khoản" value={transferCode} onCopy={() => copyText('content', transferCode)} copied={copied === 'content'} />
          </div>
          <div className="flex min-h-40 items-center justify-center overflow-hidden rounded-xl border border-dashed border-primary/35 bg-primary-soft/50 p-4 sm:min-h-[200px]">
            {settings.qrImageUrl ? (
              <img src={settings.qrImageUrl} alt="Mã QR thanh toán FlyDo" width={200} height={200} className="aspect-square w-full max-w-[200px] rounded-lg object-contain" />
            ) : (
              <div className="text-center">
                <QrCode aria-hidden="true" className="mx-auto h-12 w-12 text-primary" />
                <p className="mt-3 font-bold text-foreground">QR thanh toán</p>
                <p className="mt-1 text-sm text-muted-foreground">Chưa cấu hình ảnh QR</p>
              </div>
            )}
          </div>
        </div>

        <div className="mx-5 rounded-xl border border-warning/25 bg-warning-soft p-4 text-sm text-warning sm:mx-7">
          Không chuyển khoản khi thông tin ngân hàng còn hiển thị “Chưa cấu hình”. Đây chỉ là bản xem trước giao diện thanh toán.
        </div>

        {confirmedDemo && (
          <p role="status" className="mx-5 flex items-start gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm font-medium text-success sm:mx-7">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            Đã hoàn tất thao tác demo. Chưa có giao dịch hoặc gói tài khoản nào được tạo.
          </p>
        )}

        <DialogFooter className="gap-2 border-t border-border px-5 py-4 sm:space-x-0 sm:px-7">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">Đóng</Button>
          <Button type="button" onClick={() => setConfirmedDemo(true)} className="h-auto min-h-11 w-full whitespace-normal py-3 sm:w-auto">Xác nhận chuyển khoản (demo)</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentRow({
  icon: Icon,
  label,
  value,
  onCopy,
  copied,
}: {
  icon: typeof Landmark;
  label: string;
  value: string;
  onCopy?: () => void;
  copied?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-surface p-3">
      <Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 break-words font-semibold text-foreground [overflow-wrap:anywhere]">{value}</p>
      </div>
      {onCopy && value !== 'Chưa cấu hình' && (
        <button type="button" onClick={onCopy} className="flex min-h-11 shrink-0 items-center rounded-md px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none" aria-label={`Sao chép ${label.toLowerCase()}`}>
          {copied ? 'Đã chép' : 'Sao chép'}
        </button>
      )}
    </div>
  );
}
