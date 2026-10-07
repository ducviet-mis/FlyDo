"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getSessionIdFromAccessToken, SESSION_REPLACED_QUERY, DEVICE_LIMIT_QUERY, DEVICE_SETUP_QUERY } from "@/lib/auth/single-session";
import { getBrowserDeviceInfo, getBrowserDeviceKey } from "@/lib/auth/device-identity";
import { clearDeviceLinkIntent, deviceLinkError, getDeviceLinkIntent, setDeviceLinkIntent } from "@/lib/auth/device-link";
import { rememberAccount } from "../lib/remembered-accounts";
import type { User } from "../types";

export type RegisterResult = {
  success: boolean;
  requiresEmailConfirmation: boolean;
  email?: string;
};

function getEmailRedirectUrl() {
  return typeof window === 'undefined' ? undefined : `${window.location.origin}/home`;
}

function getOAuthRedirectUrl() {
  return typeof window === 'undefined'
    ? undefined
    : `${window.location.origin}/auth/callback?next=/home`;
}

export function translateAuthError(message?: string): string {
  const normalized = message?.toLowerCase() || '';

  if (normalized.includes('email not confirmed')) return 'Email chưa được xác thực. Vui lòng kiểm tra hộp thư và bấm vào liên kết xác nhận.';
  if (normalized.includes('invalid login credentials')) return 'Email hoặc mật khẩu không đúng.';
  if (normalized.includes('already registered') || normalized.includes('already been registered')) return 'Email này đã được đăng ký.';
  if (normalized.includes('email rate limit exceeded') || normalized.includes('too many requests')) return 'Bạn đã gửi yêu cầu quá nhiều lần. Vui lòng thử lại sau ít phút.';
  if (normalized.includes('signup is disabled') || normalized.includes('signups not allowed')) return 'Hệ thống hiện chưa mở đăng ký tài khoản mới.';
  if (normalized.includes('password should be at least') || normalized.includes('password')) return 'Mật khẩu chưa đáp ứng yêu cầu bảo mật. Vui lòng dùng ít nhất 6 ký tự.';
  if (normalized.includes('email') && (normalized.includes('invalid') || normalized.includes('format'))) return 'Địa chỉ email không hợp lệ.';
  if (normalized.includes('expired') || normalized.includes('invalid token') || normalized.includes('invalid link')) return 'Liên kết xác thực không hợp lệ hoặc đã hết hạn. Vui lòng gửi lại email xác nhận.';

  return 'Đã xảy ra lỗi xác thực. Vui lòng thử lại.';
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  initialized: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  loginWithGoogle: () => Promise<boolean>;
  register: (name: string, email: string, password: string) => Promise<RegisterResult>;
  resendConfirmationEmail: (email: string) => Promise<{ success: boolean; message: string }>;
  logout: () => Promise<void>;
  logoutAllDevices: () => Promise<void>;
  refreshUser: () => Promise<void>;
  checkActiveSession: () => Promise<boolean>;
  initAuth: () => Promise<void>;
  clearError: () => void;
}

function mapProfile(profile: any, authUser: { id: string; email?: string }): User {
  const accountTier = ['flygo', 'flymax', 'flyinfinity'].includes(profile.account_tier)
    ? profile.account_tier
    : 'flygo';

  return {
    id: authUser.id,
    name: profile.name,
    // Identity/admin gating must not use editable profile data.
    email: authUser.email || '',
    phone: profile.phone || '',
    birthDate: profile.birth_date || '',
    avatarUrl: profile.avatar_url || '',
    accountTier,
    subscriptionStartedAt: profile.subscription_started_at || undefined,
    subscriptionExpiresAt: profile.subscription_expires_at || undefined,
    referralCode: profile.referral_code || undefined,
    referralRewardDays: Number(profile.referral_reward_days || 0),
    referralDiscountPercent: Number(profile.referral_discount_percent || 0),
    referralEligibleUntil: profile.referral_eligible_until || undefined,
    referralRedeemedAt: profile.referral_redeemed_at || undefined,
    createdAt: profile.created_at,
  };
}

type DeviceRegistrationStatus = "active" | "legacy" | "limit" | "removed" | "unavailable"
  | `link_${'invalid' | 'expired' | 'removed' | 'type' | 'used' | 'capacity' | 'unavailable'}`;
