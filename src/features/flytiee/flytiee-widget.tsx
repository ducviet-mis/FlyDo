'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  Check,
  Compass,
  Edit3,
  Gift,
  RefreshCw,
  Sparkles,
  Star,
  Ticket,
  Trophy,
  Utensils,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { ACCESSORY_SLOT_LABELS, FLYTIEE_ACCESSORIES, FLYTIEE_SETS, FLYTIEE_SKINS } from './config';
import { FlytieeBird, FlytieeAccessoryPreview } from './flytiee-bird';
import { FlytieeCoin } from './flytiee-coin';
import { FlytieeEvents, FlytieeRewardOverlay } from './flytiee-events';
import { FlytieeAdventure } from './flytiee-adventure';
import type { FlytieeAccessorySlot, FlytieeMood, FlytieeRewardResult } from './types';
import { useFlytiee } from './use-flytiee';
import styles from './flytiee-widget.module.css';

const IDLE_ACTIONS: Array<{ mood: FlytieeMood; line: string; duration: number }> = [
  { mood: 'idle', line: 'Chớp chớp… tớ vẫn ở đây nhé!', duration: 2600 },
  { mood: 'sway', line: 'Trong đầu tớ đang có nhạc!', duration: 4200 },
  { mood: 'look', line: 'Ủa… bên kia có gì thế?', duration: 4600 },
  { mood: 'feet', line: 'Hai cái chân này… là của tớ à?', duration: 4400 },
  { mood: 'fly', line: 'Một, hai… bay được một tí rồi!', duration: 4100 },
  { mood: 'sneeze', line: 'Hắt… xì! Hihi, nhột mũi quá.', duration: 2800 },
  { mood: 'scratch', line: 'Hmm… hôm nay học gì nhỉ?', duration: 4000 },
  { mood: 'happy', line: 'Hôm nay tớ vui ơi là vui!', duration: 3200 },
  { mood: 'sleep', line: 'Zzz… chợp mắt một chút nhé.', duration: 6000 },
];

const ACCESSORY_TONES: Record<string, string> = {
  coral: 'bg-destructive-soft text-destructive', navy: 'bg-primary-soft text-primary',
  indigo: 'bg-special-soft text-special', cyan: 'bg-info-soft text-info',
  red: 'bg-destructive-soft text-destructive', mint: 'bg-success-soft text-success',
  yellow: 'bg-warning-soft text-warning', green: 'bg-success-soft text-success',
};

type ShopCategory = 'set' | 'skin' | FlytieeAccessorySlot;

function levelTitle(level: number) {
  if (level >= 20) return 'Bạn học siêu sao';
  if (level >= 10) return 'Chim thông thái';
  if (level >= 5) return 'Chim chăm học';
  return 'Chim non';
}

