'use client';

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { useNotifications } from './use-notifications';

export function NotificationBell() {
  const userId = useAuthStore((state) => state.user?.id);
  const { unreadCount, available } = useNotifications(5);

  if (!userId) return null;
  if (available === false) return null;
  if (available === null) return <span aria-hidden="true" className="h-11 w-11 shrink-0" />;

  return (
    <Link
      href="/notifications"
      aria-label={unreadCount > 0 ? `Thông báo, ${unreadCount} chưa đọc` : 'Thông báo, không có mục chưa đọc'}
      className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Bell aria-hidden="true" className="h-5 w-5" />
      {unreadCount > 0 && (
        <span aria-hidden="true" className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold tabular-nums text-destructive-foreground">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
      <span role="status" aria-atomic="true" className="sr-only">
        {unreadCount > 0 ? `${unreadCount} thông báo chưa đọc` : 'Không có thông báo chưa đọc'}
      </span>
    </Link>
  );
}
