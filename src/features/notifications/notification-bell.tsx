'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck, ChevronRight, Loader2 } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { NotificationDetailDialog } from './notification-detail-dialog';
import type { AppNotification } from './use-notifications';
import { useNotifications } from './use-notifications';

export function NotificationBell() {
  const userId = useAuthStore((state) => state.user?.id);
  const { items, unreadCount, loading, available, error, refresh, markRead, markAllRead } = useNotifications(12);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<AppNotification | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const openingDetail = useRef(false);

  if (!userId) return null;
  if (available === false) return null;
  if (available === null) return <span aria-hidden="true" className="h-11 w-11 shrink-0" />;

  const showDetail = (item: AppNotification) => {
    openingDetail.current = true;
    setOpen(false);
    setSelected(item);
    if (!item.read_at) void markRead(item.id);
  };

  const readAll = async () => {
    setMarkingAll(true);
    await markAllRead();
    setMarkingAll(false);
  };

  return (
    <>
      <DropdownMenu modal={false} open={open} onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) void refresh();
      }}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={unreadCount > 0 ? `Thông báo, ${unreadCount} chưa đọc` : 'Thông báo, không có mục chưa đọc'}
            aria-expanded={open}
            className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Bell aria-hidden="true" className="h-5 w-5" />
            {unreadCount > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold tabular-nums text-destructive-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>}
            <span role="status" aria-atomic="true" className="sr-only">
              {unreadCount > 0 ? `${unreadCount} thông báo chưa đọc` : 'Không có thông báo chưa đọc'}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="w-[calc(100vw-1.5rem)] max-w-[380px] overflow-y-auto rounded-xl p-0 sm:w-[380px]"
          onCloseAutoFocus={(event) => {
            if (openingDetail.current) {
              event.preventDefault();
              openingDetail.current = false;
            }
          }}
        >
          <DropdownMenuLabel className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-popover px-4 py-3 text-base text-foreground">
            <span>Thông báo</span>
            {unreadCount > 0 && <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold tabular-nums text-primary">{unreadCount} chưa đọc</span>}
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="my-0" />
          {error && <p role="alert" className="mx-3 my-3 rounded-lg bg-destructive-soft p-3 text-xs text-destructive">{error}</p>}
          {loading && items.length === 0 ? <p role="status" className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Đang tải thông báo...
          </p> : items.length === 0 ? <div className="px-5 py-8 text-center">
            <Bell aria-hidden="true" className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">Chưa có thông báo nào</p>
            <p className="mt-1 text-xs text-muted-foreground">Tin mới từ FlyDo sẽ xuất hiện ở đây.</p>
          </div> : items.map((item) => <DropdownMenuItem
            key={item.id}
            onSelect={() => showDetail(item)}
            className="min-h-16 cursor-pointer items-start gap-3 rounded-none border-b border-border px-4 py-3.5 focus:bg-primary-soft"
          >
            <span aria-hidden="true" className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${item.read_at ? 'bg-muted' : 'bg-primary'}`} />
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-sm text-foreground ${item.read_at ? 'font-medium' : 'font-bold'}`}>{item.title}</span>
              <span className="mt-1 block truncate text-xs text-muted-foreground">{item.body}</span>
              <time dateTime={item.created_at} className="mt-1.5 block text-xs text-muted-foreground">
                {new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.created_at))}
              </time>
            </span>
            <ChevronRight aria-hidden="true" className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" />
          </DropdownMenuItem>)}
          <div className="sticky bottom-0 z-10 flex items-center justify-between gap-2 border-t border-border bg-popover p-2">
            <DropdownMenuItem
              disabled={unreadCount === 0 || markingAll}
              onSelect={(event) => { event.preventDefault(); void readAll(); }}
              className="cursor-pointer text-xs"
            >
              {markingAll ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <CheckCheck aria-hidden="true" className="h-4 w-4" />}
              Đọc tất cả
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="cursor-pointer text-xs text-primary focus:text-primary">
              <Link href="/notifications">Xem tất cả <ChevronRight aria-hidden="true" className="h-4 w-4" /></Link>
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      <NotificationDetailDialog notification={selected} onClose={() => setSelected(null)} error={error} />
    </>
  );
}
