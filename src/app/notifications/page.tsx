'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Check, CheckCheck, Loader2, RefreshCw, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoginRequiredSection } from '@/components/layout/login-required-section';
import { PageHeader } from '@/components/shared/page-header';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { useNotifications } from '@/features/notifications/use-notifications';

function displayDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function NotificationsPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const initialized = useAuthStore((state) => state.initialized);
  const { items, unreadCount, loading, available, error, refresh, markRead, markAllRead } = useNotifications(100);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [busy, setBusy] = useState<string | null>(null);

  if (!initialized) return <div role="status" className="container py-16 text-center text-muted-foreground">Đang kiểm tra tài khoản...</div>;
  if (!user) return <LoginRequiredSection sectionName="thông báo" />;

  const visible = filter === 'unread' ? items.filter((item) => !item.read_at) : items;

  const readOne = async (id: string, actionUrl?: string | null) => {
    setBusy(id);
    const success = await markRead(id);
    setBusy(null);
    if (success && actionUrl) router.push(actionUrl);
  };

  const readAll = async () => {
    setBusy('all');
    await markAllRead();
    setBusy(null);
  };

  return (
    <div className="container max-w-4xl py-8">
      <PageHeader title="Thông báo" description="Tin mới từ FlyDo và những cập nhật dành cho bạn.">
        <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới
        </Button>
      </PageHeader>

      {available === false ? (
        <div role="alert" className="rounded-2xl border border-border bg-card p-6 text-muted-foreground">
          Tính năng thông báo chưa được kích hoạt. ADMIN cần chạy file notifications.sql trên Supabase.
        </div>
      ) : <>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2" role="group" aria-label="Lọc thông báo">
            <Button type="button" variant={filter === 'all' ? 'default' : 'outline'} size="sm" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Tất cả</Button>
            <Button type="button" variant={filter === 'unread' ? 'default' : 'outline'} size="sm" aria-pressed={filter === 'unread'} onClick={() => setFilter('unread')}>Chưa đọc{unreadCount > 0 ? ` (${unreadCount})` : ''}</Button>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => void readAll()} disabled={unreadCount === 0 || busy !== null}>
            {busy === 'all' ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <CheckCheck aria-hidden="true" className="h-4 w-4" />}
            Đánh dấu tất cả đã đọc
          </Button>
        </div>

        {error && <p role="alert" className="mb-4 rounded-lg bg-destructive-soft p-3 text-sm text-destructive">{error}</p>}

        {loading ? (
          <div role="status" className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card py-16 text-muted-foreground">
            <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" /> Đang tải thông báo...
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card px-6 py-14 text-center shadow-soft">
            <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary"><Bell aria-hidden="true" className="h-7 w-7" /></span>
            <h2 className="text-lg font-bold text-foreground">{filter === 'unread' ? 'Bạn đã xem hết thông báo' : 'Chưa có thông báo nào'}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{filter === 'unread' ? 'Các thông báo đã đọc vẫn nằm trong mục Tất cả.' : 'Khi có tin mới từ FlyDo, bạn sẽ thấy ở đây.'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((item) => (
              <article key={item.id} className={`rounded-2xl border p-4 shadow-soft sm:p-5 ${item.read_at ? 'border-border bg-card' : 'border-primary/35 bg-primary-soft/20'}`}>
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${item.read_at ? 'bg-muted' : 'bg-primary'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h2 className="font-bold text-foreground">{item.title}</h2>
                      <time dateTime={item.created_at} className="text-xs tabular-nums text-muted-foreground">{displayDate(item.created_at)}</time>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {!item.read_at && <Button type="button" variant="outline" size="sm" onClick={() => void readOne(item.id)} disabled={busy !== null}>
                        {busy === item.id ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Check aria-hidden="true" className="h-4 w-4" />}
                        Đánh dấu đã đọc
                      </Button>}
                      {item.action_url && <Button type="button" variant="tertiary" size="sm" onClick={() => void readOne(item.id, item.action_url)} disabled={busy !== null}>
                        Xem nội dung <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
                      </Button>}
                    </div>
                  </div>
                </div>
              </article>
            ))}
            {items.length === 100 && <p className="py-3 text-center text-xs text-muted-foreground">Đang hiển thị 100 thông báo gần nhất.</p>}
          </div>
        )}
      </>}
    </div>
  );
}
