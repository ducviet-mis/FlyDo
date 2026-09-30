'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { translateAuthError, useAuthStore } from '@/features/auth/stores/auth-store';
import { getSupabaseClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  User as UserIcon, Shield, Camera, Save, Eye, EyeOff,
  LogOut, Loader2, CheckCircle, AlertCircle, CalendarDays, Phone, Mail,
  Crown, ArrowRight, Infinity as InfinityIcon, PlaneTakeoff
} from 'lucide-react';
import { AccountTierBadge } from '@/features/subscription/components/account-tier-badge';
import { GiftCodeForm } from '@/features/subscription/components/gift-code-form';
import { ReferralProgram } from '@/features/subscription/components/referral-program';
import { ACCOUNT_TIER_META } from '@/features/subscription/config';
import { formatExpiryDate, getEffectiveAccountTier } from '@/features/subscription/utils';
import { isAdminEmail } from '@/features/auth/lib/is-admin-email';
import { AccountDevices } from '@/features/auth/components/account-devices';

type Tab = 'personal' | 'membership' | 'security';

export default function ProfilePage() {
  const { user, refreshUser, logoutAllDevices } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>('personal');

  if (!user) {
    return (
      <div className="container py-12 text-center">
        <p className="text-muted-foreground">Vui lòng đăng nhập để xem thông tin tài khoản.</p>
      </div>
    );
  }

  const tabs = [
    { id: 'personal' as Tab, label: 'Thông tin cá nhân', mobileLabel: 'Cá nhân', icon: UserIcon },
    { id: 'membership' as Tab, label: 'Gói tài khoản', mobileLabel: 'Gói tài khoản', icon: Crown },
    { id: 'security' as Tab, label: 'Bảo mật', mobileLabel: 'Bảo mật', icon: Shield },
  ];

  return (
    <div className="container max-w-5xl py-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold sm:text-[34px]">Cài đặt tài khoản</h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Quản lý thông tin, gói sử dụng và bảo mật của bạn.</p>
        </div>
        {isAdminEmail(user.email) && <Button asChild variant="outline" className="min-h-11 md:hidden"><Link href="/admin"><Shield className="h-4 w-4" aria-hidden="true" />Quản trị</Link></Button>}
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar */}
        <nav aria-label="Cài đặt tài khoản" className="w-full shrink-0 md:sticky md:top-24 md:w-52 md:self-start">
          <div className="grid grid-cols-3 gap-1 rounded-2xl border bg-card p-1.5 md:flex md:flex-col">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)} aria-pressed={activeTab === tab.id} aria-controls="profile-settings-panel"
                className={`sol-profile-tab flex min-h-14 min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:min-h-12 md:flex-row md:justify-start md:gap-2.5 md:px-4 ${
                  activeTab === tab.id
                    ? 'bg-primary-soft text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <tab.icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                {tab.mobileLabel === tab.label ? tab.label : <>
                  <span className="md:hidden">{tab.mobileLabel}</span>
                  <span className="hidden md:inline">{tab.label}</span>
                </>}
              </button>
            ))}
          </div>
        </nav>

        {/* Content */}
        <div id="profile-settings-panel" role="region" aria-label={tabs.find((tab) => tab.id === activeTab)?.label} className="min-w-0 flex-1">
          {activeTab === 'personal' && <PersonalInfoTab key={user.id} user={user} refreshUser={refreshUser} />}
          {activeTab === 'membership' && <MembershipTab user={user} />}
          {activeTab === 'security' && <SecurityTab key={user.id} userId={user.id} logoutAllDevices={logoutAllDevices} />}
        </div>
      </div>
    </div>
  );
}

// ─── Personal Info Tab ───────────────────────────────────────────
function PersonalInfoTab({ user, refreshUser }: { user: any; refreshUser: () => Promise<void> }) {
  const [name, setName] = useState(user.name || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [birthDate, setBirthDate] = useState(user.birthDate || '');
  const [avatarPreview, setAvatarPreview] = useState(user.avatarUrl || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const saveLock = useRef(false);
  const avatarLock = useRef(false);
  const avatarInput = useRef<HTMLInputElement>(null);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || avatarLock.current) return;
    e.target.value = '';
    setProfileError('');
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
      setProfileError('Vui lòng chọn ảnh PNG, JPEG, WebP hoặc GIF.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setProfileError('Ảnh quá lớn. Vui lòng chọn ảnh dưới 2MB.');
      return;
    }
    avatarLock.current = true;
    setAvatarSaving(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string'
          ? resolve(reader.result) : reject(new Error('Invalid image'));
        reader.onerror = reader.onabort = () => reject(new Error('Image read failed'));
        reader.readAsDataURL(file);
      });
      const supabase = getSupabaseClient();
      const { error } = await supabase.from('profiles').update({ avatar_url: base64 }).eq('id', user.id);
      if (error) throw error;
      setAvatarPreview(base64);
      await refreshUser();
    } catch {
      setProfileError('Chưa thể lưu ảnh đại diện. Kiểm tra kết nối rồi thử lại.');
    } finally {
      avatarLock.current = false;
      setAvatarSaving(false);
    }
  };

  const handleSave = async () => {
    if (saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    setSaved(false);
    setProfileError('');
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from('profiles').update({
        name, phone, birth_date: birthDate || null,
      }).eq('id', user.id);
      if (error) throw error;
      await refreshUser();
      setSaved(true);
    } catch {
      setProfileError('Chưa thể lưu thông tin. Thay đổi của bạn vẫn ở đây; hãy thử lại khi có mạng.');
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  const words = name ? name.trim().split(/\s+/) : [];
  const initials = words.length > 1
    ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
    : words.length === 1
      ? words[0].slice(0, 2).toUpperCase()
      : 'U';
  const accountTier = getEffectiveAccountTier(user);

  return (
    <Card className="overflow-hidden rounded-2xl border-border shadow-soft">
      <CardHeader className="border-b border-border p-5 sm:p-6">
        <CardTitle as="h2" className="flex items-center gap-2 text-xl font-bold text-foreground">
          <UserIcon aria-hidden="true" className="h-5 w-5 text-primary" /> Thông tin cá nhân
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5 sm:p-6">
        <form onSubmit={(event) => { event.preventDefault(); void handleSave(); }} className="space-y-6">
        {profileError && <p role="alert" className="rounded-xl bg-destructive-soft p-3 text-sm text-destructive">{profileError}</p>}
        {/* Avatar */}
        <div className="flex items-start gap-4 border-b border-border pb-6 sm:items-center sm:gap-5">
          <Avatar className="h-20 w-20 shrink-0 border-2 border-border">
            <AvatarImage src={avatarPreview} alt="Ảnh đại diện" className="object-cover" />
            <AvatarFallback className="bg-primary-soft text-2xl font-bold text-primary">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="min-w-0 text-lg font-bold text-foreground [overflow-wrap:anywhere]">{name || 'Ảnh đại diện của bạn'}</p>
              <AccountTierBadge tier={accountTier} />
            </div>
            <Button type="button" variant="outline" disabled={avatarSaving} onClick={() => avatarInput.current?.click()} aria-describedby="profile-avatar-hint">
              {avatarSaving ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Camera aria-hidden="true" className="h-4 w-4" />}
              {avatarSaving ? 'Đang lưu ảnh...' : 'Đổi ảnh đại diện'}
            </Button>
            <input ref={avatarInput} aria-label="Chọn ảnh đại diện" type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={avatarSaving} className="hidden" onChange={handleAvatarChange} />
            <p id="profile-avatar-hint" className="mt-2 text-xs leading-relaxed text-muted-foreground">PNG, JPEG, WebP hoặc GIF · tối đa 2 MB. Ảnh được lưu ngay khi chọn.</p>
          </div>
        </div>

        {/* Form fields */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="space-y-2.5">
            <Label htmlFor="profile-name" className="flex items-center gap-2 text-foreground font-semibold"><UserIcon aria-hidden="true" className="w-4 h-4 text-muted-foreground" /> Họ và tên</Label>
            <Input id="profile-name" autoComplete="name" value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} placeholder="Nhập họ và tên" className="bg-surface border-control h-12 px-4 text-base rounded-md focus-visible:ring-primary" />
          </div>

          <div className="space-y-2.5">
            <Label htmlFor="profile-email" className="flex items-center gap-2 text-foreground font-semibold"><Mail aria-hidden="true" className="w-4 h-4 text-muted-foreground" /> Email</Label>
            <Input id="profile-email" value={user.email} readOnly aria-describedby="profile-email-hint" className="h-12 rounded-md border-border bg-muted/40 px-4 text-base text-muted-foreground" />
            <p id="profile-email-hint" className="text-xs text-muted-foreground">Email đăng nhập không thể thay đổi.</p>
          </div>

          <div className="space-y-2.5">
            <Label htmlFor="profile-phone" className="flex items-center gap-2 text-foreground font-semibold"><Phone aria-hidden="true" className="w-4 h-4 text-muted-foreground" /> Số điện thoại</Label>
            <Input id="profile-phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setSaved(false); }} placeholder="0901234567" className="bg-surface border-control h-12 px-4 text-base rounded-md focus-visible:ring-primary" />
          </div>

          <div className="space-y-2.5">
            <Label htmlFor="profile-birth" className="flex items-center gap-2 text-foreground font-semibold"><CalendarDays aria-hidden="true" className="w-4 h-4 text-muted-foreground" /> Ngày sinh</Label>
            <Input id="profile-birth" type="date" value={birthDate} onChange={(e) => { setBirthDate(e.target.value); setSaved(false); }} className="bg-surface border-control h-12 px-4 text-base rounded-md focus-visible:ring-primary" />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-5">
          {saved && <p role="status" className="text-sm text-success">Đã lưu thay đổi.</p>}
          <Button type="submit" disabled={saving} className="w-full sm:w-auto">
            {saving ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Save aria-hidden="true" className="h-4 w-4" />}
            {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </Button>
        </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Membership Tab ─────────────────────────────────────────────
function MembershipTab({ user }: { user: any }) {
  const tier = getEffectiveAccountTier(user);
  const expiryDate = tier === 'flymax' ? formatExpiryDate(user.subscriptionExpiresAt) : null;
  const TierIcon = tier === 'flyinfinity' ? InfinityIcon : tier === 'flymax' ? Crown : PlaneTakeoff;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden rounded-2xl border-border shadow-soft">
        <CardHeader className="border-b border-border p-5 sm:p-6">
          <CardTitle as="h2" className="flex items-center gap-2 text-xl font-bold">
            <Crown aria-hidden="true" className="h-5 w-5 text-primary" /> Gói đang sử dụng
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tier === 'flyinfinity' ? 'bg-special-soft text-special' : tier === 'flymax' ? 'bg-primary-soft text-primary' : 'bg-muted text-foreground'}`}>
                <TierIcon aria-hidden="true" className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <AccountTierBadge tier={tier} />
                  <span className="text-sm text-muted-foreground">{ACCOUNT_TIER_META[tier].shortDescription}</span>
                </div>
                {expiryDate && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
                      Có hiệu lực đến
                    </span>
                    <time className="font-bold tabular-nums text-foreground">{expiryDate}</time>
                  </div>
                )}
                {tier === 'flyinfinity' && <p className="mt-2 text-sm font-medium text-foreground">Không giới hạn thời gian sử dụng</p>}
              </div>
            </div>
          <div className="flex flex-col gap-2 border-t border-border pt-5 sm:flex-row sm:flex-wrap sm:justify-end">
            {tier === 'flymax' ? (
              <>
                <Button asChild variant="outline" className="min-h-11">
                  <Link href="/pricing">Gia hạn FlyMax<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
                </Button>
                <Button asChild className="min-h-11">
                  <Link href="/pricing">Nâng cấp FlyInfinity<InfinityIcon aria-hidden="true" className="h-4 w-4" /></Link>
                </Button>
              </>
            ) : (
              <Button asChild className="min-h-11">
                <Link href="/pricing">{tier === 'flygo' ? 'Nâng cấp tài khoản' : 'Xem các gói'}<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-border shadow-soft">
        <CardContent className="p-5 sm:p-6"><GiftCodeForm compact /></CardContent>
      </Card>
      <ReferralProgram />
    </div>
  );
}

