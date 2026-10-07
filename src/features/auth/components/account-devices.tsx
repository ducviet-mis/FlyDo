'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { AlertCircle, CheckCircle2, Copy, Laptop, Link2, Loader2, MonitorSmartphone, RefreshCw, Smartphone, Tablet, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getBrowserDeviceInfo, getBrowserDeviceKey, type AccountDeviceType } from '@/lib/auth/device-identity';
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
  is_current?: boolean;
  profile_count?: number;
};

type Message = { kind: 'success' | 'error'; text: string };
type IssuedLink = { code: string; expires_at: string; device_name: string; deadline: number; sessionId: string };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const missingLinkNotice = 'Liên kết profile chưa sẵn sàng. Bạn vẫn có thể xem và quản lý thiết bị; hãy thử lại sau khi tính năng được cập nhật.';
const linkReasons: Record<string, string> = {
  invalid: 'Mã không hợp lệ hoặc không thuộc tài khoản này. Kiểm tra mã từ profile nguồn rồi thử lại.',
  expired: 'Mã đã hết hạn. Hãy tạo mã mới ở profile nguồn rồi dán lại.',
  removed: 'Profile nguồn hoặc profile này đã bị thu hồi. Hãy làm mới danh sách và kiểm tra quyền đăng nhập.',
  type: 'Hai profile phải cùng loại thiết bị. Kiểm tra điện thoại, máy tính hoặc máy tính bảng ở profile nguồn.',
  used: 'Mã đã được sử dụng. Hãy tạo mã mới ở profile nguồn rồi dán lại.',
  capacity: 'Nhóm thiết bị đã đạt giới hạn 20 profile. Hãy dùng một nhóm khác còn chỗ trên cùng thiết bị vật lý, hoặc giữ các nhóm hiện tại.',
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
  // An account change removes sensitive state during render, before effects or requests settle.
  return <AccountDevicesForUser key={userId} userId={userId} />;
}

