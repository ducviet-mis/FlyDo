'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { getSupabaseClient } from '@/lib/supabase/client';
import { localStudyDate, useOnlineStudyStore } from '../stores/online-study-store';

const HEARTBEAT_MS = 10_000;
const MAX_HEARTBEAT_SECONDS = 15;

type StudyHeartbeat = { date: string; seconds: number };

export function OnlineStudyTracker() {
  const userId = useAuthStore((state) => state.user?.id);

  useEffect(() => {
    useOnlineStudyStore.getState().reset();
    if (!userId) return;

    let disposed = false;
    let inFlight = false;
    let pendingSeconds = 0;
    let lastSample = performance.now();

    const sampleVisibleTime = () => {
      const now = performance.now();
      if (document.visibilityState === 'visible' && navigator.onLine) {
        pendingSeconds = Math.min(MAX_HEARTBEAT_SECONDS, pendingSeconds + Math.max(0, now - lastSample) / 1000);
      }
      lastSample = now;
    };

    const heartbeat = async () => {
      if (disposed || inFlight || !navigator.onLine) return;
      if (document.visibilityState === 'hidden' && pendingSeconds === 0) return;
      inFlight = true;
      const elapsed = pendingSeconds;
      pendingSeconds = 0;
      let result;
      try {
        result = await getSupabaseClient().rpc('record_online_study_time', {
        p_elapsed_seconds: elapsed,
        });
      } catch {
        if (!disposed) pendingSeconds = Math.min(MAX_HEARTBEAT_SECONDS, pendingSeconds + elapsed);
        return;
      } finally { inFlight = false; }
      if (disposed) return;
      const { data, error } = result;
      if (error) {
        pendingSeconds = Math.min(MAX_HEARTBEAT_SECONDS, pendingSeconds + elapsed);
        console.warn('Online study time could not be saved:', error.message);
        return;
      }
      const snapshot = data as StudyHeartbeat | null;
      if (snapshot?.date && Number.isFinite(Number(snapshot.seconds))) {
        useOnlineStudyStore.getState().setSnapshot(userId, snapshot.date, Number(snapshot.seconds));
      }
    };

    const tick = () => {
      sampleVisibleTime();
      const date = localStudyDate();
      const current = useOnlineStudyStore.getState();
      if (current.userId === userId && current.date && current.date !== date) {
        current.setSnapshot(userId, date, 0);
      }
      void heartbeat();
    };
    const onVisibilityChange = () => {
      // Flush the visible interval before the tab goes into the background.
      if (document.visibilityState === 'hidden') {
        const now = performance.now();
        if (navigator.onLine) {
          pendingSeconds = Math.min(MAX_HEARTBEAT_SECONDS, pendingSeconds + Math.max(0, now - lastSample) / 1000);
        }
        lastSample = now;
        void heartbeat();
      } else {
        lastSample = performance.now();
        void heartbeat();
      }
    };
    const onConnectionChange = () => {
      lastSample = performance.now();
      if (navigator.onLine) void heartbeat();
      else pendingSeconds = 0;
    };

    void heartbeat();
    const interval = window.setInterval(tick, HEARTBEAT_MS);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('online', onConnectionChange);
    window.addEventListener('offline', onConnectionChange);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('online', onConnectionChange);
      window.removeEventListener('offline', onConnectionChange);
    };
  }, [userId]);

  return null;
}
