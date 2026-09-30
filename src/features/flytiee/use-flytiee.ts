'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { useStreak } from '@/features/streak/hooks/use-streak';
import { localStudyDate, studyDayBounds, useOnlineStudyStore } from '@/features/daily-goal/stores/online-study-store';
import { fetchAllPages } from '@/features/practice/data/fetch-all-pages';
import { DEFAULT_FLYTIEE_PROFILE, normalizeFlytieeProfile, xpNeededForLevel } from './config';
import type {
  FlytieeChestTier, FlytieeDailyEventState, FlytieeEventStats, FlytieeMission,
  FlytieeProfile, FlytieeRewardResult,
} from './types';

const SATIETY_LOSS_PER_HOUR = 4;

type RemoteState = { profile?: unknown };
type ActionResponse = { ok?: boolean; state?: RemoteState; reward?: FlytieeRewardResult | null };

function todayKey() {
  return localStudyDate();
}

function createDefaultProfile(): FlytieeProfile {
  return {
    ...DEFAULT_FLYTIEE_PROFILE,
    satietyUpdatedAt: new Date().toISOString(),
    equipped: {},
    chests: { ...DEFAULT_FLYTIEE_PROFILE.chests },
    dailyEvent: { ...DEFAULT_FLYTIEE_PROFILE.dailyEvent, date: todayKey(), studyClaimedMilestones: [] },
  };
}

function dailyEventForToday(profile: FlytieeProfile, now: number): FlytieeDailyEventState {
  const date = localStudyDate(new Date(now));
  if (profile.dailyEvent.date === date) return profile.dailyEvent;
  return { date, streakClaimed: false, studyClaimedMilestones: [],
    practiceCoinsClaimed: 0, completionChestClaimed: false };
}

function calculateSatiety(profile: FlytieeProfile, now = Date.now()) {
  const elapsedHours = Math.max(0, now - Date.parse(profile.satietyUpdatedAt)) / 3_600_000;
  return Math.max(0, Math.round(profile.satiety - elapsedHours * SATIETY_LOSS_PER_HOUR));
}

function connectionMessage(error: { code?: string; message?: string } | null) {
  if (error?.code === 'PGRST202' || error?.code === '42883') {
    return 'FlyTiee đang được cập nhật. Vui lòng thử lại sau.';
  }
  return error?.message || 'Không thể kết nối FlyTiee. Vui lòng thử lại.';
}

