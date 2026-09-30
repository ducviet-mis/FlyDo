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
import { Separator } from '@/components/ui/separator';
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
    { id: 'personal' as Tab, label: 'Thông tin cá nhân', icon: UserIcon },
    { id: 'membership' as Tab, label: 'Gói tài khoản', icon: Crown },
    { id: 'security' as Tab, label: 'Bảo mật', icon: Shield },
  ];

  return (
    <div className="container max-w-5xl py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] font-bold sm:text-[34px]">Cài đặt tài khoản</h1>
        {isAdminEmail(user.email) && <Button asChild variant="outline" className="min-h-11 md:hidden"><Link href="/admin"><Shield className="h-4 w-4" aria-hidden="true" />Quản trị</Link></Button>}
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar */}
        <nav className="w-full md:w-56 shrink-0">
          <div className="flex flex-row md:flex-col gap-2 p-1.5 bg-card border rounded-2xl overflow-x-auto snap-x [&::-webkit-scrollbar]:hidden">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)} aria-pressed={activeTab === tab.id}
                className={`sol-profile-tab flex items-center justify-center md:justify-start gap-2.5 px-5 py-3 rounded-xl text-sm font-semibold transition-all whitespace-nowrap snap-start flex-1 md:flex-none ${
                  activeTab === tab.id
                    ? 'bg-primary-soft text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <tab.icon className="w-4 h-4 shrink-0" />
                {tab.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
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
    <Card className="rounded-2xl md:rounded-xl border-border shadow-soft">
      <CardHeader className="pb-4 border-b border-border mb-6">
        <CardTitle className="flex items-center gap-2 text-xl md:text-2xl font-bold text-foreground">
          <UserIcon className="w-5 h-5 md:w-6 md:h-6 text-primary" /> Thông tin cá nhân
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-8 px-4 md:px-8">
        {profileError && <p role="alert" className="rounded-xl bg-destructive-soft p-3 text-sm text-destructive">{profileError}</p>}
        {/* Avatar */}
        <div className="flex flex-wrap items-center gap-6">
          <div className="relative group">
            <Avatar className="w-20 h-20 md:w-24 md:h-24 border-[3px] border-border shadow-card">
              <AvatarImage src={avatarPreview} className="object-cover" />
              <AvatarFallback className="text-2xl font-bold bg-primary text-primary-foreground">{initials}</AvatarFallback>
            </Avatar>
            <label className="absolute inset-0 flex items-center justify-center bg-overlay/60 rounded-full opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 cursor-pointer transition-opacity backdrop-blur-sm">
              {avatarSaving ? <Loader2 className="h-6 w-6 animate-spin text-white" aria-hidden="true" /> : <Camera className="w-6 h-6 text-white" aria-hidden="true" />}
              <input aria-label="Đổi ảnh đại diện" type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={avatarSaving} className="sr-only" onChange={handleAvatarChange} />
            </label>
          </div>
          <div>
            <h3 className="font-bold text-xl md:text-2xl text-foreground mb-2">{name}</h3>
            <div className="flex flex-wrap items-center gap-2">
              <AccountTierBadge tier={accountTier} />
            </div>
          </div>
        </div>

        <Separator className="bg-muted" />

        {/* Form fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2.5">
            <Label htmlFor="profile-name" className="flex items-center gap-2 text-foreground font-semibold"><UserIcon className="w-4 h-4 text-muted-foreground" /> Họ và tên</Label>
            <Input id="profile-name" autoComplete="name" value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} placeholder="Nhập họ và tên" className="bg-surface border-control h-12 px-4 text-base rounded-md focus-visible:ring-primary" />
          </div>

          <div className="space-y-2.5">
            <Label htmlFor="profile-email" className="flex items-center gap-2 text-foreground font-semibold"><Mail className="w-4 h-4 text-muted-foreground" /> Email</Label>
            <Input id="profile-email" value={user.email} disabled className="opacity-70 bg-surface border-transparent h-12 px-5 text-base font-medium rounded-md" />
            <p className="text-xs text-muted-foreground font-medium px-1">Email không thể thay đổi</p>
          </div>

          <div className="space-y-2.5">
            <Label htmlFor="profile-phone" className="flex items-center gap-2 text-foreground font-semibold"><Phone className="w-4 h-4 text-muted-foreground" /> Số điện thoại</Label>
            <Input id="profile-phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setSaved(false); }} placeholder="0901234567" className="bg-surface border-control h-12 px-4 text-base rounded-md focus-visible:ring-primary" />
          </div>

          <div className="space-y-2.5">
            <Label htmlFor="profile-birth" className="flex items-center gap-2 text-foreground font-semibold"><CalendarDays className="w-4 h-4 text-muted-foreground" /> Ngày sinh</Label>
            <Input id="profile-birth" type="date" value={birthDate} onChange={(e) => { setBirthDate(e.target.value); setSaved(false); }} className="bg-surface border-control h-12 px-4 text-base rounded-md focus-visible:ring-primary" />
          </div>
        </div>

        <div className="pt-4 flex flex-wrap items-center justify-end gap-3">
          {saved && <p role="status" className="text-sm text-success">Đã lưu thay đổi.</p>}
          <Button onClick={handleSave} disabled={saving} className="w-full md:w-auto min-w-[140px] h-12 rounded-md bg-primary text-primary-foreground font-bold text-base shadow-card hover:opacity-90">
            {saving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Save className="w-5 h-5 mr-2" />}
            {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </Button>
        </div>
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
        <CardHeader className="border-b border-border bg-hero pb-5">
          <CardTitle className="flex items-center gap-2 text-xl font-bold md:text-2xl">
            <Crown aria-hidden="true" className="h-6 w-6 text-primary" /> Gói tài khoản
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 px-4 py-6 md:px-8">
          <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tier === 'flyinfinity' ? 'bg-special-soft text-special' : tier === 'flymax' ? 'bg-primary-soft text-primary' : 'bg-muted text-foreground'}`}>
                <TierIcon aria-hidden="true" className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Loại tài khoản hiện tại</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
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
            {tier === 'flymax' ? (
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <Button asChild variant="outline" className="min-h-11">
                  <Link href="/pricing">Gia hạn FlyMax<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
                </Button>
                <Button asChild className="min-h-11">
                  <Link href="/pricing">Nâng cấp FlyInfinity<InfinityIcon aria-hidden="true" className="h-4 w-4" /></Link>
                </Button>
              </div>
            ) : (
              <Button asChild className="min-h-11">
                <Link href="/pricing">{tier === 'flygo' ? 'Nâng cấp tài khoản' : 'Xem các gói'}<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
              </Button>
            )}
          </div>

          <div>
            <h3 className="font-bold text-foreground">Nhập mã quà tặng</h3>
            <p className="mt-1 text-sm text-muted-foreground">Mã hợp lệ sẽ cộng thêm số ngày trải nghiệm FlyMax vào tài khoản này.</p>
            <div className="mt-4"><GiftCodeForm compact /></div>
          </div>

          <ReferralProgram />
        </CardContent>
      </Card>
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
      <AccountDevices userId={userId} />
      {/* Change Password */}
      <Card className="rounded-2xl md:rounded-xl border-border shadow-soft">
        <CardHeader className="pb-4 border-b border-border mb-6">
          <CardTitle className="flex items-center gap-2 text-xl md:text-2xl font-bold text-foreground">
            <Shield className="w-5 h-5 md:w-6 md:h-6 text-primary" /> Đổi mật khẩu
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 px-4 md:px-8 pb-8">
          {message && (
            <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
              message.type === 'success'
                ? 'bg-success-soft text-success'
                : 'bg-destructive-soft text-destructive'
            }`}>
              {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {message.text}
            </div>
          )}

          <div className="space-y-2.5">
            <Label htmlFor="profile-old-password" className="text-foreground font-semibold">Mật khẩu cũ</Label>
            <div className="relative">
              <Input id="profile-old-password" autoComplete="current-password" type={showOld ? 'text' : 'password'} value={oldPass} onChange={(e) => setOldPass(e.target.value)} placeholder="Nhập mật khẩu cũ" className="pr-12 bg-surface border-control h-12 px-4 text-base rounded-md focus-visible:ring-primary" />
              <button type="button" className="absolute right-1 top-1/2 flex h-11 w-11 items-center justify-center -translate-y-1/2 rounded-md text-muted-foreground hover:text-foreground" aria-label={showOld ? "Ẩn mật khẩu cũ" : "Hiện mật khẩu cũ"} aria-pressed={showOld} onClick={() => setShowOld(!showOld)}>
                {showOld ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="space-y-2.5">
            <Label htmlFor="profile-new-password" className="text-foreground font-semibold">Mật khẩu mới</Label>
            <div className="relative">
              <Input id="profile-new-password" autoComplete="new-password" type={showNew ? 'text' : 'password'} value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="Nhập mật khẩu mới (tối thiểu 6 ký tự)" className="pr-12 bg-surface border-control h-12 px-4 text-base rounded-md focus-visible:ring-primary" />
              <button type="button" className="absolute right-1 top-1/2 flex h-11 w-11 items-center justify-center -translate-y-1/2 rounded-md text-muted-foreground hover:text-foreground" aria-label={showNew ? "Ẩn mật khẩu mới" : "Hiện mật khẩu mới"} aria-pressed={showNew} onClick={() => setShowNew(!showNew)}>
                {showNew ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="space-y-2.5">
            <Label htmlFor="profile-confirm-password" className="text-foreground font-semibold">Xác nhận mật khẩu mới</Label>
            <Input id="profile-confirm-password" autoComplete="new-password" type="password" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} placeholder="Nhập lại mật khẩu mới" className="bg-surface border-control h-12 px-4 text-base rounded-md focus-visible:ring-primary" />
          </div>

          <div className="pt-2 flex justify-end">
            <Button onClick={handleChangePassword} disabled={saving || !oldPass || !newPass || !confirmPass} className="w-full md:w-auto min-w-[140px] h-12 rounded-md bg-primary text-primary-foreground font-bold text-base shadow-card hover:opacity-90">
              {saving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Shield className="w-5 h-5 mr-2" />}
              {saving ? 'Đang xử lý...' : 'Đổi mật khẩu'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Logout All Devices */}
      <Card className="rounded-2xl border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <LogOut className="w-5 h-5" /> Đăng xuất trên tất cả thiết bị
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Hành động này sẽ kết thúc các phiên đăng nhập. Danh sách thiết bị đã ghi nhận và 2 lượt xóa thiết bị không thay đổi.
          </p>
          <Button variant="destructive" onClick={handleLogoutAll} disabled={loggingOut} className="gap-2">
            {loggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            {loggingOut ? 'Đang đăng xuất...' : 'Đăng xuất tất cả thiết bị'}
          </Button>
          {logoutError && <p role="alert" className="mt-3 text-sm text-destructive">{logoutError}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
