'use client';

import { AdminCreatePanel } from '@/components/admin/create-panel';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2, Megaphone, Send, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { isAdminEmail } from '@/features/auth/lib/is-admin-email';
import { getSupabaseClient } from '@/lib/supabase/client';

type NotificationRecord = {
  id: string;
  title: string;
  body: string;
  target_email: string | null;
  action_url: string | null;
  is_active: boolean;
  created_at: string;
};

function displayDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function AdminNotificationsPage() {
  const user = useAuthStore((state) => state.user);
  const isAdmin = isAdminEmail(user?.email);
  const [accessReady, setAccessReady] = useState<boolean | null>(null);
  const [history, setHistory] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [actionUrl, setActionUrl] = useState('');
  const [audience, setAudience] = useState<'all' | 'user'>('all');
  const [targetEmail, setTargetEmail] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [retractTarget, setRetractTarget] = useState<NotificationRecord | null>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    const supabase = getSupabaseClient();
    const { data: canManage, error: accessError } = await supabase.rpc('flydo_is_notification_admin');
    if (accessError || canManage !== true) {
      setAccessReady(false);
      setError(accessError?.code === 'PGRST202'
        ? 'Chưa cài đặt thông báo. Hãy chạy src/lib/supabase/notifications.sql trong Supabase SQL Editor.'
        : 'Supabase chưa xác nhận quyền ADMIN để quản lý thông báo.');
      setLoading(false);
      return;
    }
    setAccessReady(true);
    const { data, error: listError } = await supabase.from('app_notifications')
      .select('id,title,body,target_email,action_url,is_active,created_at')
      .order('created_at', { ascending: false }).limit(50);
    if (listError) setError('Không thể tải lịch sử thông báo. Vui lòng thử lại.');
    else {
      setHistory((data || []) as NotificationRecord[]);
      setError('');
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (isAdmin) void loadHistory(); }, [isAdmin, loadHistory]);

  const validate = () => {
    if (!title.trim() || title.trim().length > 120) return 'Tiêu đề cần từ 1 đến 120 ký tự.';
    if (!body.trim() || body.trim().length > 2000) return 'Nội dung cần từ 1 đến 2.000 ký tự.';
    if (audience === 'user' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail.trim())) return 'Hãy nhập email học sinh hợp lệ.';
    if (actionUrl.trim() && (!/^\/(?!\/)[^\s]*$/.test(actionUrl.trim()) || actionUrl.trim().length > 300)) return 'Liên kết phải là đường dẫn nội bộ bắt đầu bằng /, tối đa 300 ký tự.';
    return '';
  };

  const askToSend = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!isAdmin || accessReady !== true) return;
    const issue = validate();
    if (issue) return setError(issue);
    setConfirmOpen(true);
  };

  const sendNow = async () => {
    if (saving || !isAdmin || accessReady !== true) return;
    setSaving(true);
    const supabase = getSupabaseClient();
    let targetUserId: string | null = null;
    const normalizedEmail = targetEmail.trim().toLowerCase();
    if (audience === 'user') {
      const { data, error: lookupError } = await supabase.from('profiles')
        .select('id').eq('email', normalizedEmail).maybeSingle();
      if (lookupError || !data) {
        setError('Không tìm thấy tài khoản với email này. Kiểm tra lại trước khi gửi.');
        setSaving(false);
        setConfirmOpen(false);
        return;
      }
      targetUserId = data.id;
    }

    const { error: insertError } = await supabase.from('app_notifications').insert({
      title: title.trim(), body: body.trim(),
      action_url: actionUrl.trim() || null,
      target_user_id: targetUserId,
      target_email: targetUserId ? normalizedEmail : null,
    });
    setSaving(false);
    setConfirmOpen(false);
    if (insertError) {
      setError(insertError.code === '42501'
        ? 'Supabase đã từ chối quyền gửi. Kiểm tra lại chính sách trong notifications.sql.'
        : `Không thể gửi thông báo: ${insertError.message}`);
      return;
    }
    setSuccess(`Đã gửi thông báo ${audience === 'all' ? 'cho toàn bộ học sinh' : `cho ${normalizedEmail}`}.`);
    setTitle(''); setBody(''); setActionUrl(''); setTargetEmail('');
    await loadHistory();
  };

  const retract = async () => {
    if (!retractTarget || busyId) return;
    setBusyId(retractTarget.id);
    const { error: updateError } = await getSupabaseClient().from('app_notifications')
      .update({ is_active: false }).eq('id', retractTarget.id);
    setBusyId(null);
    setRetractTarget(null);
    if (updateError) setError('Không thể thu hồi thông báo. Vui lòng thử lại.');
    else {
      setSuccess('Đã thu hồi thông báo. Học sinh sẽ không còn thấy nội dung này.');
      await loadHistory();
    }
  };

  if (!isAdmin) return null;

  return <div className="space-y-6">
    {error && <p role="alert" className="rounded-lg bg-destructive-soft p-3 text-sm text-destructive">{error}</p>}
    {success && <p role="status" className="flex items-center gap-2 rounded-lg bg-success-soft p-3 text-sm text-success"><CheckCircle2 aria-hidden="true" className="h-4 w-4" />{success}</p>}
    {accessReady === false && <Button type="button" variant="outline" onClick={() => void loadHistory()} disabled={loading}>Kiểm tra lại quyền</Button>}
    <AdminCreatePanel title="Soạn thông báo" actionLabel="Tạo thông báo" description="Kiểm tra người nhận và nội dung trước khi xác nhận gửi tới học sinh.">
      <CardContent className="space-y-5">
        <form onSubmit={askToSend} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="notification-title">Tiêu đề</Label>
            <Input id="notification-title" required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ví dụ: Đã có đề thi thử mới" className="h-11" disabled={accessReady !== true} />
            <p className="text-right text-xs tabular-nums text-muted-foreground">{title.length}/120</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notification-body">Nội dung</Label>
            <Textarea id="notification-body" required maxLength={2000} rows={5} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Viết nội dung ngắn gọn, rõ ràng cho học sinh..." disabled={accessReady !== true} />
            <p className="text-right text-xs tabular-nums text-muted-foreground">{body.length}/2.000</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="notification-audience">Người nhận</Label>
              <Select value={audience} onValueChange={(value: 'all' | 'user') => setAudience(value)} disabled={accessReady !== true}>
                <SelectTrigger id="notification-audience" className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">Toàn bộ học sinh</SelectItem><SelectItem value="user">Một tài khoản</SelectItem></SelectContent>
              </Select>
            </div>
            {audience === 'user' && <div className="space-y-2">
              <Label htmlFor="notification-email">Email tài khoản</Label>
              <Input id="notification-email" type="email" required autoComplete="off" value={targetEmail} onChange={(event) => setTargetEmail(event.target.value)} placeholder="hocsinh@example.com" className="h-11" disabled={accessReady !== true} />
            </div>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="notification-url">Liên kết trong FlyDo (không bắt buộc)</Label>
            <Input id="notification-url" maxLength={300} value={actionUrl} onChange={(event) => setActionUrl(event.target.value)} placeholder="/practice?grade=8" className="h-11" disabled={accessReady !== true} />
            <p className="text-xs text-muted-foreground">Chỉ dùng đường dẫn nội bộ bắt đầu bằng /.</p>
          </div>
          <Button type="submit" disabled={accessReady !== true || saving} className="min-h-11"><Send aria-hidden="true" className="h-4 w-4" /> Gửi thông báo</Button>
        </form>
      </CardContent>
    </AdminCreatePanel>

    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2"><Megaphone aria-hidden="true" className="h-5 w-5 text-primary" /> Lịch sử thông báo</CardTitle>
        <CardDescription>50 thông báo gần nhất. Thu hồi sẽ ẩn thông báo khỏi hộp thư học sinh.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="admin-record-list">
        {loading ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Đang tải...</p>
          : history.length === 0 ? <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">Chưa gửi thông báo nào.</p>
            : history.map((item) => <article key={item.id} className="admin-record">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-foreground">{item.title}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.is_active ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground'}`}>{item.is_active ? 'Đang hiển thị' : 'Đã thu hồi'}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.body}</p>
                  <p className="mt-3 text-xs text-muted-foreground">{item.target_email || 'Toàn bộ học sinh'} · <time dateTime={item.created_at}>{displayDate(item.created_at)}</time>{item.action_url ? ` · ${item.action_url}` : ''}</p>
                </div>
                {item.is_active && <Button type="button" variant="outline" className="min-h-11" disabled={busyId !== null} onClick={() => setRetractTarget(item)}><Undo2 aria-hidden="true" className="h-4 w-4" /> Thu hồi</Button>}
              </div>
            </article>)}
        </div>
      </CardContent>
    </Card>

    <AlertDialog open={confirmOpen} onOpenChange={(open) => { if (!saving) setConfirmOpen(open); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Xác nhận gửi thông báo?</AlertDialogTitle>
          <AlertDialogDescription>{audience === 'all' ? 'Thông báo này sẽ gửi cho toàn bộ học sinh.' : `Thông báo này sẽ gửi riêng cho ${targetEmail.trim()}.`} Hãy kiểm tra tiêu đề và nội dung trước khi gửi.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={saving}>Quay lại</AlertDialogCancel><AlertDialogAction onClick={(event) => { event.preventDefault(); void sendNow(); }} disabled={saving}>{saving ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Send aria-hidden="true" className="h-4 w-4" />} Gửi ngay</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={!!retractTarget} onOpenChange={(open) => { if (!open && !busyId) setRetractTarget(null); }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Thu hồi thông báo?</AlertDialogTitle><AlertDialogDescription>“{retractTarget?.title}” sẽ biến mất khỏi hộp thư học sinh. Trạng thái đã đọc vẫn được lưu.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={!!busyId}>Giữ lại</AlertDialogCancel><AlertDialogAction onClick={(event) => { event.preventDefault(); void retract(); }} disabled={!!busyId} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Thu hồi</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