export function useFlytiee() {
  const userId = useAuthStore((state) => state.user?.id);
  const { currentStreak } = useStreak();
  const [profile, setProfile] = useState<FlytieeProfile>(createDefaultProfile);
  const [missions, setMissions] = useState<FlytieeMission[]>([]);
  const [eventStats, setEventStats] = useState<FlytieeEventStats>({
    streak: 0, studyMinutes: 0, correctByLevel: { 1: 0, 2: 0, 3: 0, 4: 0 }, practiceCoinsEarned: 0,
  });
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [clock, setClock] = useState(() => Date.now());
  const inFlight = useRef(false);
  const missionRequest = useRef(0);
  const profileRequest = useRef(0);
  const online = useOnlineStudyStore();
  const studyDay = online.userId === userId && online.date ? online.date : localStudyDate(new Date(clock));
  const studyMinutes = online.userId === userId && online.date === todayKey()
    ? Math.floor(online.seconds / 60) : 0;
  const currentEventStats = useMemo(() => ({ ...eventStats, studyMinutes }), [eventStats, studyMinutes]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const applyState = useCallback((state: RemoteState | undefined) => {
    if (!state?.profile) return false;
    setProfile(normalizeFlytieeProfile(state.profile));
    return true;
  }, []);

  const reloadProfile = useCallback(async () => {
    if (!userId) return false;
    const request = ++profileRequest.current;
    try {
      const { data, error } = await getSupabaseClient().rpc('flytiee_get_state');
      if (request !== profileRequest.current || useAuthStore.getState().user?.id !== userId) return false;
      if (error) {
        setMessage(connectionMessage(error));
        return false;
      }
      const loaded = applyState(data as RemoteState);
      if (loaded) setAvailable(true);
      return loaded;
    } catch {
      if (useAuthStore.getState().user?.id === userId) setMessage('Không thể kết nối FlyTiee. Vui lòng thử lại.');
      return false;
    }
  }, [applyState, userId]);

  useEffect(() => {
    profileRequest.current += 1; missionRequest.current += 1;
    setProfile(createDefaultProfile()); setMissions([]); setMessage(''); setAvailable(false);
    setEventStats({ streak: 0, studyMinutes: 0, correctByLevel: { 1: 0, 2: 0, 3: 0, 4: 0 }, practiceCoinsEarned: 0 });
    if (!userId) { setLoading(false); return; }
    let alive = true;
    const request = profileRequest.current;
    setLoading(true);
    setAvailable(false);
    getSupabaseClient().rpc('flytiee_get_state')
      .then(({ data, error }: {
        data: RemoteState | null; error: { code?: string; message?: string } | null;
      }) => {
        if (!alive || request !== profileRequest.current || useAuthStore.getState().user?.id !== userId) return;
        if (error) setMessage(connectionMessage(error));
        else setAvailable(applyState(data as RemoteState));
      })
      .catch(() => { if (alive) setMessage('Không thể kết nối FlyTiee. Vui lòng thử lại.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [applyState, userId]);

  useEffect(() => {
    if (!userId) return;
    const refresh = () => { if (document.visibilityState === 'visible') void reloadProfile(); };
    window.addEventListener('flytiee:streak-reward', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('flytiee:streak-reward', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [reloadProfile, userId]);

  const runAction = useCallback(async (action: string, payload: Record<string, unknown> = {}) => {
    if (!userId || !available || inFlight.current) return null;
    inFlight.current = true;
    setSaving(true);
    try {
      const { data, error } = await getSupabaseClient().rpc('flytiee_action', {
        p_action: action, p_payload: payload,
      });
      if (useAuthStore.getState().user?.id !== userId) return null;
      profileRequest.current += 1;
      if (error || !data?.ok) {
        setMessage(connectionMessage(error));
        return null;
      }
      const result = data as ActionResponse;
      applyState(result.state);
      if (result.reward?.description) setMessage(result.reward.description);
      return result;
    } catch {
      if (useAuthStore.getState().user?.id === userId) setMessage('Mất kết nối với FlyTiee. Phần thưởng chưa được nhận; hãy thử lại.');
      return null;
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }, [applyState, available, userId]);

  const refreshMissions = useCallback(async () => {
    if (!userId) return;
    const request = ++missionRequest.current;
    try {
    const supabase = getSupabaseClient();
    const { start, end } = studyDayBounds(studyDay);
    const [practiceRows, mockResult] = await Promise.all([
      fetchAllPages<{ is_correct: boolean; difficulty_level?: number }>(async (from, to) =>
        supabase.from('practice_progress').select('question_id, is_correct, difficulty_level')
          .eq('user_id', userId).gte('answered_at', start).lt('answered_at', end).order('question_id').range(from, to)),
      supabase.from('mock_exam_attempts').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).gte('created_at', start).lt('created_at', end),
    ]);
    if (mockResult.error) throw mockResult.error;
    if (request !== missionRequest.current || useAuthStore.getState().user?.id !== userId) return;
    const answered = practiceRows.length;
    const correct = practiceRows.filter((row: { is_correct: boolean }) => row.is_correct).length;
    const accuracy = answered > 0 ? Math.floor(correct / answered * 100) : 0;
    const mockAttempts = mockResult.count ?? 0;
    const correctByLevel: FlytieeEventStats['correctByLevel'] = { 1: 0, 2: 0, 3: 0, 4: 0 };
    practiceRows.forEach((row: { is_correct: boolean; difficulty_level?: number }) => {
      if (!row.is_correct) return;
      const level = Math.max(1, Math.min(4, Math.floor(Number(row.difficulty_level) || 1))) as 1 | 2 | 3 | 4;
      correctByLevel[level] += 1;
    });
    const practiceCoinsEarned = Math.min(100, Object.entries(correctByLevel)
      .reduce((sum: number, [level, count]) => sum + Number(level) * count, 0));
    setEventStats({ streak: currentStreak, studyMinutes: 0, correctByLevel, practiceCoinsEarned });
    setMissions([
      { id: 'practice-5', title: 'Khởi động trí não', description: 'Hoàn thành 5 câu tự luyện hôm nay', current: Math.min(answered, 5), target: 5, xp: 20, coins: 20 },
      { id: 'practice-15', title: 'Chăm chỉ mỗi ngày', description: 'Hoàn thành 15 câu tự luyện hôm nay', current: Math.min(answered, 15), target: 15, xp: 35, coins: 35 },
      { id: 'accuracy-80', title: 'Đôi cánh chính xác', description: 'Đạt ít nhất 80% sau 10 câu hôm nay', current: answered >= 10 ? Math.min(accuracy, 80) : 0, target: 80, xp: 30, coins: 30 },
      { id: 'mock-exam-1', title: 'Dũng cảm thử sức', description: 'Hoàn thành 1 bài thi thử hôm nay', current: Math.min(mockAttempts, 1), target: 1, xp: 45, coins: 45 },
    ]);
    } catch { if (request === missionRequest.current && useAuthStore.getState().user?.id === userId) setMessage('Chưa thể cập nhật nhiệm vụ. Hãy kiểm tra kết nối và thử lại.'); }
  }, [currentStreak, studyDay, userId]);

  useEffect(() => {
    void refreshMissions();
    const refresh = () => { void refreshMissions(); };
    window.addEventListener('flydo:practice-progress-updated', refresh);
    return () => { missionRequest.current += 1; window.removeEventListener('flydo:practice-progress-updated', refresh); };
  }, [refreshMissions]);

  const satiety = useMemo(() => calculateSatiety(profile, clock), [clock, profile]);
  const dailyEvent = useMemo(() => dailyEventForToday(profile, clock), [profile, clock]);

  const rename = useCallback(async (name: string) => {
    const cleaned = name.trim().replace(/\s+/g, ' ').slice(0, 20);
    if (cleaned.length < 2) return false;
    const result = await runAction('rename', { name: cleaned });
    if (result) setMessage(`Từ giờ mình tên là ${cleaned}!`);
    return Boolean(result);
  }, [runAction]);
  const feed = useCallback(async () => {
    const result = await runAction('feed');
    if (result) setMessage('Măm măm… no bụng rồi!');
    return Boolean(result);
  }, [runAction]);
  const claimMission = useCallback(async (mission: FlytieeMission) => {
    const result = await runAction('mission', { id: mission.id });
    return Boolean(result);
  }, [runAction]);
  const claimStreakReward = useCallback(async (): Promise<FlytieeRewardResult | null> =>
    (await runAction('streak'))?.reward ?? null, [runAction]);
  const claimStudyReward = useCallback(async (minutes: number): Promise<FlytieeRewardResult | null> =>
    (await runAction('study', { minutes }))?.reward ?? null, [runAction]);
  const claimPracticeCoins = useCallback(async (): Promise<FlytieeRewardResult | null> =>
    (await runAction('practice'))?.reward ?? null, [runAction]);
  const claimDailyCompletionChest = useCallback(async (): Promise<FlytieeRewardResult | null> =>
    (await runAction('daily_completion'))?.reward ?? null, [runAction]);
  const openChest = useCallback(async (tier: FlytieeChestTier): Promise<FlytieeRewardResult | null> =>
    (await runAction('open_chest', { tier }))?.reward ?? null, [runAction]);

  const redeemBirdieMail = useCallback(async (rawCode: string): Promise<FlytieeRewardResult | null> => {
    if (!userId) return null;
    const code = rawCode.trim().toUpperCase().replace(/\s+/g, '-');
    if (!code) return null;
    try {
      const { data, error } = await getSupabaseClient().rpc('redeem_flytiee_gift_code', { p_code: code });
      if (useAuthStore.getState().user?.id !== userId) return null;
      if (error || !data?.ok) {
        setMessage(connectionMessage(error ?? { message: 'Mã quà không hợp lệ hoặc đã hết hạn.' }));
        return null;
      }
      await reloadProfile();
      const reward = data as FlytieeRewardResult & { chestTier?: FlytieeChestTier };
      return { kind: reward.kind, title: reward.title, description: reward.description,
        ...(reward.amount != null ? { amount: reward.amount } : {}),
        ...(reward.chestTier ? { chestTier: reward.chestTier } : {}),
        ...(reward.itemId ? { itemId: reward.itemId } : {}) };
    } catch {
      setMessage('Không thể nhận mã quà lúc này. Hãy kiểm tra kết nối và thử lại.');
      return null;
    }
  }, [reloadProfile, userId]);

  const buyOrEquip = useCallback(async (accessoryId: string) => {
    const result = await runAction('accessory', { id: accessoryId });
    if (result) setMessage('Phụ kiện của FlyTiee đã được cập nhật.');
    return Boolean(result);
  }, [runAction]);
  const equipSet = useCallback(async (setId: string) => {
    const result = await runAction('set', { id: setId });
    if (result) setMessage('Trang phục FlyTiee đã được cập nhật.');
    return Boolean(result);
  }, [runAction]);
  const buyOrEquipSkin = useCallback(async (skinId: string) => {
    const result = await runAction('skin', { id: skinId });
    if (result) setMessage('Skin FlyTiee đã được cập nhật.');
    return Boolean(result);
  }, [runAction]);
  const clearMessage = useCallback(() => setMessage(''), []);

  return {
    profile, satiety, xpNeeded: xpNeededForLevel(profile.level), missions,
    eventStats: currentEventStats, dailyEvent, loading, available, saving, message,
    feed, rename, claimMission, claimStreakReward, claimStudyReward,
    claimPracticeCoins, claimDailyCompletionChest, openChest, redeemBirdieMail,
    buyOrEquip, equipSet, buyOrEquipSkin, refreshMissions, clearMessage, reloadProfile,
  };
}
