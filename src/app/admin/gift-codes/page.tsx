'use client';

import { AdminCreatePanel } from '@/components/admin/create-panel';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Check, Copy, LockKeyhole, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { FLYTIEE_ACCESSORIES, FLYTIEE_SETS, FLYTIEE_SKINS } from '@/features/flytiee/config';
import { CHEST_LABELS } from '@/features/flytiee/event-config';
import { getSupabaseClient } from '@/lib/supabase/client';
import type { FlytieeChestTier } from '@/features/flytiee/types';

type CodeType = 'flytiee' | 'flymax';
type RewardKind = 'coins' | 'chest' | 'accessory' | 'skin' | 'set';

type FlytieeCode = {
  id: string;
  code: string;
  title: string;
  reward_kind: RewardKind;
  reward_value: { amount?: number; tier?: FlytieeChestTier; item_id?: string };
  is_active: boolean;
  expires_at: string | null;
  max_redemptions: number | null;
  redemption_count: number;
  created_at: string;
};

type FlymaxCode = {
  code: string;
  name: string;
  flymax_days: number;
  is_active: boolean;
  expires_at: string | null;
  max_redemptions: number | null;
  usage_count: number;
  created_at: string;
};

const adminEmails = new Set(['vietdang293.vn@gmail.com', 'vietdang293@gmail.com']);
const giftCodeSetupHint = 'Hãy chạy file src/lib/supabase/admin-gift-codes.sql trong Supabase SQL Editor của đúng dự án FlyDo, rồi bấm “Kiểm tra lại quyền”.';
const redeemableSets = FLYTIEE_SETS.filter((set) => !set.exclusiveMilestone);
const rewardItems = {
  accessory: FLYTIEE_ACCESSORIES,
  skin: FLYTIEE_SKINS,
  set: redeemableSets,
};

