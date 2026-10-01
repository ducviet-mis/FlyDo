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
  calculateSubscriptionDiscount,
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
  const flyMaxDiscount = calculateSubscriptionDiscount(flyMaxPlan.price, flyMaxDiscountPercent);
  const flyMaxPrice = flyMaxPlan.price - flyMaxDiscount;
  const infinityDiscountPercent = Math.max(referralDiscountPercent, getStreakDiscountPercent('flyinfinity', discountExpiresAt));
  const infinityDiscount = calculateSubscriptionDiscount(PAID_PLANS.flyinfinity.price, infinityDiscountPercent);
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
    <div className="mx-auto max-w-6xl space-y-8 pb-8 sm:space-y-10">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Gói FlyDo</h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          Bắt đầu miễn phí. Chọn FlyMax hoặc FlyInfinity khi bạn muốn mở khóa toàn bộ công cụ học tập.
        </p>
      </header>

      {user && (
        <section aria-label="Gói hiện tại và ưu đãi" className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <ShieldCheck aria-hidden="true" className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Gói hiện tại của bạn</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <AccountTierBadge tier={currentTier} />
                  {expiryDate && <span className="text-sm text-muted-foreground">Hết hạn ngày {expiryDate}</span>}
                  {currentTier === 'flyinfinity' && <span className="text-sm text-muted-foreground">Không giới hạn thời gian</span>}
                </div>
              </div>
            </div>
            <Button asChild variant="outline" className="shrink-0"><Link href="/profile">Quản lý tài khoản</Link></Button>
          </div>
          {(referralDiscountPercent > 0 || getStreakDiscountPercent('flyinfinity', discountExpiresAt) > 0) && (
            <div className="flex items-start gap-3 border-t border-border bg-success-soft/55 px-5 py-4 text-sm">
              <Sparkles aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-success" />
              <p className="leading-relaxed text-foreground">
                <span className="font-bold">{getStreakDiscountPercent('flyinfinity', discountExpiresAt) > 0 ? 'Ưu đãi streak: giảm 50% trong 30 ngày.' : `Ưu đãi giới thiệu của bạn: ${referralDiscountPercent}%.`}</span>{' '}
                Mức giá bên dưới áp dụng ưu đãi cao nhất cho FlyMax 6 tháng, 1 năm và FlyInfinity. Ưu đãi không cộng dồn.
              </p>
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="pricing-heading">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <h2 id="pricing-heading" className="text-xl font-bold text-foreground sm:text-2xl">Chọn gói phù hợp</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">FlyMax và FlyInfinity có cùng quyền lợi. Bạn chỉ cần chọn thời hạn phù hợp với mình.</p>
          </div>
          <div className="shrink-0 lg:w-[360px]">
            <p id="flymax-duration" className="mb-2 text-sm font-semibold text-foreground">Thời hạn FlyMax</p>
            <div className="grid grid-cols-4 gap-1 rounded-xl border border-border bg-muted p-1" role="group" aria-labelledby="flymax-duration">
              {FLYMAX_CYCLES.map((cycle) => (
                <button
                  key={cycle.id}
                  type="button"
                  onClick={() => setBillingCycle(cycle.id)}
                  aria-pressed={billingCycle === cycle.id}
                  aria-controls="flymax-plan"
                  className={cn('min-h-11 rounded-lg px-1 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none', billingCycle === cycle.id ? 'bg-surface text-foreground shadow-soft' : 'text-muted-foreground hover:bg-surface/60 hover:text-foreground')}
                >
                  {cycle.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 grid items-stretch gap-4 lg:grid-cols-3">
          <PricingCard
            tier="flygo"
            title="FlyGo"
            description="Đủ để bắt đầu và duy trì thói quen học mỗi ngày."
            price="0đ"
            priceSuffix="mãi mãi"
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
            originalPrice={flyMaxDiscountPercent > 0 ? formatCurrency(flyMaxPlan.price) : undefined}
            icon={Crown}
            featured
            current={currentTier === 'flyinfinity'}
            action={() => openPayment(flyMaxPlan)}
            actionLabel={currentTier === 'flyinfinity' ? 'Đã sở hữu FlyInfinity' : currentTier === 'flymax' ? 'Gia hạn FlyMax' : 'Chọn FlyMax'}
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
            originalPrice={infinityDiscountPercent > 0 ? formatCurrency(PAID_PLANS.flyinfinity.price) : undefined}
            icon={InfinityIcon}
            current={currentTier === 'flyinfinity'}
            action={() => openPayment(PAID_PLANS.flyinfinity)}
            actionLabel={currentTier === 'flyinfinity' ? 'Gói hiện tại' : 'Chọn FlyInfinity'}
            priceNote={infinityDiscountPercent > 0 ? `Ưu đãi ${infinityDiscountPercent}%: giảm ${formatCurrency(infinityDiscount)}` : undefined}
          />
        </div>
      </section>

      <section aria-labelledby="benefits-heading">
        <h2 id="benefits-heading" className="text-xl font-bold text-foreground sm:text-2xl">Quyền lợi trong mỗi gói</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <BenefitsCard title="FlyGo" description="Các công cụ học tập miễn phí" features={FLYGO_FEATURES} icon={PlaneTakeoff} />
          <BenefitsCard title="FlyMax & FlyInfinity" description="Toàn bộ quyền lợi, không khác nhau giữa các thời hạn" features={PREMIUM_FEATURES} icon={Crown} premium />
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card level="supporting" className="rounded-2xl p-5 sm:p-6">
          <GiftCodeForm compact />
        </Card>
        <section aria-labelledby="faq-heading" className="min-w-0">
          <h2 id="faq-heading" className="text-xl font-bold text-foreground sm:text-2xl">Câu hỏi thường gặp</h2>
          <div className="mt-4 space-y-2">
            {FAQ_ITEMS.map((item) => (
              <details key={item.question} className="group rounded-xl border border-border bg-card shadow-soft open:shadow-card">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-4 py-4 text-sm font-semibold text-foreground outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring sm:px-5 [&::-webkit-details-marker]:hidden">
                  <span>{item.question}</span>
                  <ChevronDown aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                </summary>
                <p className="border-t border-border px-4 py-4 text-sm leading-relaxed text-muted-foreground sm:px-5">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      </div>

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
  originalPrice,
  icon: Icon,
  featured,
  current,
  action,
  actionLabel,
}: {
  tier: 'flygo' | 'flymax' | 'flyinfinity';
  title: string;
  description: string;
  price: string;
  priceSuffix: string;
  priceNote?: string;
  originalPrice?: string;
  icon: typeof Crown;
  featured?: boolean;
  current: boolean;
  action?: () => void;
  actionLabel: string;
}) {
  return (
    <Card id={`${tier}-plan`} className={cn('relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl', featured && 'sol-pricing-featured border-primary/45 shadow-float')}>
      <CardHeader className="space-y-3 border-b border-border p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', tier === 'flyinfinity' ? 'bg-special-soft text-special' : tier === 'flymax' ? 'bg-primary-soft text-primary' : 'bg-muted text-foreground')}>
              <Icon aria-hidden="true" className="h-5 w-5" />
            </div>
            <CardTitle as="h3" className="text-xl font-bold">{title}</CardTitle>
          </div>
          {(featured || current) && (
            <span className="shrink-0 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary">{featured ? 'Linh hoạt' : 'Đang dùng'}</span>
          )}
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground lg:min-h-12">{description}</p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex-1" aria-live={tier === 'flymax' ? 'polite' : undefined} aria-atomic={tier === 'flymax' ? true : undefined}>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-3xl font-bold tabular-nums tracking-tight text-foreground">{price}</p>
            {originalPrice && <del className="text-sm tabular-nums text-muted-foreground"><span className="sr-only">Giá gốc: </span>{originalPrice}</del>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{priceSuffix}</p>
          {priceNote && <p className="mt-3 text-sm font-medium leading-relaxed text-success">{priceNote}</p>}
        </div>
        <Button type="button" size="lg" variant={featured ? 'default' : 'outline'} disabled={current || !action} onClick={action} className="mt-5 h-auto min-h-12 w-full whitespace-normal py-3">
          {actionLabel}
          {!current && action && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
        </Button>
      </CardContent>
    </Card>
  );
}

function BenefitsCard({ title, description, features, icon: Icon, premium = false }: {
  title: string;
  description: string;
  features: string[];
  icon: typeof Crown;
  premium?: boolean;
}) {
  return (
    <Card level="supporting" className="rounded-2xl p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', premium ? 'bg-primary-soft text-primary' : 'bg-muted text-foreground')}>
          <Icon aria-hidden="true" className="h-5 w-5" />
        </span>
        <div>
          <h3 className="font-bold text-foreground">{title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
      <ul className="mt-5 space-y-3 border-t border-border pt-5">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-sm leading-relaxed text-foreground">
            <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