function claimedToday(claimedIds: string[], missionId: string) {
  const now = new Date();
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}:${missionId}`;
  return claimedIds.includes(key);
}

interface FlytieeWidgetProps {
  variant?: 'sidebar' | 'hero';
}

export function FlytieeWidget({ variant = 'sidebar' }: FlytieeWidgetProps) {
  const user = useAuthStore((state) => state.user);
  const flytiee = useFlytiee();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('home');
  const [mood, setMood] = useState<FlytieeMood>('idle');
  const [speech, setSpeech] = useState('Học cùng tớ nhé?');
  const [petTapCount, setPetTapCount] = useState(0);
  const [draftName, setDraftName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [selectedAccessoryId, setSelectedAccessoryId] = useState(FLYTIEE_ACCESSORIES[0].id);
  const [selectedSkinId, setSelectedSkinId] = useState(FLYTIEE_SKINS[1].id);
  const [selectedSetId, setSelectedSetId] = useState(FLYTIEE_SETS[0].id);
  const [shopCategory, setShopCategory] = useState<ShopCategory>('set');
  const [missionReward, setMissionReward] = useState<FlytieeRewardResult | null>(null);

  const isHungry = flytiee.satiety <= 35;
  const levelProgress = Math.min(100, Math.round(flytiee.profile.xp / flytiee.xpNeeded * 100));
  const readyMissions = flytiee.missions.filter((mission) => mission.current >= mission.target && !claimedToday(flytiee.profile.claimedMissionIds, mission.id)).length;
  const selectedAccessory = FLYTIEE_ACCESSORIES.find((item) => item.id === selectedAccessoryId) ?? FLYTIEE_ACCESSORIES[0];
  const selectedSkin = FLYTIEE_SKINS.find((item) => item.id === selectedSkinId) ?? FLYTIEE_SKINS[0];
  const selectedSet = FLYTIEE_SETS.find((item) => item.id === selectedSetId) ?? FLYTIEE_SETS[0];
  const previewProfile = useMemo(() => ({
    ...flytiee.profile,
    ...(shopCategory === 'set'
      ? { equippedSetId: selectedSet.id, equipped: {} }
      : shopCategory === 'skin'
        ? { equippedSetId: null, equippedSkinId: selectedSkin.id }
        : { equippedSetId: null, equipped: { ...flytiee.profile.equipped, [selectedAccessory.slot]: selectedAccessory.id } }),
  }), [flytiee.profile, selectedAccessory, selectedSet, selectedSkin, shopCategory]);

  useEffect(() => {
    setDraftName(flytiee.profile.name);
  }, [flytiee.profile.name]);

  useEffect(() => {
    if (mood === 'eat') return;
    if (isHungry) {
      setMood('hungry');
      setSpeech('Ục ục… tớ hơi đói rồi!');
    } else if (mood === 'hungry') {
      setMood('idle');
      setSpeech('Học cùng tớ nhé?');
    }
  }, [isHungry, mood]);

  useEffect(() => {
    if (mood === 'hungry' || mood === 'eat') return;
    if (mood !== 'idle') {
      const action = IDLE_ACTIONS.find((item) => item.mood === mood);
      const timer = window.setTimeout(() => {
        setMood('idle');
        setSpeech('Học cùng tớ nhé?');
      }, action?.duration ?? 3600);
      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(() => {
      const choices = IDLE_ACTIONS.filter((item) => item.mood !== 'idle');
      const action = choices[Math.floor(Math.random() * choices.length)];
      setMood(action.mood);
      setSpeech(action.line);
    }, 9_000 + Math.random() * 9_000);
    return () => window.clearTimeout(timer);
  }, [mood]);

  useEffect(() => {
    if (!flytiee.message) return;
    const timer = window.setTimeout(flytiee.clearMessage, 4500);
    return () => window.clearTimeout(timer);
  }, [flytiee.clearMessage, flytiee.message]);

  const handleFeed = () => {
    flytiee.feed();
    setMood('eat');
    setSpeech('Măm măm… ngon quá!');
    window.setTimeout(() => {
      setMood('idle');
      setSpeech('No bụng rồi! Cảm ơn bạn nhé.');
    }, 3300);
  };

  const handlePet = () => {
    if (isHungry) {
      setMood('hungry');
      setSpeech('Tớ đói rồi, cho tớ ăn trước nhé!');
      return;
    }
    const reactions = IDLE_ACTIONS.filter((action) => ['happy', 'sway', 'fly', 'look'].includes(action.mood));
    const reaction = reactions[petTapCount % reactions.length];
    setMood(reaction.mood);
    setSpeech(reaction.line);
    setPetTapCount((count) => count + 1);
  };

  const saveName = () => {
    if (flytiee.rename(draftName)) setEditingName(false);
  };

  const changeTab = (value: string) => {
    setTab(value);
    if (value === 'missions' || value === 'events') void flytiee.refreshMissions();
  };

  const claimMission = (mission: (typeof flytiee.missions)[number]) => {
    if (flytiee.claimMission(mission)) {
      setMissionReward({ kind: 'coins', title: mission.title, description: 'Nhiệm vụ hoàn thành — phần thưởng đã vào tài khoản.', amount: mission.coins, xp: mission.xp });
    }
  };

  if (!user) return null;

  if (flytiee.loading) {
    return (
      <div
        className={cn(
          'w-full animate-pulse rounded-xl border border-border bg-card/80',
          variant === 'hero' ? 'min-h-[120px] h-full' : 'h-[172px]',
        )}
        aria-label="Đang gọi FlyTiee"
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            'group grid w-full items-center overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            styles.widgetTeaser,
            variant === 'hero'
              ? 'h-full min-h-[120px] grid-cols-[92px_minmax(0,1fr)] p-3 sm:grid-cols-[108px_minmax(0,1fr)]'
              : 'min-h-[172px] grid-cols-[132px_minmax(0,1fr)] p-4 sm:grid-cols-[145px_minmax(0,1fr)]',
          )}
          aria-label={`Mở cửa sổ của ${flytiee.profile.name}`}
        >
          <span className={styles.widgetTeaserGlow} aria-hidden="true" />
          <div className={cn(
            'relative z-10 self-end',
            variant === 'hero' ? 'h-[92px] w-[92px] sm:h-[108px] sm:w-[108px]' : 'h-[138px] w-[138px] sm:h-[150px] sm:w-[150px]',
          )}>
            <FlytieeBird mood={mood} profile={flytiee.profile} />
          </div>
          <div className="relative z-10 min-w-0 pl-1">
            <span className={styles.widgetEyebrow}><Sparkles aria-hidden="true" className="h-3 w-3" /> Vương quốc FlyTiee</span>
            <div className="mb-1 flex items-center gap-2">
              <span className={cn('truncate font-bold text-foreground', variant === 'hero' ? 'text-base sm:text-lg' : 'text-lg')}>{flytiee.profile.name}</span>
              {isHungry && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning">Đang đói</span>}
            </div>
            <p className="line-clamp-2 text-sm text-muted-foreground">{speech}</p>
            <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold', variant === 'hero' ? 'mt-2' : 'mt-3')}>
              <span className="text-primary">Cấp {flytiee.profile.level}</span>
              <span className="flex items-center gap-1 text-warning"><FlytieeCoin className="h-4 w-4" />{flytiee.profile.coins} xu</span>
            </div>
            <span className={cn(styles.widgetCta, variant === 'hero' ? 'mt-2' : 'mt-3')}>
              Khám phá ngay <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </span>
          </div>
        </button>
      </DialogTrigger>

      <DialogContent className={cn('flex h-[calc(100dvh-1rem)] max-h-[900px] min-h-0 w-[calc(100%-1rem)] max-w-[1180px] flex-col gap-0 overflow-hidden p-0 sm:h-[calc(100dvh-2rem)] [&>button]:right-3 [&>button]:top-3 [&>button]:z-20 [&>button]:rounded-full [&>button]:bg-card/80 [&>button]:backdrop-blur', styles.world)}>
        <DialogHeader className={cn('shrink-0 px-5 py-5 sm:px-7 sm:py-6', styles.header)}>
          <div className="flex items-center gap-3 pr-10 sm:gap-4">
            <span className={styles.brandMark}><Sparkles aria-hidden="true" className="h-6 w-6" /></span>
            <div className="min-w-0 flex-1">
              <DialogDescription className={styles.headerKicker}>Vương quốc FlyTiee</DialogDescription>
              <DialogTitle className="flex flex-wrap items-center gap-2 text-xl sm:text-2xl">
                Hành trình cùng {flytiee.profile.name}
                {flytiee.saving && <RefreshCw aria-label="Đang lưu" className="h-4 w-4 animate-spin text-muted-foreground" />}
              </DialogTitle>
              <DialogDescription className="mt-1 hidden sm:block">Chăm sóc người bạn nhỏ, vượt thử thách và mở khóa những phần thưởng kỳ diệu.</DialogDescription>
            </div>
            <div className={styles.headerStats}>
              <span className={styles.headerLevel}><Trophy aria-hidden="true" className="h-4 w-4" />Cấp {flytiee.profile.level}</span>
              <span className={styles.headerBadge}><FlytieeCoin className="h-5 w-5" />{flytiee.profile.coins} xu</span>
            </div>
          </div>
        </DialogHeader>

        {missionReward && open && <FlytieeRewardOverlay reward={missionReward} profile={flytiee.profile} onClose={() => setMissionReward(null)} />}

        <Tabs value={tab} onValueChange={changeTab} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className={cn('shrink-0 px-4 py-3 sm:px-7 sm:py-4', styles.tabBar)}>
            <TabsList className={cn('grid h-auto w-full grid-cols-5', styles.tabList)}>
              <TabsTrigger value="home" className={styles.tabTrigger}><Utensils aria-hidden="true" className="h-4 w-4" />Chăm sóc</TabsTrigger>
              <TabsTrigger value="missions" className={styles.tabTrigger}><Gift aria-hidden="true" className="h-4 w-4" />Nhiệm vụ</TabsTrigger>
              <TabsTrigger value="adventure" className={styles.tabTrigger}><Compass aria-hidden="true" className="h-4 w-4" />Kỳ thú</TabsTrigger>
              <TabsTrigger value="events" className={styles.tabTrigger}><CalendarDays aria-hidden="true" className="h-4 w-4" />Sự kiện</TabsTrigger>
              <TabsTrigger value="shop" className={styles.tabTrigger}><Sparkles aria-hidden="true" className="h-4 w-4" />Cửa hàng</TabsTrigger>
            </TabsList>
          </div>

          <div className={styles.content}>
            {flytiee.message && <div role="status" aria-live="polite" className={cn('mb-4 px-4 py-3 text-sm font-semibold', styles.statusMessage)}>{flytiee.message}</div>}

            <TabsContent value="home" className="mt-0">
              <div className={styles.homeGrid}>
                <section className={styles.petStage}>
                  <div className={styles.stageStars} aria-hidden="true" />
                  <div className={styles.stagePortal} aria-hidden="true" />
                  <span className={styles.stageLabel}><Sparkles aria-hidden="true" className="h-3.5 w-3.5" />Sân khấu FlyTiee</span>
                  <div className={styles.speechBubble}>{speech}</div>
                  <button type="button" className={styles.petInteraction} onClick={handlePet} disabled={mood === 'eat'} aria-label={`Chạm ${flytiee.profile.name} để chơi cùng`}>
                    <FlytieeBird mood={mood} profile={flytiee.profile} className={styles.petVisual} />
                  </button>
                  <div className={styles.stageFooter}><span><Star aria-hidden="true" className="h-4 w-4" /> Chạm FlyTiee để chơi</span><span>Cấp {flytiee.profile.level}</span></div>
                </section>

                <section className={styles.sidePanel}>
                  <div className={cn('p-4 sm:p-5', styles.softCard, styles.profileCard)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-[.16em] text-primary">Người bạn của bạn</p>
                        {!editingName ? <h3 className="mt-1 truncate text-2xl font-extrabold">{flytiee.profile.name}</h3> : null}
                      </div>
                      <Button type="button" variant="ghost" size="icon" onClick={() => setEditingName((value) => !value)} aria-label="Đổi tên FlyTiee"><Edit3 aria-hidden="true" className="h-4 w-4" /></Button>
                    </div>
                    {!editingName && <p className="mt-2 text-sm text-muted-foreground">Luôn chờ bạn trở về sau mỗi buổi học.</p>}
                    {editingName && <div className="mt-3 space-y-2"><Label htmlFor="flytiee-name">Tên mới</Label><div className="flex gap-2"><Input id="flytiee-name" maxLength={20} value={draftName} onChange={(event) => setDraftName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && saveName()} /><Button type="button" onClick={saveName} className={styles.primaryButton}>Lưu</Button></div><p className="text-xs text-muted-foreground">Từ 2–20 ký tự.</p></div>}
                  </div>

                  <div className={cn('p-4 sm:p-5', styles.softCard, styles.levelCard)}>
                    <div className="flex items-center gap-3"><span className={styles.miniIcon}><Sparkles aria-hidden="true" className="h-5 w-5" /></span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><p className="text-sm font-bold">Cấp {flytiee.profile.level} · {levelTitle(flytiee.profile.level)}</p><span className="text-xs font-bold tabular-nums text-info">{levelProgress}%</span></div><p className="mt-1 text-xs text-muted-foreground">{flytiee.profile.xp}/{flytiee.xpNeeded} EXP tới cấp tiếp theo</p></div></div>
                    <Progress value={levelProgress} className={cn('mt-3', styles.levelProgress)} />
                  </div>

                  <div className={cn('p-4 sm:p-5', styles.softCard, styles.careCard)}>
                    <div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className={cn(styles.miniIcon, 'text-success')}><Utensils aria-hidden="true" className="h-5 w-5" /></span><div><p className="text-sm font-bold">Năng lượng yêu thương</p><p className="text-xs text-muted-foreground">Thức ăn luôn miễn phí.</p></div></div><span className={cn('text-sm font-extrabold tabular-nums', isHungry ? 'text-warning' : 'text-success')}>{flytiee.satiety}%</span></div>
                    <Progress value={flytiee.satiety} className={cn('mt-3', styles.careProgress)} />
                    <Button type="button" className={cn('mt-4 w-full', styles.primaryButton)} onClick={handleFeed} disabled={mood === 'eat'}><Utensils aria-hidden="true" className="h-4 w-4" />{mood === 'eat' ? 'Đang ăn…' : 'Cho FlyTiee ăn'}</Button>
                  </div>

                  <div className={styles.journeyCard}>
                    <span className={styles.journeyKicker}><Compass aria-hidden="true" className="h-4 w-4" /> Cánh cổng phiêu lưu</span>
                    <h3>Hành trình tiếp theo đang chờ bạn</h3>
                    <p>Chọn một thử thách, kiếm phần thưởng và cùng FlyTiee lớn lên.</p>
                    <div className={styles.journeyActions}>
                      <Button type="button" className={styles.journeyPrimary} onClick={() => changeTab('adventure')}>Vào Kỳ thú <ArrowRight aria-hidden="true" className="h-4 w-4" /></Button>
                      <Button type="button" className={styles.journeySecondary} onClick={() => changeTab('missions')}>Nhiệm vụ {readyMissions > 0 && <span className={styles.journeyCount}>{readyMissions}</span>}</Button>
                    </div>
                  </div>
                </section>
              </div>
            </TabsContent>

            <TabsContent value="missions" className="mt-0">
              <div className={cn('flex flex-wrap items-center justify-between gap-3', styles.missionHeader)}><div><p className="text-xs font-bold uppercase tracking-[.16em] text-primary">Daily quests</p><h3 className="mt-1 text-xl font-extrabold">Nhiệm vụ hôm nay</h3><p className="mt-1 text-sm text-muted-foreground">Mỗi bước tiến trên FlyDo đều biến thành quà cho FlyTiee.</p></div><Button type="button" variant="outline" size="sm" className={styles.secondaryButton} onClick={() => void flytiee.refreshMissions()}><RefreshCw aria-hidden="true" className="h-4 w-4" />Cập nhật</Button></div>
              <div className="grid gap-4 sm:grid-cols-2">
                {flytiee.missions.map((mission) => {
                  const complete = mission.current >= mission.target;
                  const claimed = claimedToday(flytiee.profile.claimedMissionIds, mission.id);
                  return <article key={mission.id} className={cn('flex min-h-[210px] flex-col p-5', styles.missionCard, complete && !claimed && styles.missionReady)}>
                    <div className="relative z-10 flex items-start justify-between gap-3"><span className={styles.miniIcon}><Gift aria-hidden="true" className="h-5 w-5" /></span><span className={styles.rewardPill}>+{mission.xp} EXP <span aria-hidden="true">·</span> <FlytieeCoin className="h-4 w-4" />+{mission.coins} xu</span></div>
                    <span className={styles.missionState}>{claimed ? 'Đã hoàn thành' : complete ? 'Sẵn sàng nhận quà' : 'Đang phiêu lưu'}</span>
                    <h4 className="relative z-10 mt-4 text-base font-extrabold">{mission.title}</h4><p className="relative z-10 mt-1 text-sm leading-6 text-muted-foreground">{mission.description}</p>
                    <div className="relative z-10 mt-auto pt-4"><div className="mb-2 flex justify-between text-xs font-bold"><span>{mission.current}/{mission.target}</span><span className="text-primary">{Math.round(mission.current / mission.target * 100)}%</span></div><Progress value={mission.current / mission.target * 100} /><Button type="button" className={cn('mt-4 w-full', complete && !claimed ? styles.primaryButton : styles.secondaryButton)} variant={claimed ? 'secondary' : complete ? 'default' : 'outline'} disabled={!complete || claimed} onClick={() => claimMission(mission)}>{claimed ? <><Check aria-hidden="true" className="h-4 w-4" />Đã nhận</> : complete ? 'Nhận thưởng ngay' : 'Đang tiến hành'}</Button></div>
                  </article>;
                })}
              </div>
            </TabsContent>

            <TabsContent value="events" className="mt-0">
              <FlytieeEvents flytiee={flytiee} />
            </TabsContent>

            <TabsContent value="adventure" className="mt-0">
              <FlytieeAdventure flytiee={flytiee} />
            </TabsContent>

            <TabsContent value="shop" className="mt-0">
              <div className="grid items-start gap-6 lg:grid-cols-[minmax(260px,.75fr)_minmax(0,1.25fr)]">
                <section className={cn('p-4 lg:sticky lg:top-0', styles.shopPreview)}>
                  <p className="relative z-10 text-center text-sm font-bold text-info">Phòng thử đồ</p>
                  <p className="relative z-10 mt-1 text-center text-lg font-extrabold">{shopCategory === 'set' ? selectedSet.name : shopCategory === 'skin' ? selectedSkin.name : selectedAccessory.name}</p>
                  <FlytieeBird mood="idle" profile={previewProfile} className="relative z-10 mx-auto h-[300px] max-w-sm" />
                  <div className="relative z-10 rounded-2xl border border-white/10 bg-card/80 p-3 text-center shadow-soft backdrop-blur">
                    <p className="text-sm font-bold">Xem thử trên {flytiee.profile.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{shopCategory === 'set' ? 'Full combo toàn thân · Không đi cùng phụ kiện riêng.' : shopCategory === 'skin' ? `${selectedSkin.personality} · Mỗi skin có nét mặt riêng.` : 'Chọn món không làm mất xu.'}</p>
                  </div>
                </section>

                <section className="min-w-0">
                  <div className={cn('flex flex-wrap items-center justify-between gap-3', styles.shopHeader)}>
                    <div><p className="text-xs font-bold uppercase tracking-[.16em] text-primary">Boutique & wardrobe</p><h3 className="mt-1 text-xl font-extrabold">Tủ đồ FlyTiee</h3><p className="mt-1 text-sm text-muted-foreground">Phối một diện mạo thật riêng hoặc săn Set sự kiện giới hạn.</p></div>
                    <span className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-warning-soft px-4 text-sm font-bold text-warning"><FlytieeCoin className="h-5 w-5" />{flytiee.profile.coins} xu</span>
                  </div>
                  <div className={cn('mb-4 flex gap-2 overflow-x-auto pb-2', styles.categoryRail)} aria-label="Danh mục cửa hàng">
                    <Button type="button" size="sm" className={shopCategory === 'set' ? styles.primaryButton : styles.secondaryButton} variant={shopCategory === 'set' ? 'default' : 'outline'} onClick={() => setShopCategory('set')}><Sparkles aria-hidden="true" className="h-4 w-4" />Set sự kiện</Button>
                    <Button type="button" size="sm" className={shopCategory === 'skin' ? styles.primaryButton : styles.secondaryButton} variant={shopCategory === 'skin' ? 'default' : 'outline'} onClick={() => setShopCategory('skin')}>Skin</Button>
                    {(Object.keys(ACCESSORY_SLOT_LABELS) as FlytieeAccessorySlot[]).map((slot) => <Button key={slot} type="button" size="sm" className={shopCategory === slot ? styles.primaryButton : styles.secondaryButton} variant={shopCategory === slot ? 'default' : 'outline'} onClick={() => { setShopCategory(slot); const first = FLYTIEE_ACCESSORIES.find((item) => item.slot === slot); if (first) setSelectedAccessoryId(first.id); }}>{ACCESSORY_SLOT_LABELS[slot]}</Button>)}
                  </div>

                  {shopCategory === 'set' ? <>
                    <div className="mb-4 rounded-xl border border-special/25 bg-special-soft px-4 py-3 text-sm text-special"><span className="font-semibold">Set toàn thân:</span> khi mặc, FlyTiee sẽ tự tháo mọi phụ kiện riêng. Các Set chỉ nhận được qua sự kiện, không bán bằng xu.</div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {FLYTIEE_SETS.map((item) => {
                        const owned = flytiee.profile.ownedSetIds.includes(item.id);
                        const equipped = flytiee.profile.equippedSetId === item.id;
                        const selected = selectedSetId === item.id;
                        return <button key={item.id} type="button" aria-pressed={selected} onClick={() => setSelectedSetId(item.id)} className={cn('min-h-[280px] overflow-hidden border p-3 text-left', styles.itemCard, selected ? 'border-primary bg-primary-soft' : 'border-border bg-card hover:border-primary/50', item.exclusiveMilestone && styles.phoenixCard, item.id === 'azure-tide-dragon' && styles.seaCard)}>
                          <span className={cn('relative flex h-40 w-full items-center justify-center overflow-hidden rounded-lg', item.exclusiveMilestone ? styles.phoenixPreview : item.id === 'azure-tide-dragon' ? styles.seaPreview : ACCESSORY_TONES[item.tone])}><FlytieeBird mood="idle" profile={{ ...flytiee.profile, equippedSetId: item.id, equipped: {} }} className="h-48 w-full" /><span className={cn('absolute right-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold shadow-soft', item.exclusiveMilestone ? styles.phoenixBadge : item.id === 'azure-tide-dragon' ? styles.seaBadge : 'bg-card/90 text-special')}><Ticket aria-hidden="true" className="h-3.5 w-3.5" />{item.exclusiveMilestone ? `${item.exclusiveMilestone} ngày` : item.id === 'azure-tide-dragon' ? 'Long Cung' : 'Sự kiện'}</span></span>
                          <strong className="mt-3 block text-sm">{item.name}</strong>
                          <span className="mt-1 block text-xs font-semibold text-special">{item.eventName}</span>
                          <span className="mt-1.5 block text-xs text-muted-foreground">{item.description}</span>
                          <span className="mt-2 block text-xs font-bold text-primary">{equipped ? 'Đang mặc trọn bộ' : owned ? 'Đã sở hữu' : 'Chưa mở khóa'}</span>
                        </button>;
                      })}
                    </div>
                    <div className={cn('mt-4 p-4', styles.actionDock)}>
                      <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><p className="font-bold">{selectedSet.name}</p><p className="text-sm text-muted-foreground">{flytiee.profile.ownedSetIds.includes(selectedSet.id) ? 'Set đã có trong tủ đồ sự kiện.' : selectedSet.eventName}</p></div><Button type="button" className={styles.primaryButton} onClick={() => flytiee.equipSet(selectedSet.id)} disabled={!flytiee.profile.ownedSetIds.includes(selectedSet.id)}>{flytiee.profile.equippedSetId === selectedSet.id ? 'Tháo Set' : flytiee.profile.ownedSetIds.includes(selectedSet.id) ? 'Mặc trọn bộ' : <><Ticket aria-hidden="true" className="h-4 w-4" />Nhận từ sự kiện</>}</Button></div>
                    </div>
                  </> : shopCategory === 'skin' ? <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {FLYTIEE_SKINS.map((skin) => {
                        const owned = flytiee.profile.ownedSkinIds.includes(skin.id);
                        const equipped = flytiee.profile.equippedSkinId === skin.id;
                        const selected = selectedSkinId === skin.id;
                        return <button key={skin.id} type="button" aria-pressed={selected} onClick={() => setSelectedSkinId(skin.id)} className={cn('min-h-[250px] overflow-hidden border p-3 text-left', styles.itemCard, selected ? 'border-primary bg-primary-soft' : 'border-border bg-card hover:border-primary/50')}>
                          <span className="flex h-36 w-full items-center justify-center overflow-hidden rounded-lg bg-hero"><FlytieeBird mood="idle" profile={{ ...flytiee.profile, equippedSkinId: skin.id, equipped: {} }} className="h-44 w-full" /></span>
                          <span className="mt-3 flex items-start justify-between gap-2"><span><strong className="block text-sm">{skin.name}</strong><span className="mt-0.5 block text-xs font-semibold text-primary">{skin.personality}</span></span><span className="h-5 w-5 shrink-0 rounded-full border-2 border-background shadow-sm" style={{ background: skin.palette.bodyMid }} aria-hidden="true" /></span>
                          <span className="mt-1.5 block text-xs text-muted-foreground">{skin.description}</span>
                          <span className="mt-2 block text-xs font-bold text-primary">{equipped ? 'Đang sử dụng' : owned ? 'Đã sở hữu' : skin.price === 0 ? 'Miễn phí' : `${skin.price} xu`}</span>
                        </button>;
                      })}
                    </div>
                    <div className={cn('mt-4 p-4', styles.actionDock)}>
                      <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><p className="font-bold">{selectedSkin.name}</p><p className="text-sm text-muted-foreground">{flytiee.profile.ownedSkinIds.includes(selectedSkin.id) ? `${selectedSkin.personality} · Đã có trong tủ đồ.` : `${selectedSkin.price} xu`}</p></div><Button type="button" className={styles.primaryButton} onClick={() => flytiee.buyOrEquipSkin(selectedSkin.id)} disabled={flytiee.profile.equippedSkinId === selectedSkin.id || (!flytiee.profile.ownedSkinIds.includes(selectedSkin.id) && flytiee.profile.coins < selectedSkin.price)}>{flytiee.profile.equippedSkinId === selectedSkin.id ? 'Đang sử dụng' : flytiee.profile.ownedSkinIds.includes(selectedSkin.id) ? 'Dùng skin' : 'Mua & sử dụng'}</Button></div>
                    </div>
                  </> : <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {FLYTIEE_ACCESSORIES.filter((item) => item.slot === shopCategory).map((item) => {
                        const owned = flytiee.profile.ownedAccessoryIds.includes(item.id);
                        const equipped = flytiee.profile.equipped[item.slot] === item.id;
                        const selected = selectedAccessoryId === item.id;
                        return <button key={item.id} type="button" aria-pressed={selected} onClick={() => setSelectedAccessoryId(item.id)} className={cn('min-h-[150px] border p-4 text-left', styles.itemCard, selected ? 'border-primary bg-primary-soft' : 'border-border bg-card hover:border-primary/50')}>
                          <span className={cn('flex w-full items-center justify-center rounded-lg p-3', ACCESSORY_TONES[item.tone])}><FlytieeAccessoryPreview item={item} /></span>
                          <strong className="mt-3 block text-sm">{item.name}</strong><span className="mt-1 block text-xs text-muted-foreground">{item.description}</span><span className="mt-2 block text-xs font-bold text-primary">{equipped ? 'Đang mặc' : owned ? 'Đã sở hữu' : `${item.price} xu`}</span>
                        </button>;
                      })}
                    </div>
                    <div className={cn('mt-4 p-4', styles.actionDock)}><div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><p className="font-bold">{selectedAccessory.name}</p><p className="text-sm text-muted-foreground">{flytiee.profile.equippedSetId ? 'Đang mặc Set toàn thân nên không thể phối phụ kiện.' : flytiee.profile.ownedAccessoryIds.includes(selectedAccessory.id) ? 'Món này đã có trong tủ đồ.' : `${selectedAccessory.price} xu`}</p></div><Button type="button" className={styles.primaryButton} onClick={() => flytiee.buyOrEquip(selectedAccessory.id)} disabled={Boolean(flytiee.profile.equippedSetId) || (!flytiee.profile.ownedAccessoryIds.includes(selectedAccessory.id) && flytiee.profile.coins < selectedAccessory.price)}>{flytiee.profile.equippedSetId ? 'Tháo Set để phối' : flytiee.profile.equipped[selectedAccessory.slot] === selectedAccessory.id ? 'Tháo ra' : flytiee.profile.ownedAccessoryIds.includes(selectedAccessory.id) ? 'Mặc ngay' : 'Mua & mặc'}</Button></div></div>
                  </>}
                </section>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