function AccountDevicesForUser({ userId }: { userId: string }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [remaining, setRemaining] = useState(2);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [selected, setSelected] = useState<Device | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [authorized, setAuthorized] = useState(true);
  const [linkAvailable, setLinkAvailable] = useState(true);
  const [linkDialog, setLinkDialog] = useState<'create' | 'redeem' | null>(null);
  const [issued, setIssued] = useState<IssuedLink | null>(null);
  const [pastedCode, setPastedCode] = useState('');
  const [linkMessage, setLinkMessage] = useState<Message | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [expired, setExpired] = useState(false);
  const loadGeneration = useRef(0);
  const removalLock = useRef(false);
  const linkLock = useRef(false);
  const lifetime = useRef(0);
  const alive = useRef(false);
  const accountActive = useRef(true);
  const issuedRef = useRef<IssuedLink | null>(null);
  const codeField = useRef<HTMLInputElement>(null);
  const pasteField = useRef<HTMLInputElement>(null);
  const linkTrigger = useRef<HTMLButtonElement>(null);
  const dialogAction = useRef<'create' | 'redeem'>('create');
  const deviceKey = getBrowserDeviceKey();
  const isCurrent = (device: Device) => device.is_current ?? (device.device_key === deviceKey && !!currentSessionId && device.session_id === currentSessionId);
  const currentDevice = devices.find(isCurrent);
  const canLink = authorized && !loading && !loadFailed && !!currentDevice && !!deviceKey && !!currentSessionId && linkAvailable;
  const fresh = useCallback((version: number) => alive.current && accountActive.current && version === lifetime.current, []);

  const clearIssued = () => { issuedRef.current = null; setIssued(null); setExpired(false); };

  const cancelQuietly = useCallback(async (link: IssuedLink) => {
    try {
      const client = getSupabaseClient();
      const { data, error } = await client.auth.getSession();
      if (!error && data.session?.user.id === userId && getSessionIdFromAccessToken(data.session.access_token) === link.sessionId) {
        await client.rpc('cancel_account_device_link', { p_link_code: link.code });
      }
    } catch { /* No sensitive error data. The server also expires unused codes. */ }
  }, [userId]);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    const version = lifetime.current;
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const sessionResult = await supabase.auth.getSession();
      if (!fresh(version) || generation !== loadGeneration.current) return;
      const session = sessionResult.data.session;
      const sessionId = getSessionIdFromAccessToken(session?.access_token);
      if (sessionResult.error || session?.user.id !== userId || !sessionId || !deviceKey) throw new Error('session');
      const result = await supabase.rpc('get_my_account_devices', { p_device_key: deviceKey });
      if (!fresh(version) || generation !== loadGeneration.current) return;
      let nextDevices: Device[];
      let nextRemaining: number;
      if (result.error?.code === 'PGRST202') {
        const [deviceResult, quotaResult] = await Promise.all([
          supabase.from('account_devices')
            .select('id,device_key,device_type,device_name,session_id,first_seen_at,last_login_at')
            .eq('user_id', userId).is('revoked_at', null).order('last_login_at', { ascending: false }),
          supabase.from('account_device_quota').select('removal_count').eq('user_id', userId).maybeSingle(),
        ]);
        if (!fresh(version) || generation !== loadGeneration.current) return;
        if (deviceResult.error || quotaResult.error) throw new Error('list');
        nextDevices = (deviceResult.data || []) as Device[];
        nextRemaining = 2 - Number(quotaResult.data?.removal_count || 0);
        setLinkAvailable(false);
      } else {
        if (result.error || !Array.isArray(result.data?.devices) || !Number.isFinite(result.data.remaining)) throw new Error('list');
        nextDevices = result.data.devices as Device[];
        nextRemaining = result.data.remaining;
        setLinkAvailable(true);
      }
      setLoadFailed(false);
      setMessage((previous) => previous?.kind === 'error' ? null : previous);
      setDevices(nextDevices);
      setRemaining(Math.max(0, Math.min(2, nextRemaining)));
      setCurrentSessionId(sessionId);
    } catch {
      if (fresh(version) && generation === loadGeneration.current) {
        setDevices([]);
        setCurrentSessionId(null);
        setLoadFailed(true);
        setMessage({ kind: 'error', text: 'Chưa thể tải thiết bị. Kiểm tra kết nối rồi thử làm mới.' });
      }
    } finally {
      if (fresh(version) && generation === loadGeneration.current) setLoading(false);
    }
  }, [userId, deviceKey, fresh]);

  useEffect(() => {
    alive.current = true;
    const client = getSupabaseClient();
    const { data: { subscription } } = client.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (!session || session.user.id !== userId) {
        accountActive.current = false;
        lifetime.current += 1;
        loadGeneration.current += 1;
        issuedRef.current = null;
        setIssued(null); setPastedCode(''); setDevices([]); setSelected(null); setLinkDialog(null);
        setMessage(null); setLinkMessage(null); setAuthorized(false);
      }
    });
    void Promise.resolve().then(load);
    return () => {
      alive.current = false;
      lifetime.current += 1;
      loadGeneration.current += 1;
      subscription.unsubscribe();
      const link = issuedRef.current;
      issuedRef.current = null;
      if (link) void cancelQuietly(link);
    };
  }, [load, cancelQuietly, userId]);

  useEffect(() => {
    if (!issued) return;
    const update = () => setExpired(performance.now() >= issued.deadline);
    const timer = window.setInterval(update, 250);
    window.addEventListener('focus', update);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update); };
  }, [issued]);

  const actOnLink = async (action: 'create' | 'redeem' | 'cancel') => {
    if (linkLock.current || removalLock.current || !accountActive.current || (action !== 'cancel' && !canLink)) return;
    const link = issuedRef.current;
    if (action === 'cancel' && !link) return;
    const submittedCode = pastedCode.trim();
    if (action === 'redeem' && !uuidPattern.test(submittedCode)) {
      setLinkMessage({ kind: 'error', text: linkReasons.invalid }); setLinkDialog(null); pasteField.current?.focus(); return;
    }
    const version = lifetime.current;
    linkLock.current = true;
    setLinkBusy(true); setLinkMessage(null);
    if (action === 'cancel') clearIssued();
    try {
      const client = getSupabaseClient();
      const sessionResult = await client.auth.getSession();
      if (!fresh(version)) return;
      const session = sessionResult.data.session;
      const sessionId = getSessionIdFromAccessToken(session?.access_token);
      if (sessionResult.error || session?.user.id !== userId || !sessionId || (action === 'cancel' && sessionId !== link?.sessionId)) throw new Error('session');
      const started = performance.now();
      const info = getBrowserDeviceInfo();
      const { data, error } = action === 'create'
        ? await client.rpc('create_account_device_link', { p_device_key: deviceKey })
        : action === 'cancel'
          ? await client.rpc('cancel_account_device_link', { p_link_code: link!.code })
          : await client.rpc('redeem_account_device_link', {
            p_link_code: submittedCode, p_device_key: deviceKey,
            p_device_type: currentDevice!.device_type, p_device_name: info.name, p_session_id: sessionId,
          });
      if (!fresh(version)) {
        if (action === 'create' && uuidPattern.test(data?.code || '')) {
          void cancelQuietly({ code: data.code, sessionId, expires_at: '', device_name: '', deadline: 0 });
        }
        return;
      }
      if (error?.code === 'PGRST202') {
        setLinkAvailable(false);
        setLinkMessage({ kind: 'error', text: missingLinkNotice });
      } else if (error) {
        throw new Error('network');
      } else if (action === 'create') {
        const expiresAt = Date.parse(data?.expires_at);
        const serverNow = data?.server_now ? Date.parse(data.server_now) : NaN;
        if (!uuidPattern.test(data?.code || '') || !Number.isFinite(expiresAt) || typeof data?.device_name !== 'string') throw new Error('response');
        const deadline = Number.isFinite(serverNow) ? started + expiresAt - serverNow : performance.now() + expiresAt - Date.now();
        const next = { code: data.code as string, expires_at: data.expires_at as string, device_name: data.device_name as string, deadline, sessionId };
        issuedRef.current = next; setIssued(next); setExpired(performance.now() >= deadline);
      } else if (action === 'redeem') {
        if (data?.active === true && data.linked === true && uuidPattern.test(data.device_id || '')) {
          setPastedCode('');
          if (link) { clearIssued(); await client.rpc('cancel_account_device_link', { p_link_code: link.code }); }
          if (!fresh(version)) return;
          await load();
          if (!fresh(version)) return;
          setLinkMessage({ kind: 'success', text: 'Đã liên kết profile vào cùng nhóm thiết bị. Không dùng lượt xóa; các profile vẫn giữ phiên đăng nhập riêng.' });
        } else {
          setLinkMessage({ kind: 'error', text: linkReasons[data?.reason] || 'Chưa thể liên kết profile. Hãy làm mới danh sách rồi kiểm tra mã và thử lại.' });
        }
      } else if (typeof data?.cancelled !== 'boolean') {
        throw new Error('response');
      }
    } catch {
      if (fresh(version)) setLinkMessage({ kind: 'error', text: action === 'cancel'
        ? 'Chưa thể xác nhận hủy mã. Mã có thể vẫn dùng được đến khi hết hạn; hãy tạo mã mới để vô hiệu hóa mã trước.'
        : 'Chưa thể xác nhận liên kết. Kiểm tra kết nối rồi thử lại; mã đã nhập được giữ nguyên.' });
    } finally {
      if (fresh(version)) {
        linkLock.current = false; setLinkBusy(false); setLinkDialog(null);
        if (action === 'cancel') linkTrigger.current?.focus();
      }
    }
  };

  const copyCode = async () => {
    const link = issuedRef.current;
    if (!link || performance.now() >= link.deadline || linkLock.current || !canLink) { setExpired(true); return; }
    const version = lifetime.current;
    linkLock.current = true; setLinkBusy(true);
    try {
      await navigator.clipboard.writeText(link.code);
      if (fresh(version) && issuedRef.current === link && performance.now() < link.deadline) setLinkMessage({ kind: 'success', text: 'Đã sao chép mã. Chỉ dán vào profile khác trên cùng thiết bị vật lý.' });
    } catch {
      if (fresh(version) && issuedRef.current === link) {
        setLinkMessage({ kind: 'error', text: 'Không thể sao chép tự động. Hãy chọn mã trong ô phía trên và sao chép thủ công.' });
        codeField.current?.focus(); codeField.current?.select();
      }
    } finally { if (fresh(version)) { linkLock.current = false; setLinkBusy(false); } }
  };

  const removeSelected = async () => {
    if (!selected || removalLock.current || linkLock.current || !accountActive.current || loading || loadFailed) return;
    const version = lifetime.current;
    const target = selected;
    removalLock.current = true;
    setRemoving(true);
    try {
      const client = getSupabaseClient();
      const sessionResult = await client.auth.getSession();
      if (!fresh(version)) return;
      if (sessionResult.error || sessionResult.data.session?.user.id !== userId) throw new Error('session');
      const { data, error } = await client.rpc('remove_account_device', {
        p_device_id: target.id,
      });
      if (!fresh(version)) return;
      if (error || data?.removed !== true) {
        const explanation = data?.reason === 'quota' ? 'Bạn đã dùng hết 2 lượt xóa thiết bị của tài khoản.'
          : data?.reason === 'current' ? 'Không thể xóa thiết bị đang sử dụng.'
            : 'Không thể xóa thiết bị. Vui lòng tải lại và thử lại.';
        // Keep the failure visible; refreshing used to clear it immediately.
        await load();
        if (!fresh(version)) return;
        setMessage({ kind: 'error', text: explanation });
      } else {
        setMessage({ kind: 'success', text: `Đã xóa ${target.device_name}. Tất cả profile trong nhóm này sẽ bị đăng xuất.` });
        await load();
      }
      if (!fresh(version)) return;
      setSelected(null);
    } catch {
      if (fresh(version)) {
        setMessage({ kind: 'error', text: 'Chưa thể xác nhận xóa thiết bị. Hãy làm mới danh sách trước khi thử lại.' });
        setSelected(null);
      }
    } finally {
      if (fresh(version)) { removalLock.current = false; setRemoving(false); }
    }
  };

  if (!authorized) return <Card className="rounded-2xl border-border p-5"><p role="status" className="text-sm text-muted-foreground">Tài khoản đã thay đổi. Hãy mở lại mục thiết bị trong tài khoản đang đăng nhập.</p></Card>;

  return (
    <Card className="overflow-hidden rounded-2xl border-border shadow-soft">
      <CardHeader className="border-b border-border p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle as="h2" className="flex items-center gap-2 text-xl font-bold text-foreground">
              <MonitorSmartphone aria-hidden="true" className="h-5 w-5 text-primary" /> Thiết bị đăng nhập
            </CardTitle>
          </div>
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading || removing || linkBusy} aria-label="Làm mới danh sách thiết bị" title="Làm mới danh sách thiết bị" className="h-11 w-11 shrink-0 p-0 sm:w-auto sm:px-3">
            <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} /><span className="hidden sm:inline">Làm mới</span>
          </Button>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Tối đa 2 nhóm điện thoại, 2 nhóm máy tính và 2 nhóm máy tính bảng. Các profile hoặc trình duyệt trên cùng thiết bị có thể liên kết khi bạn xác nhận.
        </p>
      </CardHeader>
      <CardContent className="space-y-5 p-5 sm:p-6">
        {!loadFailed && !loading && (
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-foreground">Lượt xóa/thay thế còn lại</span>
              <span className="shrink-0 font-bold tabular-nums text-primary">{remaining}/2 lượt</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              2 lượt cho toàn bộ vòng đời tài khoản. Đăng xuất không xóa thiết bị và không dùng lượt.
            </p>
          </div>
        )}

        {message && (
          <p role="status" className={`flex items-start gap-2 rounded-lg p-3 text-sm ${message.kind === 'error' ? 'bg-destructive-soft text-destructive' : 'bg-success-soft text-success'}`}>
            {message.kind === 'error' ? <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />}
            {message.text}
          </p>
        )}

        {loading ? (
          <div role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> Đang tải thiết bị...
          </div>
        ) : loadFailed ? null : groups.map((group) => {
          const entries = devices.filter((device) => device.device_type === group.type);
          return (
            <section key={group.type} aria-label={group.label} className="space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 font-semibold text-foreground">
                  <group.icon aria-hidden="true" className="h-4 w-4 text-primary" /> {group.label}
                </h3>
                <span className="rounded-md bg-muted/60 px-2 py-1 text-xs font-medium tabular-nums text-muted-foreground">{entries.length}/2 thiết bị</span>
              </div>
              {entries.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có thiết bị nào.</p>
              ) : entries.map((device) => {
                const current = isCurrent(device);
                return (
                  <div key={device.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 sm:p-4">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                        <span className="min-w-0 [overflow-wrap:anywhere]">{device.device_name}</span>
                        {current && <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">Thiết bị này</span>}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{device.profile_count ?? 1} profile trong nhóm</p>
                      <p className="mt-1.5 flex flex-wrap gap-x-1 text-xs leading-relaxed text-muted-foreground">
                        <span>Đăng nhập gần nhất:</span><time dateTime={device.last_login_at} className="tabular-nums">{formatDate(device.last_login_at)}</time>
                      </p>
                    </div>
                    {!current && (
                      <Button type="button" variant="ghost" disabled={remaining === 0 || removing || linkBusy} aria-label={`Xóa thiết bị ${device.device_name}`} title={remaining === 0 ? 'Đã dùng hết lượt xóa thiết bị' : `Xóa thiết bị ${device.device_name}`} onClick={() => { setMessage(null); setSelected(device); }} className="h-11 w-11 shrink-0 p-0 text-destructive hover:bg-destructive-soft hover:text-destructive sm:w-auto sm:px-3">
                        <Trash2 aria-hidden="true" className="h-4 w-4" /><span className="hidden sm:inline">Xóa thiết bị</span>
                      </Button>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
        <section aria-labelledby="device-link-heading" className="space-y-4 rounded-xl border border-border bg-surface p-4">
          <h3 id="device-link-heading" className="flex items-start gap-2 font-semibold text-foreground">
            <Link2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" /> Liên kết profile trên cùng thiết bị
          </h3>
          <p id="device-link-caution" className="text-sm leading-relaxed text-muted-foreground">
            Chỉ liên kết các profile hoặc trình duyệt trên cùng thiết bị vật lý, đã đăng nhập cùng tài khoản FlyDo và cùng loại thiết bị.
            Bạn tự xác nhận việc gộp nhóm; mã không chứng minh hai profile dùng cùng phần cứng. Không tự gộp theo IP hay thông tin trình duyệt.
            Liên kết không dùng lượt xóa và không cần nhập lại mật khẩu.
          </p>
          {!linkAvailable && <p role="status" className="text-sm text-muted-foreground">{missingLinkNotice}</p>}
          {!loading && !loadFailed && !currentDevice && <p role="status" className="text-sm text-muted-foreground">Profile này chưa được xác nhận đang hoạt động. Hãy làm mới danh sách trước khi liên kết.</p>}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">1. Tạo mã ở profile nguồn</p>
            <Button ref={linkTrigger} type="button" variant="outline" className="min-h-11 h-auto whitespace-normal py-2" disabled={!canLink || linkBusy || removing || (!!issued && !expired)} onClick={() => { dialogAction.current = 'create'; setLinkMessage(null); setLinkDialog('create'); }}>
              <Link2 aria-hidden="true" className="h-4 w-4 shrink-0" /> {issued ? 'Tạo mã mới' : 'Tạo mã liên kết'}
            </Button>
            {issued && (
              <div className="space-y-3 rounded-lg border border-border bg-elevated p-3">
                <p className="text-sm text-foreground [overflow-wrap:anywhere]">Profile nguồn: {issued.device_name}</p>
                <label htmlFor="issued-device-link" className="block text-sm font-medium text-foreground">Mã liên kết đã tạo</label>
                <input ref={codeField} id="issued-device-link" readOnly value={issued.code} autoComplete="off" spellCheck={false} aria-describedby="device-link-expiry device-link-caution" className="min-h-11 w-full min-w-0 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
                <p id="device-link-expiry" role="status" className="text-sm text-muted-foreground">
                  {expired ? 'Mã đã hết hạn. Tạo mã mới để tiếp tục.' : 'Mã dùng một lần, có hiệu lực 5 phút.'}
                  {' '}Hết hạn lúc: <time dateTime={issued.expires_at}>{new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(issued.expires_at))}</time>.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" className="min-h-11" disabled={linkBusy || expired || !canLink || removing} onClick={() => void copyCode()}>
                    <Copy aria-hidden="true" className="h-4 w-4" /> Sao chép mã
                  </Button>
                  <Button type="button" variant="ghost" className="min-h-11" disabled={linkBusy || removing} onClick={() => void actOnLink('cancel')}>
                    <X aria-hidden="true" className="h-4 w-4" /> Hủy mã và đóng
                  </Button>
                </div>
              </div>
            )}
          </div>
          <form className="space-y-3 border-t border-border pt-4" onSubmit={(event) => {
            event.preventDefault();
            if (!canLink || linkLock.current || removing) return;
            if (!uuidPattern.test(pastedCode.trim())) { setLinkMessage({ kind: 'error', text: linkReasons.invalid }); pasteField.current?.focus(); return; }
            dialogAction.current = 'redeem'; setLinkMessage(null); setLinkDialog('redeem');
          }}>
            <p className="text-sm font-medium text-foreground">2. Dán mã ở profile cần liên kết</p>
            <label htmlFor="pasted-device-link" className="block text-sm font-medium text-foreground">Mã từ profile khác</label>
            <input ref={pasteField} id="pasted-device-link" value={pastedCode} onChange={(event) => setPastedCode(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} disabled={linkBusy || removing} aria-describedby={`device-link-caution${linkMessage?.kind === 'error' ? ' device-link-message' : ''}`} aria-invalid={linkMessage?.kind === 'error' || undefined} className="min-h-11 w-full min-w-0 rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50" />
            <p className="text-sm leading-relaxed text-muted-foreground">Có thể gộp nhóm trùng đang hoạt động. Mỗi nhóm có tối đa 20 profile; các profile giữ phiên đăng nhập riêng.</p>
            <Button type="submit" className="min-h-11" disabled={!canLink || !pastedCode.trim() || linkBusy || removing}>
              {linkBusy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Link2 aria-hidden="true" className="h-4 w-4" />} Liên kết profile
            </Button>
          </form>
          {linkMessage && <p id="device-link-message" role={linkMessage.kind === 'error' ? 'alert' : 'status'} className={`rounded-lg p-3 text-sm leading-relaxed ${linkMessage.kind === 'error' ? 'bg-destructive-soft text-destructive' : 'bg-success-soft text-success'}`}>{linkMessage.text}</p>}
        </section>
      </CardContent>

      <AlertDialog open={!!linkDialog} onOpenChange={(open) => { if (!open && !linkBusy) setLinkDialog(null); }}>
        <AlertDialogContent onCloseAutoFocus={(event) => { event.preventDefault(); (dialogAction.current === 'redeem' ? pasteField.current : issuedRef.current ? codeField.current : linkTrigger.current)?.focus(); }}>
          <AlertDialogHeader>
            <AlertDialogTitle>{linkDialog === 'redeem' ? 'Xác nhận gộp nhóm profile?' : 'Tạo mã liên kết profile?'}</AlertDialogTitle>
            <AlertDialogDescription>
              Tôi xác nhận các profile được liên kết nằm trên cùng thiết bị vật lý, cùng tài khoản FlyDo và cùng loại thiết bị.
              Việc gộp do tôi cho phép; mã không chứng minh cùng phần cứng.
              {linkDialog === 'redeem' ? ' Profile này sẽ gia nhập nhóm nguồn, kể cả khi đang thuộc một nhóm riêng. Liên kết không dùng lượt xóa và giữ các phiên đăng nhập riêng.' : ' Mã chỉ dùng một lần trong 5 phút. Tạo mã mới sẽ vô hiệu hóa mã cũ từ profile này. Chỉ dán mã vào profile trên cùng máy.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={linkBusy} className="min-h-11">Quay lại</AlertDialogCancel>
            <AlertDialogAction disabled={linkBusy || !canLink} className="min-h-11 h-auto whitespace-normal py-2" onClick={(event) => { event.preventDefault(); if (linkDialog) void actOnLink(linkDialog); }}>
              {linkBusy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
              {linkDialog === 'redeem' ? 'Xác nhận liên kết' : 'Xác nhận tạo mã'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!selected} onOpenChange={(open) => { if (!open && !removing) setSelected(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa thiết bị này?</AlertDialogTitle>
            <AlertDialogDescription>
              {selected?.device_name} sẽ mất quyền đăng nhập và bạn dùng 1 trong 2 lượt xóa thiết bị của tài khoản.
              {' '}Tất cả profile đã liên kết trong nhóm này sẽ bị đăng xuất.
              Lượt đã dùng không thể khôi phục.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing} className="min-h-11">Giữ lại</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); void removeSelected(); }} disabled={removing || linkBusy} className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {removing ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Trash2 aria-hidden="true" className="h-4 w-4" />}
              Xác nhận xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