type SetAuthState = (state: Partial<AuthState>) => void;
const deviceLinkUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let forcedLogoutInProgress = false;
let authInitialization: Promise<void> | null = null;
let authInitializationGeneration: number | null = null;
let authListenerInstalled = false;
let authGeneration = 0;
let authIdentity: string | null = null;
type ExplicitAuthAttempt = { generation: number; email: string; accountId?: string; sessionId?: string | null };
let explicitAuthAttempt: ExplicitAuthAttempt | null = null;
const deviceRegistrations = new Map<string, Promise<DeviceRegistrationStatus>>();
let successfulRegistration: { key: string; status: DeviceRegistrationStatus } | null = null;

function observeIdentity(accountId: string) {
  if (authIdentity && authIdentity !== accountId) {
    authGeneration += 1;
    clearDeviceLinkIntent();
  }
  authIdentity = accountId;
}

async function isCurrentAuthSession(accessToken: string | null | undefined, accountId: string, generation: number): Promise<boolean> {
  if (generation !== authGeneration) return false;
  try {
    const { data: { session }, error } = await getSupabaseClient().auth.getSession();
    const sessionId = getSessionIdFromAccessToken(accessToken);
    return !error && generation === authGeneration && session?.user.id === accountId
      && (sessionId ? getSessionIdFromAccessToken(session.access_token) === sessionId : session.access_token === accessToken);
  } catch { return false; }
}

async function registerCurrentDevice(accessToken: string | null | undefined, replaceLegacy = false, accountId?: string, generation = authGeneration): Promise<DeviceRegistrationStatus> {
  const key = `${generation}:${accountId}:${getSessionIdFromAccessToken(accessToken)}`;
  if (!getDeviceLinkIntent() && successfulRegistration?.key === key) return successfulRegistration.status;
  const pending = deviceRegistrations.get(key);
  if (pending) return pending;
  const registration = performDeviceRegistration(accessToken, replaceLegacy, accountId, generation);
  deviceRegistrations.set(key, registration);
  try {
    const status = await registration;
    if (generation === authGeneration && (status === 'active' || status === 'legacy')) successfulRegistration = { key, status };
    return status;
  } finally { if (deviceRegistrations.get(key) === registration) deviceRegistrations.delete(key); }
}

async function performDeviceRegistration(accessToken: string | null | undefined, replaceLegacy: boolean, accountId: string | undefined, generation: number): Promise<DeviceRegistrationStatus> {
  const intent = getDeviceLinkIntent();
  const sessionId = getSessionIdFromAccessToken(accessToken);
  const deviceKey = getBrowserDeviceKey();
  if (generation !== authGeneration) return intent ? 'link_unavailable' : 'unavailable';
  if (!sessionId || !deviceKey) return intent ? 'link_unavailable' : 'unavailable';
  const device = getBrowserDeviceInfo();

  if (intent) {
    if (!accountId || (intent.accountId && intent.accountId !== accountId)) {
      clearDeviceLinkIntent(intent);
      return 'link_invalid';
    }
    if (!deviceLinkUuidPattern.test(intent.code)) return 'link_invalid';
    if (!setDeviceLinkIntent(intent.code, accountId, intent.email)) return 'link_unavailable';
    const bound = getDeviceLinkIntent()!;
    try {
      const { data, error } = await getSupabaseClient().rpc('redeem_account_device_link', {
        p_link_code: intent.code,
        p_device_key: deviceKey,
        p_device_type: device.type,
        p_device_name: device.name,
        p_session_id: sessionId,
      });
      if (!await isCurrentAuthSession(accessToken, accountId, generation)) return 'link_unavailable';
      if (error) return 'link_unavailable';
      if (data?.active === true && data.linked === true
        && typeof data.device_id === 'string' && deviceLinkUuidPattern.test(data.device_id)
        && typeof data.merged_device === 'boolean') {
        clearDeviceLinkIntent(bound);
        // The server's group id is never the browser profile's local key.
        return 'active';
      }
      if (data?.active === false && ['invalid', 'expired', 'removed', 'type', 'used', 'capacity'].includes(data.reason)) {
        return `link_${data.reason}` as DeviceRegistrationStatus;
      }
      return 'link_unavailable';
    } catch { return 'link_unavailable'; }
  }

  const { data, error } = await getSupabaseClient().rpc("register_login_device", {
    p_device_key: deviceKey,
    p_device_type: device.type,
    p_device_name: device.name,
    p_session_id: sessionId,
  });

  if (error) {
    // Safe rollout: the old one-session policy remains in force until the
    // account-devices.sql migration has been applied in Supabase.
    if (error.code === 'PGRST202') {
      const legacy = await getSupabaseClient().rpc('register_current_session', {
        p_session_id: sessionId,
        p_replace: replaceLegacy,
      });
      if (!legacy.error) return legacy.data?.active === true ? 'legacy' : 'removed';
    }
    console.warn("Device registration is unavailable:", error.message);
    return "unavailable";
  }

  if (data?.active === true) return "active";
  if (data?.reason === "limit") return "limit";
  if (data?.reason === "removed") return "removed";
  return "unavailable";
}

