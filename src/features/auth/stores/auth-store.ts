"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getSessionIdFromAccessToken, SESSION_REPLACED_QUERY, DEVICE_LIMIT_QUERY, DEVICE_SETUP_QUERY } from "@/lib/auth/single-session";
import { getBrowserDeviceInfo, getBrowserDeviceKey } from "@/lib/auth/device-identity";
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

type DeviceRegistrationStatus = "active" | "legacy" | "limit" | "removed" | "unavailable";
type SetAuthState = (state: Partial<AuthState>) => void;

let forcedLogoutInProgress = false;
let authInitialization: Promise<void> | null = null;
let authListenerInstalled = false;
let authGeneration = 0;

async function registerCurrentDevice(accessToken: string | null | undefined, replaceLegacy = false): Promise<DeviceRegistrationStatus> {
  const sessionId = getSessionIdFromAccessToken(accessToken);
  const deviceKey = getBrowserDeviceKey();
  if (!sessionId || !deviceKey) return "unavailable";
  const device = getBrowserDeviceInfo();

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
  if (status === "limit") return "Loại thiết bị này đã đủ 2 máy. Hãy đăng nhập từ một thiết bị đang dùng và xóa thiết bị cũ trong Bảo mật trước khi thay thế.";
  if (status === "removed") return "Thiết bị này đã bị xóa khỏi tài khoản. Vui lòng dùng thiết bị khác hoặc liên hệ quản trị viên.";
  return "Không thể xác nhận thiết bị. Hãy bật bộ nhớ trình duyệt và kiểm tra cấu hình quản lý thiết bị, rồi thử lại.";
}

async function endInactiveSession(set: SetAuthState, reason: DeviceRegistrationStatus) {
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
              set({ user: null });
            } else if (event === 'SIGNED_IN' && session?.user) {
              // Supabase auth callbacks must not await another Supabase request.
              window.setTimeout(async () => {
                const eventGeneration = authGeneration;
                try {
                const current = await supabase.auth.getSession();
                if (current.data.session?.user.id !== session.user.id) return;
                if (get().isLoading) return; // password login/register handles its own registration
                const status = await registerCurrentDevice(session.access_token, true);
                if (eventGeneration !== authGeneration) return;
                if (status === 'legacy') await supabase.auth.signOut({ scope: 'others' });
                if (status !== "active" && status !== 'legacy') {
                  await endInactiveSession(set, status);
                  return;
                }
                await get().refreshUser();
                } catch { if (eventGeneration === authGeneration) set({ error: 'Chưa thể xác nhận phiên đăng nhập. Vui lòng thử lại.' }); }
              }, 0);
            }
          });
          }
          const { data: { session } } = await supabase.auth.getSession();

          if (session?.user) {
            const oauthReturn = new URLSearchParams(window.location.search).has('device_oauth');
            const sessionStatus = await registerCurrentDevice(session.access_token, oauthReturn);
            if (generation !== authGeneration) return;
            if (oauthReturn) {
              const url = new URL(window.location.href);
              url.searchParams.delete('device_oauth');
              window.history.replaceState(null, '', url.pathname + url.search + url.hash);
            }
            if (sessionStatus === 'legacy' && oauthReturn) {
              await supabase.auth.signOut({ scope: 'others' });
            }
            if (sessionStatus !== "active" && sessionStatus !== 'legacy') {
              await endInactiveSession(set, sessionStatus);
              return;
            }

            await supabase.rpc('sync_my_membership_status');
            const { data: profile } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", session.user.id)
              .single();

            if (profile) {
              const mappedUser = mapProfile(profile, session.user);
              if (generation === authGeneration) { rememberAccount(mappedUser); set({ user: mappedUser, initialized: true }); }
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
        })().finally(() => { authInitialization = null; });
        return authInitialization;
      },

      login: async (email: string, password: string) => {
        const generation = ++authGeneration;
        set({ isLoading: true, error: null });
        try {
          const supabase = getSupabaseClient();
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });

          if (error) {
            set({
              error: translateAuthError(error.message),
              isLoading: false
            });
            return false;
          }

          if (data.user) {
            if (data.session) {
              const status = await registerCurrentDevice(data.session.access_token, true);
              if (status === 'legacy') await supabase.auth.signOut({ scope: 'others' });
              if (status !== "active" && status !== 'legacy') {
                await supabase.auth.signOut({ scope: "local" });
                set({ user: null, error: deviceError(status), isLoading: false });
                return false;
              }
            }

            await supabase.rpc('sync_my_membership_status');
            const { data: profile } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", data.user.id)
              .single();

            if (profile) {
              const mappedUser = mapProfile(profile, data.user);
              rememberAccount(mappedUser);
              if (generation !== authGeneration) return false;
              set({ user: mappedUser, isLoading: false, initialized: true });
              return true;
            }
          }

          set({ user: null, isLoading: false, error: 'Chưa thể tải thông tin tài khoản. Vui lòng thử lại.' });
          return false;
        } catch {
          set({ error: "Đã xảy ra lỗi khi đăng nhập", isLoading: false });
          return false;
        }
      },

      loginWithGoogle: async () => {
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

          if (error || !data.url) {
            set({ error: translateAuthError(error?.message), isLoading: false });
            return false;
          }

          window.location.assign(data.url);
          return true;
        } catch {
          set({ error: 'Không thể kết nối với Google. Vui lòng thử lại.', isLoading: false });
          return false;
        }
      },

      register: async (name: string, email: string, password: string) => {
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
        authGeneration += 1;
        try {
          const supabase = getSupabaseClient();
          const { data: { session } } = await supabase.auth.getSession();
          const sessionId = getSessionIdFromAccessToken(session?.access_token);
          const deviceKey = getBrowserDeviceKey();
          if (sessionId && deviceKey) {
            const { error } = await supabase.rpc("release_device_session", { p_device_key: deviceKey, p_session_id: sessionId });
            if (error?.code === 'PGRST202') await supabase.rpc('release_current_session', { p_session_id: sessionId });
          }
          await supabase.auth.signOut({ scope: 'local' });
        } catch { /* ignore */ }
        set({ user: null, error: null });
      },

      logoutAllDevices: async () => {
        authGeneration += 1;
        try {
          const supabase = getSupabaseClient();
          let { error } = await supabase.rpc("clear_my_device_sessions");
          if (error?.code === 'PGRST202') ({ error } = await supabase.rpc('clear_my_active_session'));
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
        try {
          const supabase = getSupabaseClient();
          const { data: { session } } = await supabase.auth.getSession();

          if (!session?.user) {
            set({ user: null });
            return false;
          }

          const sessionId = getSessionIdFromAccessToken(session.access_token);
          const deviceKey = getBrowserDeviceKey();
          if (!sessionId || !deviceKey) {
            await endInactiveSession(set, 'unavailable');
            return false;
          }
          const { data, error } = await supabase.rpc('check_registered_device', {
            p_device_key: deviceKey,
            p_session_id: sessionId,
          });
          if (error?.code === 'PGRST202') {
            const legacy = await supabase.rpc('register_current_session', { p_session_id: sessionId, p_replace: false });
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
