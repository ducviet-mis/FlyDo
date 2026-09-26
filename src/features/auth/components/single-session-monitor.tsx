"use client";

import { useEffect } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useAuthStore } from "../stores/auth-store";

const SESSION_CHECK_INTERVAL_MS = 30_000;

export function SingleSessionMonitor() {
  const userId = useAuthStore((state) => state.user?.id);
  const checkActiveSession = useAuthStore((state) => state.checkActiveSession);

  useEffect(() => {
    if (!userId) return;

    let checkInProgress = false;
    const runCheck = async () => {
      if (checkInProgress) return;
      checkInProgress = true;
      try {
        await checkActiveSession();
      } finally {
        checkInProgress = false;
      }
    };

    const supabase = getSupabaseClient();
    const channel = supabase
      .channel(`active-session:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "account_devices",
          filter: `user_id=eq.${userId}`,
        },
        () => void runCheck(),
      )
      .subscribe();

    const intervalId = window.setInterval(runCheck, SESSION_CHECK_INTERVAL_MS);
    const handleFocus = () => void runCheck();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void runCheck();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      void supabase.removeChannel(channel);
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [checkActiveSession, userId]);

  return null;
}
