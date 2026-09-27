'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { getSupabaseClient } from '@/lib/supabase/client';

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  action_url: string | null;
  created_at: string;
  read_at: string | null;
};

const CHANGE_EVENT = 'flydo:notifications-updated';

export function useNotifications(limit = 40) {
  const userId = useAuthStore((state) => state.user?.id);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [inboxUserId, setInboxUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!userId) {
      requestId.current += 1;
      setItems([]);
      setUnreadCount(0);
      setInboxUserId(null);
      setAvailable(false);
      setLoading(false);
      return;
    }
    const currentRequest = ++requestId.current;
    const { data, error: requestError } = await getSupabaseClient().rpc('get_my_notification_inbox', {
      p_limit: limit,
    });
    if (currentRequest !== requestId.current || useAuthStore.getState().user?.id !== userId) return;
    setInboxUserId(userId);
    if (requestError) {
      setAvailable(requestError.code !== 'PGRST202');
      setError(requestError.code === 'PGRST202'
        ? 'Thông báo chưa được cài đặt trên Supabase. ADMIN cần chạy notifications.sql.'
        : 'Chưa thể tải thông báo. Vui lòng thử lại.');
    } else {
      setAvailable(true);
      setError('');
      setItems(Array.isArray(data?.items) ? data.items as AppNotification[] : []);
      setUnreadCount(Math.max(0, Number(data?.unread_count || 0)));
    }
    setLoading(false);
  }, [limit, userId]);

  useEffect(() => {
    void refresh();
    if (!userId) return;
    const supabase = getSupabaseClient();
    // RealtimeClient reuses channels with the same topic. The header bell and
    // inbox page each mount this hook, so they must not share a subscribed topic.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      const channelId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
      channel = supabase.channel(`notifications:${userId}:${channelId}`);
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'app_notifications' }, () => void refresh());
      channel.subscribe();
    } catch {
      if (channel) void supabase.removeChannel(channel);
      channel = null;
      // The focus and interval refresh below keep the inbox usable without Realtime.
    }
    const interval = window.setInterval(() => void refresh(), 60_000);
    const onFocus = () => void refresh();
    const onVisibility = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener(CHANGE_EVENT, onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (channel) void supabase.removeChannel(channel);
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(CHANGE_EVENT, onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh, userId]);

  const markRead = useCallback(async (id: string) => {
    const { data, error: requestError } = await getSupabaseClient().rpc('mark_my_notification_read', {
      p_notification_id: id,
    });
    if (requestError || data !== true) {
      setError('Không thể đánh dấu đã đọc. Vui lòng thử lại.');
      return false;
    }
    await refresh();
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return true;
  }, [refresh]);

  const markAllRead = useCallback(async () => {
    const { error: requestError } = await getSupabaseClient().rpc('mark_all_my_notifications_read');
    if (requestError) {
      setError('Không thể đánh dấu tất cả đã đọc. Vui lòng thử lại.');
      return false;
    }
    await refresh();
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return true;
  }, [refresh]);

  const belongsToCurrentUser = userId === inboxUserId;
  return {
    items: belongsToCurrentUser ? items : [],
    unreadCount: belongsToCurrentUser ? unreadCount : 0,
    loading: belongsToCurrentUser ? loading : true,
    available: belongsToCurrentUser ? available : null,
    error: belongsToCurrentUser ? error : '',
    refresh, markRead, markAllRead,
  };
}