// ─── Security Tab ────────────────────────────────────────────────
function SecurityTab({ userId, logoutAllDevices }: { userId: string; logoutAllDevices: () => Promise<void> }) {
  const router = useRouter();
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const logoutLock = useRef(false);
  const [logoutError, setLogoutError] = useState('');

  const handleChangePassword = async () => {
    setMessage(null);
    if (newPass.length < 6) {
      setMessage({ type: 'error', text: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
      return;
    }
    if (newPass !== confirmPass) {
      setMessage({ type: 'error', text: 'Xác nhận mật khẩu không khớp.' });
      return;
    }

    setSaving(true);
    try {
      const supabase = getSupabaseClient();

      // Verify old password by signing in
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('No user');

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: oldPass,
      });

      if (signInErr) {
        setMessage({ type: 'error', text: 'Mật khẩu cũ không đúng.' });
        setSaving(false);
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) {
        setMessage({ type: 'error', text: translateAuthError(error.message) });
      } else {
        setMessage({ type: 'success', text: 'Đổi mật khẩu thành công!' });
        setOldPass('');
        setNewPass('');
        setConfirmPass('');
      }
    } catch {
      setMessage({ type: 'error', text: 'Đã xảy ra lỗi.' });
    }
    setSaving(false);
  };

  const handleLogoutAll = async () => {
    if (logoutLock.current) return;
    logoutLock.current = true;
    setLoggingOut(true);
    setLogoutError('');
    try {
      await logoutAllDevices();
      router.replace('/login');
    } catch {
      setLogoutError('Chưa thể đăng xuất tất cả thiết bị. Kiểm tra kết nối rồi thử lại.');
    } finally {
      logoutLock.current = false;
      setLoggingOut(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Change Password */}
      <Card className="overflow-hidden rounded-2xl border-border shadow-soft">
        <CardHeader className="border-b border-border p-5 sm:p-6">
          <CardTitle as="h2" className="flex items-center gap-2 text-xl font-bold text-foreground">
            <Shield aria-hidden="true" className="h-5 w-5 text-primary" /> Đổi mật khẩu
          </CardTitle>
          <p className="text-sm leading-relaxed text-muted-foreground">Sử dụng mật khẩu riêng cho tài khoản FlyDo của bạn.</p>
        </CardHeader>
        <CardContent className="p-5 sm:p-6">
          <form onSubmit={(event) => { event.preventDefault(); if (!saving && oldPass && newPass && confirmPass) void handleChangePassword(); }} className="space-y-5">
          {message && (
            <div role={message.type === 'error' ? 'alert' : 'status'} className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
              message.type === 'success'
                ? 'bg-success-soft text-success'
                : 'bg-destructive-soft text-destructive'
            }`}>
              {message.type === 'success' ? <CheckCircle aria-hidden="true" className="h-4 w-4 shrink-0" /> : <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />}
              {message.text}
            </div>
          )}

          <div className="space-y-2.5">
            <Label htmlFor="profile-old-password" className="text-foreground font-semibold">Mật khẩu cũ</Label>
            <div className="relative">
              <Input id="profile-old-password" autoComplete="current-password" type={showOld ? 'text' : 'password'} value={oldPass} onChange={(e) => setOldPass(e.target.value)} placeholder="Nhập mật khẩu cũ" className="pr-12 bg-surface border-control h-12 px-4 text-base rounded-md focus-visible:ring-primary" />
              <button type="button" className="absolute right-1 top-1/2 flex h-11 w-11 items-center justify-center -translate-y-1/2 rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={showOld ? "Ẩn mật khẩu cũ" : "Hiện mật khẩu cũ"} aria-pressed={showOld} onClick={() => setShowOld(!showOld)}>
                {showOld ? <EyeOff aria-hidden="true" className="w-5 h-5" /> : <Eye aria-hidden="true" className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2.5">
            <Label htmlFor="profile-new-password" className="text-foreground font-semibold">Mật khẩu mới</Label>
            <div className="relative">
              <Input id="profile-new-password" autoComplete="new-password" aria-describedby="profile-password-hint" type={showNew ? 'text' : 'password'} value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="Nhập mật khẩu mới" className="pr-12 bg-surface border-control h-12 px-4 text-base rounded-md focus-visible:ring-primary" />
              <button type="button" className="absolute right-1 top-1/2 flex h-11 w-11 items-center justify-center -translate-y-1/2 rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={showNew ? "Ẩn mật khẩu mới" : "Hiện mật khẩu mới"} aria-pressed={showNew} onClick={() => setShowNew(!showNew)}>
                {showNew ? <EyeOff aria-hidden="true" className="w-5 h-5" /> : <Eye aria-hidden="true" className="w-5 h-5" />}
              </button>
            </div>
            <p id="profile-password-hint" className="text-xs text-muted-foreground">Tối thiểu 6 ký tự.</p>
          </div>

          <div className="space-y-2.5">
            <Label htmlFor="profile-confirm-password" className="text-foreground font-semibold">Xác nhận mật khẩu mới</Label>
            <Input id="profile-confirm-password" autoComplete="new-password" type="password" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} placeholder="Nhập lại mật khẩu mới" className="bg-surface border-control h-12 px-4 text-base rounded-md focus-visible:ring-primary" />
          </div>
          </div>

          <div className="flex justify-end border-t border-border pt-5">
            <Button type="submit" disabled={saving || !oldPass || !newPass || !confirmPass} className="w-full sm:w-auto">
              {saving ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Shield aria-hidden="true" className="h-4 w-4" />}
              {saving ? 'Đang xử lý...' : 'Đổi mật khẩu'}
            </Button>
          </div>
          </form>
        </CardContent>
      </Card>

      <AccountDevices userId={userId} />

      {/* Logout All Devices */}
      <Card className="rounded-2xl border-destructive/30 shadow-soft">
        <CardHeader className="p-5 pb-0 sm:p-6 sm:pb-0">
          <CardTitle as="h2" className="flex items-center gap-2 text-lg text-foreground">
            <LogOut aria-hidden="true" className="h-5 w-5 shrink-0 text-destructive" /> Đăng xuất trên tất cả thiết bị
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-3 sm:p-6 sm:pt-3">
          <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
            Hành động này sẽ kết thúc các phiên đăng nhập. Danh sách thiết bị đã ghi nhận và 2 lượt xóa thiết bị không thay đổi.
          </p>
          <div className="flex justify-end">
          <Button variant="outline" onClick={handleLogoutAll} disabled={loggingOut} className="h-auto min-h-11 w-full whitespace-normal border-destructive/40 text-destructive hover:bg-destructive-soft hover:text-destructive sm:w-auto">
            {loggingOut ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <LogOut aria-hidden="true" className="h-4 w-4" />}
            {loggingOut ? 'Đang đăng xuất...' : 'Đăng xuất tất cả thiết bị'}
          </Button>
          </div>
          {logoutError && <p role="alert" className="mt-3 text-sm text-destructive">{logoutError}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
