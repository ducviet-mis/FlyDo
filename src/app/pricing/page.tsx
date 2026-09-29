'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Check,
  ChevronDown,
  Crown,
  Infinity as InfinityIcon,
  PlaneTakeoff,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { AccountTierBadge } from '@/features/subscription/components/account-tier-badge';
import { GiftCodeForm } from '@/features/subscription/components/gift-code-form';
import { PaymentDialog } from '@/features/subscription/components/payment-dialog';
import { useStreak } from '@/features/streak/hooks/use-streak';
import {
  FAQ_ITEMS,
  FLYMAX_CYCLES,
  FLYGO_FEATURES,
  PAID_PLANS,
  PREMIUM_FEATURES,
} from '@/features/subscription/config';
import type { PaidPlan } from '@/features/subscription/types';
import {
  calculateReferralDiscount,
  clampReferralDiscount,
  formatCurrency,
  formatExpiryDate,
  getEffectiveAccountTier,
  getStreakDiscountPercent,
  isReferralDiscountEligible,
} from '@/features/subscription/utils';
import { cn } from '@/lib/utils';

type BillingCycle = (typeof FLYMAX_CYCLES)[number]['id'];

export default function PricingPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const { discountExpiresAt } = useStreak();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('yearly');
  const [selectedPlan, setSelectedPlan] = useState<PaidPlan | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const currentTier = getEffectiveAccountTier(user);
  const selectedFlyMaxCycle = FLYMAX_CYCLES.find((cycle) => cycle.id === billingCycle) ?? FLYMAX_CYCLES[0];
  const flyMaxPlan = PAID_PLANS[selectedFlyMaxCycle.planCode];
  const expiryDate = currentTier === 'flymax' ? formatExpiryDate(user?.subscriptionExpiresAt) : null;
  const referralDiscountPercent = clampReferralDiscount(user?.referralDiscountPercent);
  const flyMaxDiscountPercent = Math.max(isReferralDiscountEligible(flyMaxPlan.code) ? referralDiscountPercent : 0, getStreakDiscountPercent(flyMaxPlan.code, discountExpiresAt));
  const flyMaxDiscount = calculateReferralDiscount(flyMaxPlan.price, flyMaxDiscountPercent);
  const flyMaxPrice = flyMaxPlan.price - flyMaxDiscount;
  const infinityDiscountPercent = Math.max(referralDiscountPercent, getStreakDiscountPercent('flyinfinity', discountExpiresAt));
  const infinityDiscount = calculateReferralDiscount(PAID_PLANS.flyinfinity.price, infinityDiscountPercent);
  const infinityPrice = PAID_PLANS.flyinfinity.price - infinityDiscount;

  const openPayment = (plan: PaidPlan) => {
    if (!user) {
      router.push('/login');
      return;
    }
    setSelectedPlan(plan);
    setPaymentOpen(true);
  };

  return (
    <div className="pb-8">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-hero px-5 py-10 text-center shadow-soft sm:px-8 sm:py-14">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-brand-cyan/15 blur-3xl" />
        <div className="relative mx-auto max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-surface/80 px-3 py-1.5 text-sm font-semibold text-primary shadow-soft">
            <Sparkles aria-hidden="true" className="h-4 w-4" /> Học theo cách của bạn
          </span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">Chọn đôi cánh phù hợp để tiến xa hơn</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Bắt đầu miễn phí với FlyGo, mở khóa toàn bộ cùng FlyMax hoặc đồng hành trọn đời với FlyInfinity.
          </p>
        </div>
      </section>

      {user && (
        <section className="mt-6 flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <ShieldCheck aria-hidden="true" className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Gói hiện tại của bạn</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <AccountTierBadge tier={currentTier} />
                {expiryDate && <span className="text-sm text-muted-foreground">Hết hạn ngày {expiryDate}</span>}
                {currentTier === 'flyinfinity' && <span className="text-sm text-muted-foreground">Không giới hạn thời gian</span>}
              </div>
            </div>
          </div>
          <Button asChild variant="outline"><Link href="/profile">Quản lý tài khoản</Link></Button>
        </section>
      )}

      {user && (referralDiscountPercent > 0 || getStreakDiscountPercent('flyinfinity', discountExpiresAt) > 0) && (
        <section className="mt-4 flex items-start gap-3 rounded-2xl border border-success/25 bg-success-soft/55 p-4 text-sm shadow-soft">
          <Sparkles aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          <p className="leading-relaxed text-foreground">
            <span className="font-bold">{getStreakDiscountPercent('flyinfinity', discountExpiresAt) > 0 ? 'Ưu đãi streak: giảm 50% trong 30 ngày.' : `Ưu đãi giới thiệu của bạn: ${referralDiscountPercent}%.`}</span>{' '}
            Mức giá bên dưới áp dụng ưu đãi cao nhất cho FlyMax 6 tháng, 1 năm và FlyInfinity. Ưu đãi không cộng dồn.
          </p>
        </section>
      )}

      <section aria-labelledby="pricing-heading" className="mt-12">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="pricing-heading" className="text-2xl font-bold text-foreground sm:text-3xl">Gói đăng ký FlyDo</h2>
          <p className="mt-3 text-muted-foreground">Giá và đặc quyền dưới đây là nội dung khởi tạo, bạn có thể điều chỉnh trước khi mở bán chính thức.</p>
        </div>

        <div className="mt-8 grid items-stretch gap-5 lg:grid-cols-3">
          <PricingCard
            tier="flygo"
            title="FlyGo"
            description="Đủ để bắt đầu và duy trì thói quen học mỗi ngày."
            price="0đ"
            priceSuffix="mãi mãi"
            features={FLYGO_FEATURES}
            icon={PlaneTakeoff}
            current={currentTier === 'flygo' && !!user}
            action={user ? undefined : () => router.push('/register')}
            actionLabel={!user ? 'Bắt đầu miễn phí' : currentTier === 'flygo' ? 'Gói hiện tại' : 'Đã nâng cấp'}
          />

          <PricingCard
            tier="flymax"
            title="FlyMax"
            description="Mở khóa trọn bộ công cụ học tập và luyện đề."
            price={formatCurrency(flyMaxPrice)}
            priceSuffix={`Thời hạn ${flyMaxPlan.billingLabel}`}
            features={PREMIUM_FEATURES}
            icon={Crown}
            featured
            current={currentTier === 'flyinfinity'}
            action={() => openPayment(flyMaxPlan)}
            actionLabel={currentTier === 'flyinfinity' ? 'Đã sở hữu FlyInfinity' : currentTier === 'flymax' ? 'Gia hạn FlyMax' : 'Chọn FlyMax'}
            headerExtra={(
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 sm:grid-cols-4" role="group" aria-label="Chọn thời hạn FlyMax">
                {FLYMAX_CYCLES.map((cycle) => (
                  <button
                    key={cycle.id}
                    type="button"
                    onClick={() => setBillingCycle(cycle.id)}
                    aria-pressed={billingCycle === cycle.id}
                    className={cn('min-h-11 rounded-lg px-2 py-2 text-sm font-semibold transition-colors', billingCycle === cycle.id ? 'bg-surface text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground')}
                  >
                    {cycle.label}
                  </button>
                ))}
              </div>
            )}
            priceNote={[
              flyMaxDiscountPercent > 0 ? `Ưu đãi ${flyMaxDiscountPercent}%: giảm ${formatCurrency(flyMaxDiscount)}` : '',
              selectedFlyMaxCycle.savings > 0 ? `Tiết kiệm ${formatCurrency(selectedFlyMaxCycle.savings)} so với gói 1 tháng` : '',
            ].filter(Boolean).join(' · ') || undefined}
          />

          <PricingCard
            tier="flyinfinity"
            title="FlyInfinity"
            description="Một lần thanh toán, đồng hành cùng FlyDo trọn đời."
            price={formatCurrency(infinityPrice)}
            priceSuffix="thanh toán một lần"
            features={PREMIUM_FEATURES}
            icon={InfinityIcon}
            current={currentTier === 'flyinfinity'}
            action={() => openPayment(PAID_PLANS.flyinfinity)}
            actionLabel={currentTier === 'flyinfinity' ? 'Gói hiện tại' : 'Chọn FlyInfinity'}
            priceNote={infinityDiscountPercent > 0 ? `Ưu đãi ${infinityDiscountPercent}%: giảm ${formatCurrency(infinityDiscount)}` : undefined}
          />
        </div>
      </section>

      <section aria-labelledby="gift-heading" className="mx-auto mt-14 max-w-3xl">
        <h2 id="gift-heading" className="sr-only">Mã quà tặng</h2>
        <GiftCodeForm />
      </section>

      <section aria-labelledby="faq-heading" className="mx-auto mt-16 max-w-4xl">
        <div className="text-center">
          <h2 id="faq-heading" className="text-2xl font-bold text-foreground sm:text-3xl">Câu hỏi thường gặp</h2>
          <p className="mt-3 text-muted-foreground">Một vài thông tin giúp bạn hiểu rõ hơn trước khi chọn gói.</p>
        </div>
        <div className="mt-7 space-y-3">
          {FAQ_ITEMS.map((item) => (
            <details key={item.question} className="group rounded-xl border border-border bg-card shadow-soft open:shadow-card">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 font-semibold text-foreground sm:px-5 [&::-webkit-details-marker]:hidden">
                <span>{item.question}</span>
                <ChevronDown aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" />
              </summary>
              <p className="border-t border-border px-4 py-4 leading-relaxed text-muted-foreground sm:px-5">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <PaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} plan={selectedPlan} />
    </div>
  );
}

function PricingCard({
  tier,
  title,
  description,
  price,
  priceSuffix,
  priceNote,
  features,
  icon: Icon,
  featured,
  current,
  action,
  actionLabel,
  headerExtra,
}: {
  tier: 'flygo' | 'flymax' | 'flyinfinity';
  title: string;
  description: string;
  price: string;
  priceSuffix: string;
  priceNote?: string;
  features: string[];
  icon: typeof Crown;
  featured?: boolean;
  current: boolean;
  action?: () => void;
  actionLabel: string;
  headerExtra?: React.ReactNode;
}) {
  return (
    <Card className={cn('relative flex h-full flex-col overflow-hidden rounded-2xl', featured && 'sol-pricing-featured border-primary/45 shadow-float')}>
      {featured && <div className="bg-primary px-4 py-2 text-center text-xs font-bold uppercase tracking-[0.16em] text-primary-foreground">Phổ biến nhất</div>}
      <CardHeader className="space-y-4 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl', tier === 'flyinfinity' ? 'bg-special-soft text-special' : tier === 'flymax' ? 'bg-primary-soft text-primary' : 'bg-muted text-foreground')}>
            <Icon aria-hidden="true" className="h-6 w-6" />
          </div>
          <AccountTierBadge tier={tier} />
        </div>
        <div>
          <CardTitle as="h3" className="text-2xl font-bold">{title}</CardTitle>
          <p className="mt-2 min-h-12 text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
        {headerExtra}
        <div>
          <p className="text-3xl font-bold tabular-nums text-foreground">{price}</p>
          <p className="mt-1 text-sm text-muted-foreground">{priceSuffix}</p>
          {priceNote && <p className="mt-2 text-xs font-semibold text-success">{priceNote}</p>}
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col px-5 pb-5 sm:px-6 sm:pb-6">
        <ul className="flex-1 space-y-3">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-2.5 text-sm leading-relaxed text-foreground">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-soft text-success"><Check aria-hidden="true" className="h-3.5 w-3.5" /></span>
              {feature}
            </li>
          ))}
        </ul>
        <Button type="button" size="lg" variant={featured ? 'default' : 'outline'} disabled={current || !action} onClick={action} className="mt-6 w-full">
          {actionLabel}
          {!current && action && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
        </Button>
      </CardContent>
    </Card>
  );
}