function deviceError(status: DeviceRegistrationStatus): string {
  if (status.startsWith('link_')) return deviceLinkError(status.slice(5));
  if (status === "limit") return "Loại thiết bị này đã đủ 2 nhóm. Hãy dùng trình duyệt đang đăng nhập trên cùng máy để tạo mã liên kết, hoặc xóa nhóm cũ trong Bảo mật trước khi thay thế.";
  if (status === "removed") return "Thiết bị này đã bị xóa khỏi tài khoản. Vui lòng dùng thiết bị khác hoặc liên hệ quản trị viên.";
  return "Không thể xác nhận thiết bị. Hãy bật bộ nhớ trình duyệt và kiểm tra cấu hình quản lý thiết bị, rồi thử lại.";
}

async function endInactiveSession(set: SetAuthState, reason: DeviceRegistrationStatus) {
  if (reason.startsWith('link_')) {
    set({ user: null, error: deviceError(reason), initialized: true, isLoading: false });
    try { await getSupabaseClient().auth.signOut({ scope: 'local' }); } catch { /* Keep retry intent and error. */ }
    return;
  }
  if (forcedLogoutInProgress) return;
  forcedLogoutInProgress = true;

  set({ user: null, error: null, initialized: true, isLoading: false });
  try {
    await getSupabaseClient().auth.signOut({ scope: "local" });
  } catch {
    // Việc chuyển về trang đăng nhập vẫn phải diễn ra nếu Supabase tạm lỗi.
  }

  if (typeof window !== "undefined") {
    const query = reason === "limit" ? DEVICE_LIMIT_QUERY
      : reason === "unavailable" ? DEVICE_SETUP_QUERY : SESSION_REPLACED_QUERY;
    window.location.replace(`/login?${query}=1`);
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: false,
      error: null,
      initialized: false,

      clearError: () => set({ error: null }),

      initAuth: () => {
        if (get().initialized) return Promise.resolve();
        if (authInitialization) return authInitialization;
        authInitializationGeneration = authGeneration;
        authInitialization = (async () => {
        const generation = authGeneration;
        try {
          const supabase = getSupabaseClient();
          // Listen for auth state changes
          if (!authListenerInstalled) {
          authListenerInstalled = true;
          supabase.auth.onAuthStateChange((event: string, session: any) => {
            if (event === 'SIGNED_OUT') {
              authGeneration += 1;
              authIdentity = null;
              set({ user: null });
            } else if (event === 'SIGNED_IN' && session?.user) {
              if (get().isLoading) {
                const attempt = explicitAuthAttempt;
                const ownEvent = attempt?.generation === authGeneration && (attempt.accountId
                  ? attempt.accountId === session.user.id && attempt.sessionId === getSessionIdFromAccessToken(session.access_token)
                  : attempt.email === session.user.email?.trim().toLowerCase());
                if (ownEvent) return;
                // An external identity/session supersedes the loading attempt immediately.
                authGeneration += 1;
                explicitAuthAttempt = null;
                clearDeviceLinkIntent();
                authIdentity = session.user.id;
                set({ user: null, error: null, isLoading: false });
              }
              observeIdentity(session.user.id);
              const eventGeneration = authGeneration;
              // Supabase auth callbacks must not await another Supabase request.
              window.setTimeout(async () => {
                try {
                const current = await supabase.auth.getSession();
                if (eventGeneration !== authGeneration || current.data.session?.access_token !== session.access_token) return;
                if (get().isLoading) return; // password login/register handles its own registration
                const status = await registerCurrentDevice(session.access_token, true, session.user.id, eventGeneration);
                if (!await isCurrentAuthSession(session.access_token, session.user.id, eventGeneration)) return;
                if (status === 'legacy') await supabase.auth.signOut({ scope: 'others' });
                if (!await isCurrentAuthSession(session.access_token, session.user.id, eventGeneration)) return;
                if (status !== "active" && status !== 'legacy') {
                  await endInactiveSession(set, status);
                  return;
                }
                await get().refreshUser();
                if (eventGeneration === authGeneration) set({ initialized: true });
                } catch { if (eventGeneration === authGeneration) set({ error: 'Chưa thể xác nhận phiên đăng nhập. Vui lòng thử lại.' }); }
              }, 0);
            }
          });
          }
          const { data: { session } } = await supabase.auth.getSession();
          if (generation !== authGeneration) return;

          if (session?.user) {
            observeIdentity(session.user.id);
            if (generation !== authGeneration) return;
            const oauthReturn = new URLSearchParams(window.location.search).has('device_oauth');
            const sessionStatus = await registerCurrentDevice(session.access_token, oauthReturn, session.user.id, generation);
            if (!await isCurrentAuthSession(session.access_token, session.user.id, generation)) return;
            if (oauthReturn) {
              const url = new URL(window.location.href);
              url.searchParams.delete('device_oauth');
              window.history.replaceState(null, '', url.pathname + url.search + url.hash);
            }
            if (sessionStatus === 'legacy' && oauthReturn) {
              await supabase.auth.signOut({ scope: 'others' });
            }
            if (!await isCurrentAuthSession(session.access_token, session.user.id, generation)) return;
            if (sessionStatus !== "active" && sessionStatus !== 'legacy') {
              await endInactiveSession(set, sessionStatus);
              return;
            }

            await supabase.rpc('sync_my_membership_status');
            if (generation !== authGeneration) return;
            const { data: profile } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", session.user.id)
              .single();

            if (profile) {
              const mappedUser = mapProfile(profile, session.user);
              if (await isCurrentAuthSession(session.access_token, session.user.id, generation)) { rememberAccount(mappedUser); set({ user: mappedUser, initialized: true }); }
            } else {
              if (generation === authGeneration) set({ user: null, initialized: true, error: 'Chưa thể tải thông tin tài khoản. Vui lòng đăng nhập lại.' });
            }
          } else {
            // No active session — clear persisted user
            if (generation === authGeneration) set({ user: null, initialized: true });
          }


        } catch {
          if (generation === authGeneration) set({ user: null, initialized: true, error: 'Chưa thể xác thực phiên đăng nhập. Vui lòng thử lại.' });
        }
        })().finally(() => { authInitialization = null; authInitializationGeneration = null; });
        return authInitialization;
      },

      login: async (email: string, password: string) => {
        const generation = ++authGeneration;
        const intent = getDeviceLinkIntent();
        if (intent?.email && intent.email !== email.trim().toLowerCase()) {
          clearDeviceLinkIntent(intent);
          set({ error: deviceLinkError('invalid'), isLoading: false });
          return false;
        }
        const attempt: ExplicitAuthAttempt = { generation, email: email.trim().toLowerCase() };
        explicitAuthAttempt = attempt;
        set({ isLoading: true, error: null });
        try {
          const supabase = getSupabaseClient();
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          if (generation !== authGeneration) return false;

          if (error) {
            set({
              error: translateAuthError(error.message),
              isLoading: false
            });
            return false;
          }

          if (data.user) {
            attempt.accountId = data.user.id;
            attempt.sessionId = getSessionIdFromAccessToken(data.session?.access_token);
            authIdentity = data.user.id;
            if (data.session) {
              const status = await registerCurrentDevice(data.session.access_token, true, data.user.id, generation);
              if (!await isCurrentAuthSession(data.session.access_token, data.user.id, generation)) return false;
              if (status === 'legacy') await supabase.auth.signOut({ scope: 'others' });
              if (!await isCurrentAuthSession(data.session.access_token, data.user.id, generation)) return false;
              if (status !== "active" && status !== 'legacy') {
                set({ user: null, error: deviceError(status), isLoading: false });
                await supabase.auth.signOut({ scope: "local" });
                return false;
              }
            } else if (getDeviceLinkIntent()) {
              set({ user: null, error: deviceLinkError('unavailable'), isLoading: false });
              return false;
            }

            await supabase.rpc('sync_my_membership_status');
            if (generation !== authGeneration) return false;
            const { data: profile } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", data.user.id)
              .single();

            if (profile) {
              const mappedUser = mapProfile(profile, data.user);
              if (generation !== authGeneration) return false;
              if (data.session && !await isCurrentAuthSession(data.session.access_token, data.user.id, generation)) return false;
              rememberAccount(mappedUser);
              set({ user: mappedUser, isLoading: false, initialized: true });
              return true;
            }
          }

          if (generation === authGeneration) set({ user: null, isLoading: false, error: 'Chưa thể tải thông tin tài khoản. Vui lòng thử lại.' });
          return false;
        } catch {
          if (generation === authGeneration) set({ error: "Đã xảy ra lỗi khi đăng nhập", isLoading: false });
          return false;
        } finally {
          if (explicitAuthAttempt === attempt) explicitAuthAttempt = null;
          if (generation === authGeneration) set({ isLoading: false });
        }
      },

      loginWithGoogle: async () => {
        const generation = ++authGeneration;
        set({ isLoading: true, error: null });
        try {
          const redirectTo = getOAuthRedirectUrl();
          if (!redirectTo) {
            set({ error: 'Không thể mở đăng nhập Google trên thiết bị này.', isLoading: false });
            return false;
          }

          const { data, error } = await getSupabaseClient().auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo,
              skipBrowserRedirect: true,
              queryParams: { prompt: 'select_account' },
            },
          });
          if (generation !== authGeneration) return false;

          if (error || !data.url) {
            set({ error: translateAuthError(error?.message), isLoading: false });
            return false;
          }

          window.location.assign(data.url);
          return true;
        } catch {
          if (generation === authGeneration) set({ error: 'Không thể kết nối với Google. Vui lòng thử lại.', isLoading: false });
          return false;
        }
      },

      register: async (name: string, email: string, password: string) => {
        clearDeviceLinkIntent();
        const attempt = { generation: authGeneration, email: email.trim().toLowerCase() };
        explicitAuthAttempt = attempt;
        set({ isLoading: true, error: null });
        try {
          const supabase = getSupabaseClient();
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: { name },
              emailRedirectTo: getEmailRedirectUrl(),
            },
          });

          if (error) {
            set({ error: translateAuthError(error.message), isLoading: false });
            return { success: false, requiresEmailConfirmation: false };
          }

          if (data.user) {
            if (!data.session) {
              set({ user: null, isLoading: false, initialized: true });
              return { success: true, requiresEmailConfirmation: true, email: data.user.email || email };
            }

            const status = await registerCurrentDevice(data.session.access_token, true);
            if (status === 'legacy') await supabase.auth.signOut({ scope: 'others' });
            if (status !== "active" && status !== 'legacy') {
              await supabase.auth.signOut({ scope: "local" });
              set({ user: null, error: deviceError(status), isLoading: false });
              return { success: false, requiresEmailConfirmation: false };
            }

            const { data: profile } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", data.user.id)
              .maybeSingle();

            const signedInUser: User = profile ? mapProfile(profile, data.user) : {
                id: data.user.id,
                name, email,
                accountTier: 'flygo',
                referralRewardDays: 0,
                referralDiscountPercent: 0,
                referralEligibleUntil: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
                createdAt: new Date().toISOString(),
              };
            rememberAccount(signedInUser);
            set({
              user: signedInUser,
              isLoading: false,
              initialized: true,
            });
            return { success: true, requiresEmailConfirmation: false };
          }

          set({ isLoading: false });
          return { success: false, requiresEmailConfirmation: false };
        } catch {
          set({ error: "Đã xảy ra lỗi khi đăng ký", isLoading: false });
          return { success: false, requiresEmailConfirmation: false };
        } finally {
          if (explicitAuthAttempt === attempt) explicitAuthAttempt = null;
        }
      },

      resendConfirmationEmail: async (email: string) => {
        try {
          const { error } = await getSupabaseClient().auth.resend({
            type: 'signup',
            email,
            options: { emailRedirectTo: getEmailRedirectUrl() },
          });
          if (error) return { success: false, message: translateAuthError(error.message) };
          return { success: true, message: 'Email xác nhận mới đã được gửi. Vui lòng kiểm tra hộp thư.' };
        } catch {
          return { success: false, message: 'Không thể gửi lại email xác nhận. Vui lòng thử lại sau.' };
        }
      },

      logout: async () => {
        const generation = ++authGeneration;
        clearDeviceLinkIntent();
        authIdentity = null;
        set({ user: null, error: null, isLoading: false });
        try {
          const supabase = getSupabaseClient();
          const { data: { session } } = await supabase.auth.getSession();
          if (generation !== authGeneration) return;
          const sessionId = getSessionIdFromAccessToken(session?.access_token);
          const deviceKey = getBrowserDeviceKey();
          if (sessionId && deviceKey) {
            const { error } = await supabase.rpc("release_device_session", { p_device_key: deviceKey, p_session_id: sessionId });
            if (generation !== authGeneration) return;
            if (error?.code === 'PGRST202') await supabase.rpc('release_current_session', { p_session_id: sessionId });
          }
          await supabase.auth.signOut({ scope: 'local' });
        } catch { /* ignore */ }
        if (generation === authGeneration) set({ user: null, error: null });
      },

      logoutAllDevices: async () => {
        const generation = ++authGeneration;
        clearDeviceLinkIntent();
        authIdentity = null;
        try {
          const supabase = getSupabaseClient();
          let { error } = await supabase.rpc("clear_my_device_sessions");
          if (generation !== authGeneration) return;
          if (error?.code === 'PGRST202') ({ error } = await supabase.rpc('clear_my_active_session'));
          if (generation !== authGeneration) return;
          if (error) throw error;
          const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' });
          if (signOutError) throw signOutError;
          set({ user: null, error: null });
        } catch {
          // Never claim that other sessions were revoked when the server failed.
          throw new Error('Chưa thể đăng xuất tất cả thiết bị. Kiểm tra kết nối rồi thử lại.');
        }
      },

      checkActiveSession: async () => {
        const generation = authGeneration;
        try {
          const supabase = getSupabaseClient();
          const { data: { session } } = await supabase.auth.getSession();
          if (generation !== authGeneration) return true;

          if (!session?.user) {
            set({ user: null });
            return false;
          }

          const sessionId = getSessionIdFromAccessToken(session.access_token);
          const deviceKey = getBrowserDeviceKey();
          if (!sessionId || !deviceKey) {
            if (!await isCurrentAuthSession(session.access_token, session.user.id, generation)) return true;
            await endInactiveSession(set, 'unavailable');
            return false;
          }
          const { data, error } = await supabase.rpc('check_registered_device', {
            p_device_key: deviceKey,
            p_session_id: sessionId,
          });
          if (!await isCurrentAuthSession(session.access_token, session.user.id, generation)) return true;
          if (error?.code === 'PGRST202') {
            const legacy = await supabase.rpc('register_current_session', { p_session_id: sessionId, p_replace: false });
            if (!await isCurrentAuthSession(session.access_token, session.user.id, generation)) return true;
            if (!legacy.error && legacy.data?.active === false) {
              await endInactiveSession(set, 'removed');
              return false;
            }
            return true;
          }
          if (!error && data?.active === false) {
            await endInactiveSession(set, 'removed');
            return false;
          }

          return true;
        } catch {
          // Không đăng xuất người học chỉ vì mạng chập chờn hoặc RPC tạm lỗi.
          return true;
        }
      },

      refreshUser: async () => {
        const generation = authGeneration;
        // Profile reads must not expose an account before its device link is accepted.
        if (authInitialization && authInitializationGeneration === generation) await authInitialization;
        if (generation !== authGeneration || get().isLoading || getDeviceLinkIntent()) return;
        try {
          const supabase = getSupabaseClient();
          const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
          if (authError || generation !== authGeneration) return;

          if (authUser) {
            await supabase.rpc('sync_my_membership_status');
            const { data: profile } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", authUser.id)
              .single();
            if (profile) {
              const mappedUser = mapProfile(profile, authUser);
              if (generation !== authGeneration) return;
              rememberAccount(mappedUser);
              if (generation === authGeneration) set({ user: mappedUser });
            }
          } else {
            set({ user: null });
          }
        } catch { /* keep current */ }
      },
    }),
    {
      name: "edu-tutor-auth",
      partialize: (state) => ({ user: state.user }),
    }
  )
);
