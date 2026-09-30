'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Laptop, Loader2, MonitorSmartphone, RefreshCw, Smartphone, Tablet, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getBrowserDeviceKey, type AccountDeviceType } from '@/lib/auth/device-identity';
import { getSessionIdFromAccessToken } from '@/lib/auth/single-session';
import { getSupabaseClient } from '@/lib/supabase/client';

type Device = {
  id: string;
  device_key: string;
  device_type: AccountDeviceType;
  device_name: string;
  session_id: string | null;
  first_seen_at: string;
  last_login_at: string;
};

const groups = [
  { type: 'phone' as const, label: 'Điện thoại', icon: Smartphone },
  { type: 'computer' as const, label: 'Máy tính', icon: Laptop },
  { type: 'tablet' as const, label: 'Máy tính bảng', icon: Tablet },
];

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Chưa ghi nhận';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(date);
}

export function AccountDevices({ userId }: { userId: string }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [remaining, setRemaining] = useState(2);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [selected, setSelected] = useState<Device | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const loadGeneration = useRef(0);
  const removalLock = useRef(false);
  const deviceKey = getBrowserDeviceKey();

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const [deviceResult, quotaResult, sessionResult] = await Promise.all([
        supabase.from('account_devices')
          .select('id,device_key,device_type,device_name,session_id,first_seen_at,last_login_at')
          .eq('user_id', userId).is('revoked_at', null)
          .order('last_login_at', { ascending: false }),
        supabase.from('account_device_quota').select('removal_count').eq('user_id', userId).maybeSingle(),
        supabase.auth.getSession(),
      ]);
      if (generation !== loadGeneration.current) return;
      if (deviceResult.error || quotaResult.error || sessionResult.error) {
        setLoadFailed(true);
        setMessage({ kind: 'error', text: 'Không thể tải danh sách thiết bị. Hãy kiểm tra bản cập nhật cơ sở dữ liệu rồi thử lại.' });
      } else {
        setLoadFailed(false);
        setMessage((previous) => previous?.kind === 'error' ? null : previous);
        setDevices((deviceResult.data || []) as Device[]);
        setRemaining(Math.max(0, 2 - Number(quotaResult.data?.removal_count || 0)));
        setCurrentSessionId(getSessionIdFromAccessToken(sessionResult.data.session?.access_token));
      }
    } catch {
      if (generation === loadGeneration.current) {
        setLoadFailed(true);
        setMessage({ kind: 'error', text: 'Chưa thể tải thiết bị. Kiểm tra kết nối rồi thử làm mới.' });
      }
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
    return () => { loadGeneration.current += 1; };
  }, [load]);

  const removeSelected = async () => {
    if (!selected || removalLock.current) return;
    removalLock.current = true;
    setRemoving(true);
    try {
      const { data, error } = await getSupabaseClient().rpc('remove_account_device', {
        p_device_id: selected.id,
      });
      if (error || data?.removed !== true) {
        const explanation = data?.reason === 'quota' ? 'Bạn đã dùng hết 2 lượt xóa thiết bị của tài khoản.'
          : data?.reason === 'current' ? 'Không thể xóa thiết bị đang sử dụng.'
            : 'Không thể xóa thiết bị. Vui lòng tải lại và thử lại.';
        // Keep the failure visible; refreshing used to clear it immediately.
        await load();
        setMessage({ kind: 'error', text: explanation });
      } else {
        setMessage({ kind: 'success', text: `Đã xóa ${selected.device_name}. Thiết bị này sẽ bị đăng xuất.` });
        await load();
      }
      setSelected(null);
    } catch {
      setMessage({ kind: 'error', text: 'Chưa thể xác nhận xóa thiết bị. Hãy làm mới danh sách trước khi thử lại.' });
      setSelected(null);
    } finally {
      removalLock.current = false;
      setRemoving(false);
    }
  };

  return (
    <Card className="rounded-2xl border-border shadow-soft">
      <CardHeader className="border-b border-border pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
              <MonitorSmartphone aria-hidden="true" className="h-5 w-5 text-primary" /> Thiết bị đăng nhập
            </CardTitle>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Mỗi tài khoản dùng tối đa 2 điện thoại, 2 máy tính và 2 máy tính bảng.
              Mỗi trình duyệt được tính là một thiết bị.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-2">
            <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 px-4 py-6 md:px-8">
        {!loadFailed && <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface p-4">
            <span className="text-sm font-semibold text-foreground">Lượt xóa/thay thế còn lại</span>
            <span className="font-bold tabular-nums text-primary">{remaining}/2 lượt</span>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Giới hạn 2 lượt xóa áp dụng cho toàn bộ vòng đời tài khoản. Đăng xuất không xóa thiết bị khỏi danh sách.
          </p>
        </>}

        {message && (
          <p role="status" className={`flex items-start gap-2 rounded-lg p-3 text-sm ${message.kind === 'error' ? 'bg-destructive-soft text-destructive' : 'bg-success-soft text-success'}`}>
            {message.kind === 'error' ? <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />}
            {message.text}
          </p>
        )}

        {loading ? (
          <div role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Đang tải thiết bị...
          </div>
        ) : loadFailed ? null : groups.map((group) => {
          const entries = devices.filter((device) => device.device_type === group.type);
          return (
            <section key={group.type} aria-label={group.label} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 font-semibold text-foreground">
                  <group.icon aria-hidden="true" className="h-4 w-4 text-primary" /> {group.label}
                </h3>
                <span className="text-sm tabular-nums text-muted-foreground">{entries.length}/2</span>
              </div>
              {entries.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">Chưa có thiết bị nào.</p>
              ) : entries.map((device) => {
                const isCurrent = device.device_key === deviceKey && device.session_id === currentSessionId;
                return (
                  <div key={device.id} className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
                        {device.device_name}
                        {isCurrent && <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">Thiết bị này</span>}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Đăng nhập gần nhất: <time dateTime={device.last_login_at} className="tabular-nums">{formatDate(device.last_login_at)}</time>
                      </p>
                    </div>
                    {!isCurrent && (
                      <Button type="button" variant="outline" size="sm" disabled={remaining === 0} onClick={() => { setMessage(null); setSelected(device); }} className="self-start border-destructive/40 text-destructive hover:bg-destructive-soft sm:self-auto">
                        <Trash2 aria-hidden="true" className="h-4 w-4" /> Xóa thiết bị
                      </Button>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
      </CardContent>

      <AlertDialog open={!!selected} onOpenChange={(open) => { if (!open && !removing) setSelected(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa thiết bị này?</AlertDialogTitle>
            <AlertDialogDescription>
              {selected?.device_name} sẽ mất quyền đăng nhập và bạn dùng 1 trong 2 lượt xóa thiết bị của tài khoản.
              Lượt đã dùng không thể khôi phục.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Giữ lại</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); void removeSelected(); }} disabled={removing} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {removing ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Trash2 aria-hidden="true" className="h-4 w-4" />}
              Xác nhận xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
