'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Clock3,
  Flame,
  Gift,
  Mail,
  PackageOpen,
  RefreshCw,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { CHEST_LABELS, STREAK_REWARDS, STUDY_MILESTONES } from './event-config';
import { FLYTIEE_ACCESSORIES, FLYTIEE_SETS, FLYTIEE_SKINS } from './config';
import { FlytieeBird } from './flytiee-bird';
import { FlytieeCoin } from './flytiee-coin';
import { FlytieeCoinReward } from './flytiee-coin-reward';
import { ChestArt } from './flytiee-chest-art';
import type { FlytieeChestTier, FlytieeProfile, FlytieeRewardResult } from './types';
import type { useFlytiee } from './use-flytiee';
import styles from './flytiee-events.module.css';

type FlytieeController = ReturnType<typeof useFlytiee>;

const CHEST_OPEN_MS: Record<FlytieeChestTier, number> = { bronze: 850, silver: 1080, gold: 1380 };
const CHEST_OPEN_CAPTION: Record<FlytieeChestTier, string> = {
  bronze: 'Chiếc khóa đồng vừa bật mở…',
  silver: 'Ánh bạc đang tràn ra từ rương…',
  gold: 'Kho báu vàng đang tỏa sáng…',
};

export function FlytieeRewardOverlay({ reward, profile, openingTier = null, openedTier = null, onClose }: {
  reward: FlytieeRewardResult | null;
  profile: FlytieeProfile;
  openingTier?: FlytieeChestTier | null;
  openedTier?: FlytieeChestTier | null;
  onClose: () => void;
}) {
  const actionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!reward) return;
    actionRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose, reward]);

  if (!reward && !openingTier) return null;
  const tier = openingTier ?? openedTier ?? 'bronze';
  const set = reward?.kind === 'set' ? FLYTIEE_SETS.find((item) => item.id === reward.itemId) : null;
  const skin = reward?.kind === 'skin' ? FLYTIEE_SKINS.find((item) => item.id === reward.itemId) : null;
  const accessory = reward?.kind === 'accessory' ? FLYTIEE_ACCESSORIES.find((item) => item.id === reward.itemId) : null;
  const prizeName = reward?.kind === 'coins' ? `${(reward.amount ?? 0).toLocaleString('vi-VN')} xu FlyTiee`
    : reward?.kind === 'chest' && reward.chestTier ? CHEST_LABELS[reward.chestTier]
      : set?.name ?? skin?.name ?? accessory?.name ?? reward?.title ?? '';
  const previewProfile: FlytieeProfile = set
    ? { ...profile, equippedSetId: set.id, equipped: {} }
    : skin
      ? { ...profile, equippedSetId: null, equippedSkinId: skin.id }
      : accessory
        ? { ...profile, equippedSetId: null, equipped: { [accessory.slot]: accessory.id } }
        : profile;
  const itemDescription = set?.description ?? skin?.description ?? accessory?.description;
  return (
    <Dialog open onOpenChange={(open) => {
      if (!open && !openingTier) onClose();
    }}>
      <DialogContent
        className={cn('z-[70] w-[calc(100%-1.5rem)] max-w-[480px] overflow-x-hidden overflow-y-auto p-0 text-center [&>button]:hidden', styles.rewardCard)}
        data-tier={openingTier ?? openedTier ?? undefined}
        data-kind={reward?.kind ?? 'opening'}
        data-tone={set?.tone ?? undefined}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className={styles.rewardLayout}>
          {openingTier ? (
            <DialogHeader className="relative items-center text-center">
              <div className={styles.chestStage}><ChestArt tier={tier} opening className="mx-auto h-48 w-48" /></div>
              <DialogTitle className="text-xl font-bold">Đang mở {CHEST_LABELS[tier]}…</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">{CHEST_OPEN_CAPTION[tier]}</DialogDescription>
            </DialogHeader>
          ) : (
            <>
              <button type="button" onClick={onClose} className={styles.rewardClose} aria-label="Đóng phần thưởng"><X aria-hidden="true" className="h-5 w-5" /></button>
              <div className={styles.rewardIntro}><span className={styles.rewardIntroLine} /><span>QUÀ MỚI CỦA BẠN</span><span className={styles.rewardIntroLine} /></div>
              <div className={styles.rewardVisual} aria-label={`Phần thưởng: ${prizeName}`}>
                <span className={styles.rewardVisualOrbit} aria-hidden="true" />
                {reward?.kind === 'coins' ? <FlytieeCoinReward amount={reward.amount ?? 0} />
                  : reward?.kind === 'chest' && reward.chestTier ? <ChestArt tier={reward.chestTier} className={styles.rewardChest} />
                    : set || skin || accessory ? <FlytieeBird mood="idle" profile={previewProfile} className={styles.rewardBird} />
                      : <Gift aria-hidden="true" className={styles.rewardFallback} />}
              </div>
              <DialogHeader className={styles.rewardCopy}>
                {openedTier && <DialogDescription className={styles.rewardSource}>TỪ {CHEST_LABELS[openedTier].toUpperCase()}</DialogDescription>}
                <DialogTitle className={styles.rewardName}>{prizeName}</DialogTitle>
                <DialogDescription className={styles.rewardDescription}>{itemDescription ?? reward?.description}</DialogDescription>
                {reward?.xp ? <p className={styles.rewardDestination}>+{reward.xp} EXP · Nhiệm vụ hoàn thành</p> : null}
                {itemDescription && <p className={styles.rewardDestination}>Đã thêm vào tủ đồ FlyTiee</p>}
              </DialogHeader>
              <Button ref={actionRef} type="button" className={cn('w-full', styles.eventPrimary, styles.rewardAction)} onClick={onClose}>{set ? 'Tuyệt đẹp! Tiếp tục' : 'Tiếp tục cùng FlyTiee'}</Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function FlytieeEvents({ flytiee }: { flytiee: FlytieeController }) {
  const [mailOpen, setMailOpen] = useState(false);
  const [mailCode, setMailCode] = useState('');
  const [redeemingMail, setRedeemingMail] = useState(false);
  const [reward, setReward] = useState<FlytieeRewardResult | null>(null);
  const [openingTier, setOpeningTier] = useState<FlytieeChestTier | null>(null);
  const [openedTier, setOpenedTier] = useState<FlytieeChestTier | null>(null);
  const chestTimerRef = useRef<number | null>(null);
  useEffect(() => () => { if (chestTimerRef.current !== null) window.clearTimeout(chestTimerRef.current); }, []);
  const cycleDay = Math.max(1, (flytiee.eventStats.streak - 1) % 7 + 1);
  const studyProgress = Math.min(100, flytiee.eventStats.studyMinutes / 90 * 100);
  const practiceProgress = Math.min(100, flytiee.eventStats.practiceCoinsEarned);
  const availablePracticeCoins = Math.max(0, flytiee.eventStats.practiceCoinsEarned - flytiee.dailyEvent.practiceCoinsClaimed);
  const studyComplete = [15, 45, 90].every((minutes) => flytiee.dailyEvent.studyClaimedMilestones.includes(minutes));
  const practiceComplete = flytiee.dailyEvent.practiceCoinsClaimed >= 100;
  const completionReady = studyComplete && practiceComplete;
  const totalChests = Object.values(flytiee.profile.chests).reduce((sum, count) => sum + count, 0);
  const correctTotal = useMemo(() => Object.values(flytiee.eventStats.correctByLevel).reduce((sum, count) => sum + count, 0), [flytiee.eventStats.correctByLevel]);

  const reveal = (result: FlytieeRewardResult | null) => {
    if (result) { setOpenedTier(null); setReward(result); }
  };

  const claimAndReveal = async (request: Promise<FlytieeRewardResult | null>) => {
    reveal(await request);
  };

  const handleOpenChest = (tier: FlytieeChestTier) => {
    if (flytiee.profile.chests[tier] < 1 || openingTier || flytiee.saving) return;
    setReward(null);
    setOpenedTier(tier);
    setOpeningTier(tier);
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 100 : CHEST_OPEN_MS[tier];
    chestTimerRef.current = window.setTimeout(async () => {
      chestTimerRef.current = null;
      const result = await flytiee.openChest(tier);
      setOpeningTier(null);
      if (result) setReward(result);
      else setOpenedTier(null);
    }, duration);
  };

  const submitMail = async (event: React.FormEvent) => {
    event.preventDefault();
    if (redeemingMail) return;
    setRedeemingMail(true);
    try {
      const result = await flytiee.redeemBirdieMail(mailCode);
      if (result) {
        setMailCode('');
        setMailOpen(false);
        reveal(result);
      }
    } finally {
      setRedeemingMail(false);
    }
  };

  return (
    <div className={cn('space-y-5', styles.eventWorld)}>
      <FlytieeRewardOverlay reward={reward} profile={flytiee.profile} openingTier={openingTier} openedTier={openedTier} onClose={() => { setReward(null); setOpenedTier(null); }} />

      <section className={styles.festivalBanner}>
        <div className="relative z-10 max-w-2xl">
          <p className={styles.eyebrow}>FlyTiee daily festival</p>
          <h3 className="mt-2 text-2xl font-extrabold sm:text-3xl">Lễ hội tiến bộ mỗi ngày</h3>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Học một chút, vui một chút — nối dài streak, chạm các cột mốc và mang những rương quà lấp lánh về nhà.</p>
        </div>
      </section>

      <section className={styles.mailBox}>
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className={styles.mailIcon}><Mail aria-hidden="true" className="h-6 w-6" /></div>
            <div className="relative z-10 min-w-0"><p className={styles.eyebrow}>Thư quà sự kiện</p><h3 className="mt-1 text-lg font-extrabold">Birdie Mail</h3><p className="mt-1 text-sm text-muted-foreground">Mở thư bí mật để nhận xu, phụ kiện hoặc Set giới hạn.</p></div>
          </div>
          <Button type="button" className={mailOpen ? styles.eventSecondary : styles.eventPrimary} variant={mailOpen ? 'secondary' : 'default'} onClick={() => setMailOpen((value) => !value)} aria-expanded={mailOpen} aria-controls="birdie-mail-form"><Mail aria-hidden="true" className="h-4 w-4" />{mailOpen ? 'Gấp thư lại' : 'Mở Birdie Mail'}</Button>
        </div>
        {mailOpen && <form id="birdie-mail-form" onSubmit={submitMail} className="relative z-10 border-t border-border/60 bg-card/45 p-4 backdrop-blur sm:p-5"><Label htmlFor="birdie-mail-code">Mã Birdie Mail</Label><div className="mt-2 flex flex-col gap-2 sm:flex-row"><Input id="birdie-mail-code" value={mailCode} onChange={(event) => setMailCode(event.target.value.toUpperCase())} placeholder="VD: BIRDIE-WELCOME" autoComplete="off" className="h-11 uppercase" disabled={redeemingMail} /><Button type="submit" className={cn('h-11 sm:min-w-32', styles.eventPrimary)} disabled={!mailCode.trim() || redeemingMail}>{redeemingMail ? 'Đang mở thư…' : 'Nhận quà'}</Button></div><p className="mt-2 text-xs text-muted-foreground">Mỗi mã chỉ nhận một lần trên mỗi tài khoản.</p></form>}
      </section>

      <div className={styles.sectionHeading}>
        <div><p className={styles.eyebrow}>Today&apos;s journey</p><h3 className="mt-1 text-xl font-extrabold">Hành trình hôm nay</h3><p className="mt-1 text-sm text-muted-foreground">Tiến độ được làm mới lúc 00:00 mỗi ngày.</p></div>
        <Button type="button" variant="outline" size="sm" className={styles.eventSecondary} onClick={() => void flytiee.refreshMissions()}><RefreshCw aria-hidden="true" className="h-4 w-4" />Cập nhật tiến độ</Button>
      </div>

      <section className={styles.streakCard} aria-labelledby="streak-event-title">
        <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-center gap-3"><div className={styles.streakIcon}><Flame aria-hidden="true" className="h-6 w-6" /></div><div><p className={styles.eyebrow}>7-day reward path</p><h4 id="streak-event-title" className="mt-1 text-lg font-extrabold">Đường đua streak</h4><p className="mt-1 text-sm text-muted-foreground">Bạn đã giữ lửa <span className="font-extrabold text-warning">{flytiee.eventStats.streak} ngày</span> — tiến tới kho báu ngày 7!</p></div></div><Button type="button" className={styles.eventPrimary} onClick={() => void claimAndReveal(flytiee.claimStreakReward())} disabled={flytiee.saving || flytiee.dailyEvent.streakClaimed || flytiee.eventStats.streak < 1}>{flytiee.dailyEvent.streakClaimed ? <><Check aria-hidden="true" className="h-4 w-4" />Đã nhận hôm nay</> : `Nhận quà ngày ${cycleDay}`}</Button></div>
        <div className="mt-4 overflow-x-auto pb-2" aria-label="Hành trình phần thưởng streak 7 ngày">
          <div className={styles.rewardTrack}>
          {STREAK_REWARDS.map((item) => {
            const active = item.day === cycleDay;
            const passed = item.day < cycleDay;
            const claimed = active && flytiee.dailyEvent.streakClaimed;
            const status = claimed ? 'Đã nhận' : active ? 'Chờ nhận' : passed ? 'Đã qua' : 'Sắp mở';
            const chestCount = claimed && item.kind === 'chest' ? flytiee.profile.chests[item.chestTier] : null;
            return <div key={item.day} className={styles.rewardStep} data-state={claimed ? 'claimed' : active ? 'active' : passed ? 'passed' : 'upcoming'} data-tier={item.kind === 'chest' ? item.chestTier : 'coins'} aria-label={`Ngày ${item.day}: ${item.label}. ${status}${chestCount !== null ? `. Trong kho: ${chestCount} rương` : ''}`}>
              <span className={styles.rewardOrb}>
                {item.kind === 'coins' ? <FlytieeCoin className="h-7 w-7" /> : <ChestArt tier={item.chestTier} className={styles.rewardChestArt} />}
                {claimed && <span className={styles.rewardCheck}><Check aria-hidden="true" className="h-4 w-4" /></span>}
              </span>
              <span className={styles.rewardDay}>Ngày {item.day}</span>
              <span className={styles.rewardLabel}>{item.label}</span>
              <span className={styles.rewardStatus}>{claimed && <Check aria-hidden="true" className="h-3 w-3" />}{chestCount !== null ? `Đã nhận · Kho ${chestCount}` : status}</span>
            </div>;
          })}
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={cn('flex flex-col p-4 sm:p-5', styles.eventCard)} aria-labelledby="study-event-title">
          <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><div className={cn(styles.cardIcon, 'bg-info-soft text-info')}><Clock3 aria-hidden="true" className="h-6 w-6" /></div><div><p className={styles.eyebrow}>Focus time</p><h4 id="study-event-title" className="mt-1 font-extrabold">Tích lũy phút học</h4><p className="mt-1 text-sm text-muted-foreground"><span className="font-extrabold text-info">{flytiee.eventStats.studyMinutes}</span>/90 phút hôm nay</p></div></div></div>
          <Progress value={studyProgress} className="mt-4" />
          <div className="mt-4 space-y-2">
            {STUDY_MILESTONES.map((milestone) => {
              const reached = flytiee.eventStats.studyMinutes >= milestone.minutes;
              const claimed = flytiee.dailyEvent.studyClaimedMilestones.includes(milestone.minutes);
              return <div key={milestone.minutes} className={cn('flex items-center justify-between gap-3 p-3', styles.milestoneRow)}><div className="min-w-0"><p className="text-sm font-extrabold">{milestone.minutes} phút · {milestone.label}</p><p className="mt-0.5 text-xs text-muted-foreground">{milestone.reward.kind === 'coins' ? `${milestone.reward.amount} xu` : '1 Rương bạc'}</p></div><Button type="button" size="sm" className={reached && !claimed ? styles.eventPrimary : styles.eventSecondary} variant={claimed ? 'secondary' : reached ? 'default' : 'outline'} disabled={flytiee.saving || !reached || claimed} onClick={() => void claimAndReveal(flytiee.claimStudyReward(milestone.minutes))}>{claimed ? <><Check aria-hidden="true" className="h-4 w-4" />Đã nhận</> : reached ? 'Nhận quà' : `${Math.max(0, milestone.minutes - flytiee.eventStats.studyMinutes)}p nữa`}</Button></div>;
            })}
          </div>
        </section>

        <section className={cn('flex flex-col p-4 sm:p-5', styles.eventCard)} aria-labelledby="practice-event-title">
          <div className="flex items-center gap-3"><div className={cn(styles.cardIcon, 'bg-success-soft text-success')}><Trophy aria-hidden="true" className="h-6 w-6" /></div><div><p className={styles.eyebrow}>Practice rewards</p><h4 id="practice-event-title" className="mt-1 font-extrabold">Xu từ câu đúng</h4><p className="mt-1 text-sm text-muted-foreground"><span className="font-extrabold text-success">{flytiee.eventStats.practiceCoinsEarned}</span>/100 xu · {correctTotal} câu đúng</p></div></div>
          <Progress value={practiceProgress} className="mt-4" />
          <div className="mt-4 grid grid-cols-2 gap-2">
            {([1, 2, 3, 4] as const).map((level) => <div key={level} className={cn('p-3', styles.levelTile)}><p className="text-xs font-bold text-info">Level {level}</p><p className="mt-1 text-sm font-extrabold">{flytiee.eventStats.correctByLevel[level]} câu · +{level} xu/câu</p></div>)}
          </div>
          <div className="mt-auto pt-4"><p className="mb-3 text-xs leading-5 text-muted-foreground">Tối đa 100 xu mỗi ngày. Câu đúng được tính theo Level tại thời điểm làm bài.</p><Button type="button" className={cn('w-full', availablePracticeCoins > 0 ? styles.eventPrimary : styles.eventSecondary)} disabled={flytiee.saving || availablePracticeCoins < 1} onClick={() => void claimAndReveal(flytiee.claimPracticeCoins())}><FlytieeCoin className="h-5 w-5" />{availablePracticeCoins > 0 ? `Nhận ${availablePracticeCoins} xu` : flytiee.dailyEvent.practiceCoinsClaimed >= 100 ? 'Đã nhận đủ 100 xu' : 'Chưa có xu mới'}</Button></div>
        </section>
      </div>

      <section className={cn('p-4 sm:p-5', styles.completionCard)}>
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className={cn(styles.cardIcon, 'bg-warning-soft text-warning')}><Sparkles aria-hidden="true" className="h-6 w-6" /></div><div><p className={styles.eyebrow}>Golden finale</p><h4 className="mt-1 text-lg font-extrabold">Kho báu hoàn thành kép</h4><p className="mt-1 text-sm text-muted-foreground">Hoàn tất 90 phút học và nhận đủ 100 xu câu đúng để mở khóa 1 Rương vàng.</p><div className="mt-3 flex flex-wrap gap-2 text-xs font-bold"><span className={cn('rounded-full px-3 py-1.5', studyComplete ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground')}>{studyComplete ? '✓' : '○'} 90 phút học</span><span className={cn('rounded-full px-3 py-1.5', practiceComplete ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground')}>{practiceComplete ? '✓' : '○'} 100 xu câu đúng</span></div></div></div><Button type="button" className={completionReady && !flytiee.dailyEvent.completionChestClaimed ? styles.eventPrimary : styles.eventSecondary} disabled={flytiee.saving || !completionReady || flytiee.dailyEvent.completionChestClaimed} onClick={() => void claimAndReveal(flytiee.claimDailyCompletionChest())}><Gift aria-hidden="true" className="h-4 w-4" />{flytiee.dailyEvent.completionChestClaimed ? 'Đã nhận Rương vàng' : 'Nhận Rương vàng'}</Button></div>
      </section>

      <section aria-labelledby="chest-inventory-title">
        <div className="mb-4 flex items-end justify-between gap-3"><div><p className={styles.eyebrow}>Treasure vault</p><h3 id="chest-inventory-title" className="mt-1 text-xl font-extrabold">Kho rương FlyTiee</h3><p className="mt-1 text-sm text-muted-foreground">Mỗi chiếc rương cất một bất ngờ — rương càng hiếm, quà càng cuốn hút.</p></div><span className="rounded-full bg-primary-soft px-3 py-1.5 text-sm font-extrabold text-primary">{totalChests} rương</span></div>
        <div className="grid gap-4 sm:grid-cols-3">
          {(['bronze', 'silver', 'gold'] as FlytieeChestTier[]).map((tier) => (
            <article key={tier} data-tier={tier} className={cn('p-4 text-center', styles.chestCard)}>
              <div className="relative z-10">
                <div className="flex h-36 items-center justify-center">
                  <ChestArt tier={tier} className={cn(tier === 'gold' ? 'h-36 w-36' : 'h-28 w-28')} />
                </div>
                <h4 className={cn('font-extrabold', tier === 'gold' && 'text-lg text-warning')}>{CHEST_LABELS[tier]}</h4>
                <p className="mt-1 text-sm text-muted-foreground">Đang có <span className="font-extrabold text-foreground">{flytiee.profile.chests[tier]}</span></p>
                <Button type="button" className={cn('mt-4 w-full', flytiee.profile.chests[tier] > 0 ? styles.eventPrimary : styles.eventSecondary)} variant={flytiee.profile.chests[tier] > 0 ? 'default' : 'outline'} disabled={flytiee.saving || flytiee.profile.chests[tier] < 1 || Boolean(openingTier)} onClick={() => handleOpenChest(tier)}>
                  <PackageOpen aria-hidden="true" className="h-4 w-4" />
                  {flytiee.profile.chests[tier] > 0 ? tier === 'gold' ? 'Mở kho báu' : 'Mở rương' : 'Chưa có rương'}
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