function generateCode(type: CodeType) {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `${type === 'flymax' ? 'MAX' : 'BIRDIE'}-${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function rewardDescription(gift: FlytieeCode) {
  const value = gift.reward_value;
  if (gift.reward_kind === 'coins') return `${value.amount ?? 0} xu`;
  if (gift.reward_kind === 'chest') return value.tier ? CHEST_LABELS[value.tier] : 'Rương';
  const item = rewardItems[gift.reward_kind].find((entry) => entry.id === value.item_id);
  return item?.name ?? value.item_id ?? 'Vật phẩm';
}

function displayDate(value: string | null) {
  return value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Không hết hạn';
}

export default function GiftCodesAdminPage() {
  const { user, initialized, isLoading } = useAuthStore();
  const isAdmin = Boolean(user?.email && adminEmails.has(user.email.toLowerCase()));
  const [type, setType] = useState<CodeType>('flytiee');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [rewardKind, setRewardKind] = useState<RewardKind>('coins');
  const [amount, setAmount] = useState('50');
  const [chestTier, setChestTier] = useState<FlytieeChestTier>('silver');
  const [itemId, setItemId] = useState('');
  const [days, setDays] = useState('30');
  const [maxUses, setMaxUses] = useState('1');
  const [expiresAt, setExpiresAt] = useState('');
  const [flytieeCodes, setFlytieeCodes] = useState<FlytieeCode[]>([]);
  const [flymaxCodes, setFlymaxCodes] = useState<FlymaxCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessReady, setAccessReady] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const itemOptions = useMemo(() => rewardKind in rewardItems
    ? rewardItems[rewardKind as keyof typeof rewardItems]
    : [], [rewardKind]);

  useEffect(() => {
    setCode(generateCode('flytiee'));
  }, []);

  const loadCodes = useCallback(async () => {
    setLoading(true);
    const supabase = getSupabaseClient();
    const { data: canManage, error: accessError } = await supabase.rpc('flydo_is_gift_code_admin');
    if (accessError || !canManage) {
      setAccessReady(false);
      setError(accessError
        ? `Chưa cài quyền quản trị mã quà tặng trên Supabase. ${giftCodeSetupHint}`
        : 'Phiên đăng nhập hiện tại không được Supabase xác nhận là ADMIN. Hãy đăng nhập lại bằng đúng email ADMIN.');
      setLoading(false);
      return;
    }
    setAccessReady(true);
    const [birdie, max] = await Promise.all([
      supabase.from('flytiee_gift_codes').select('id,code,title,reward_kind,reward_value,is_active,expires_at,max_redemptions,redemption_count,created_at').order('created_at', { ascending: false }).limit(50),
      supabase.from('gift_codes').select('code,name,flymax_days,is_active,expires_at,max_redemptions,usage_count,created_at').order('created_at', { ascending: false }).limit(50),
    ]);
    if (birdie.error || max.error) {
      setError(`Không tải được danh sách mã: ${birdie.error?.message ?? max.error?.message}. Hãy chạy file admin-gift-codes.sql trong Supabase một lần và tải lại trang.`);
    } else {
      setFlytieeCodes((birdie.data ?? []) as FlytieeCode[]);
      setFlymaxCodes((max.data ?? []) as FlymaxCode[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) void loadCodes();
  }, [isAdmin, loadCodes]);

  const chooseType = (next: CodeType) => {
    setType(next);
    setCode(generateCode(next));
    setName('');
    setError('');
    setSuccess('');
  };

  const createCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isAdmin || saving) return;
    setError('');
    setSuccess('');
    if (accessReady !== true) return setError(`Chưa thể tạo mã. ${giftCodeSetupHint}`);

    const normalizedCode = code.trim().toUpperCase();
    const title = name.trim();
    const uses = maxUses.trim() ? Number(maxUses) : null;
    const expiry = expiresAt ? new Date(expiresAt) : null;
    if (!/^[A-Z0-9-]{3,48}$/.test(normalizedCode)) return setError('Mã phải gồm 3–48 ký tự: chữ in hoa, số hoặc dấu gạch ngang.');
    if (!title || title.length > 100) return setError('Tên đợt quà cần từ 1 đến 100 ký tự.');
    if (uses !== null && (!Number.isSafeInteger(uses) || uses < 1 || uses > 1000000)) return setError('Số lượt dùng phải từ 1 đến 1.000.000; để trống nếu không giới hạn.');
    if (expiry && (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now())) return setError('Ngày hết hạn phải ở tương lai.');

    let payload: Record<string, unknown>;
    if (type === 'flymax') {
      const duration = Number(days);
      if (!Number.isSafeInteger(duration) || duration < 1 || duration > 3650) return setError('Số ngày FlyMax phải từ 1 đến 3.650 ngày.');
      payload = { code: normalizedCode, name: title, flymax_days: duration, max_redemptions: uses, expires_at: expiry?.toISOString() ?? null };
    } else {
      let rewardValue: Record<string, string | number>;
      if (rewardKind === 'coins') {
        const coins = Number(amount);
        if (!Number.isSafeInteger(coins) || coins < 1 || coins > 1000000) return setError('Số xu phải từ 1 đến 1.000.000.');
        rewardValue = { amount: coins };
      } else if (rewardKind === 'chest') {
        rewardValue = { tier: chestTier };
      } else {
        if (!itemOptions.some((item) => item.id === itemId)) return setError('Hãy chọn một vật phẩm hợp lệ.');
        rewardValue = { item_id: itemId };
      }
      payload = { code: normalizedCode, title, reward_kind: rewardKind, reward_value: rewardValue, max_redemptions: uses, expires_at: expiry?.toISOString() ?? null };
    }

    setSaving(true);
    const table = type === 'flymax' ? 'gift_codes' : 'flytiee_gift_codes';
    const { error: insertError } = await getSupabaseClient().from(table).insert(payload);
    setSaving(false);
    if (insertError) {
      setError(insertError.code === '23505' ? 'Mã này đã tồn tại. Hãy tạo mã mới.'
        : insertError.code === '42501' || insertError.message.toLowerCase().includes('row-level security')
          ? `Chính sách tạo mã chưa được áp dụng. ${giftCodeSetupHint}`
          : `Không thể tạo mã: ${insertError.message}`);
      return;
    }
    setSuccess(`Đã tạo ${type === 'flymax' ? 'mã FlyMax' : 'mã FlyTiee'}: ${normalizedCode}. Sao chép mã ở danh sách bên dưới để gửi cho học sinh.`);
    setCode(generateCode(type));
    setName('');
    await loadCodes();
  };

  const toggleCode = async (gift: FlytieeCode | FlymaxCode) => {
    if (!isAdmin || busyCode || accessReady !== true) return;
    setError('');
    const table = type === 'flymax' ? 'gift_codes' : 'flytiee_gift_codes';
    setBusyCode(gift.code);
    const { error: updateError } = await getSupabaseClient().from(table).update({ is_active: !gift.is_active }).eq('code', gift.code);
    setBusyCode(null);
    if (updateError) setError(`Không thể đổi trạng thái mã: ${updateError.message}`);
    else await loadCodes();
  };

  const copyCode = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      window.setTimeout(() => setCopied(null), 2200);
    } catch {
      setError('Không thể sao chép tự động. Hãy chọn và sao chép mã trong danh sách.');
    }
  };

  if (!initialized || isLoading || !isAdmin) return null;

  const rows = type === 'flytiee' ? flytieeCodes : flymaxCodes;

  return (
    <div className="space-y-6 pb-12">
      <div className="admin-tabs" role="group" aria-label="Loại mã quà tặng">
        <button type="button" aria-pressed={type === 'flytiee'} onClick={() => chooseType('flytiee')}>FlyTiee</button>
        <button type="button" aria-pressed={type === 'flymax'} onClick={() => chooseType('flymax')}>FlyMax</button>
      </div>
      {error ? <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><p>{error}</p>{accessReady === false || error.includes('Chính sách tạo mã') ? <Button type="button" variant="outline" className="mt-3 min-h-11" onClick={() => { setError(''); void loadCodes(); }}>Kiểm tra lại quyền</Button> : null}</div> : null}
      {success ? <p role="status" className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">{success}</p> : null}
      <AdminCreatePanel title={`Phát hành mã ${type === 'flytiee' ? 'FlyTiee' : 'FlyMax'}`} actionLabel="Tạo mã" description={type === 'flytiee' ? 'Quà FlyTiee: mỗi người nhận một lần cho mỗi mã.' : 'Số ngày được cộng tiếp vào hạn FlyMax hiện tại.'}>
        <CardContent>
          <form onSubmit={createCode} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="gift-code">Mã quà tặng</Label>
                <div className="flex gap-2">
                  <Input id="gift-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/\s/g, '-'))} placeholder={type === 'flymax' ? 'MAX-...' : 'BIRDIE-...'} maxLength={48} autoComplete="off" className="min-w-0 font-mono uppercase" required />
                  <Button type="button" variant="outline" onClick={() => setCode(generateCode(type))}>Tạo mới</Button>
                </div>
                <p className="text-xs text-muted-foreground">Mã được tạo ngẫu nhiên; bạn cũng có thể tự sửa.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="gift-name">Tên đợt quà</Label>
                <Input id="gift-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="VD: Quà chăm học tháng 9" maxLength={100} required />
              </div>
            </div>

            {type === 'flymax' ? (
              <div className="space-y-2 sm:max-w-xs">
                <Label htmlFor="flymax-days">Số ngày FlyMax</Label>
                <Input id="flymax-days" type="number" min="1" max="3650" step="1" value={days} onChange={(event) => setDays(event.target.value)} required />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="reward-kind">Loại quà</Label>
                  <Select value={rewardKind} onValueChange={(value) => { setRewardKind(value as RewardKind); setItemId(''); }}>
                    <SelectTrigger id="reward-kind"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="coins">Xu FlyTiee</SelectItem>
                      <SelectItem value="chest">Rương</SelectItem>
                      <SelectItem value="accessory">Phụ kiện</SelectItem>
                      <SelectItem value="skin">Màu lông</SelectItem>
                      <SelectItem value="set">Set toàn thân</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  {rewardKind === 'coins' ? <><Label htmlFor="reward-amount">Số xu</Label><Input id="reward-amount" type="number" min="1" max="1000000" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} required /></> : null}
                  {rewardKind === 'chest' ? <><Label htmlFor="chest-tier">Loại rương (1 rương / lần đổi)</Label><Select value={chestTier} onValueChange={(value) => setChestTier(value as FlytieeChestTier)}><SelectTrigger id="chest-tier"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bronze">Rương đồng</SelectItem><SelectItem value="silver">Rương bạc</SelectItem><SelectItem value="gold">Rương vàng</SelectItem></SelectContent></Select></> : null}
                  {rewardKind === 'accessory' || rewardKind === 'skin' || rewardKind === 'set' ? <><Label htmlFor="reward-item">Chọn vật phẩm</Label><Select value={itemId} onValueChange={setItemId}><SelectTrigger id="reward-item"><SelectValue placeholder="Chọn từ kho FlyTiee" /></SelectTrigger><SelectContent>{itemOptions.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></> : null}
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="max-uses">Số lượt dùng tối đa</Label>
                <Input id="max-uses" type="number" min="1" max="1000000" step="1" value={maxUses} onChange={(event) => setMaxUses(event.target.value)} placeholder="Để trống nếu không giới hạn" />
                <p className="text-xs text-muted-foreground">Mặc định 1 lượt, để trống nếu muốn nhiều học sinh cùng dùng.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="expires-at">Hết hạn lúc (không bắt buộc)</Label>
                <Input id="expires-at" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
              </div>
            </div>

            <Button type="submit" disabled={saving || accessReady !== true} className="min-h-11 w-full sm:w-auto"><Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />{saving ? 'Đang tạo mã…' : 'Tạo mã quà tặng'}</Button>
          </form>
        </CardContent>
      </AdminCreatePanel>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-lg">Danh sách mã {type === 'flytiee' ? 'FlyTiee' : 'FlyMax'}</CardTitle>
          <CardDescription>50 mã gần nhất · sao chép để gửi hoặc tạm khóa khi cần.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-muted-foreground">Đang tải mã…</p> : rows.length === 0 ? <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Chưa có mã nào. Tạo mã đầu tiên ở phía trên.</p> : (
            <div className="admin-record-list">
              {rows.map((gift) => (
                <div key={gift.code} className="admin-record flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-2"><span className="break-all font-mono text-sm font-bold text-primary">{gift.code}</span><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${gift.is_active ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>{gift.is_active ? 'Đang dùng' : 'Đã khóa'}</span></p>
                    <p className="text-sm font-semibold">{type === 'flytiee' ? (gift as FlytieeCode).title : (gift as FlymaxCode).name} · {type === 'flytiee' ? rewardDescription(gift as FlytieeCode) : `${(gift as FlymaxCode).flymax_days} ngày FlyMax`}</p>
                    <p className="text-xs text-muted-foreground">Đã dùng {type === 'flytiee' ? (gift as FlytieeCode).redemption_count : (gift as FlymaxCode).usage_count}/{gift.max_redemptions ?? '∞'} · {displayDate(gift.expires_at)}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => void copyCode(gift.code)}><Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />{copied === gift.code ? 'Đã chép' : 'Sao chép'}</Button>
                    <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={busyCode === gift.code} onClick={() => void toggleCode(gift)}>{gift.is_active ? <LockKeyhole className="mr-1.5 h-4 w-4" aria-hidden="true" /> : <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />}{gift.is_active ? 'Khóa mã' : 'Mở lại'}</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
