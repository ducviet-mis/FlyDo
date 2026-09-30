'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { Gift, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/features/auth/stores/auth-store';

interface GiftCodeFormProps {
  compact?: boolean;
}

export function GiftCodeForm({ compact = false }: GiftCodeFormProps) {
  const Heading = compact ? 'h2' : 'h3';
  const { user, refreshUser } = useAuthStore();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedCode = code.trim().toUpperCase();
    setMessage(null);

    if (!normalizedCode) {
      setMessage({ type: 'error', text: 'Vui lòng nhập mã quà tặng.' });
      return;
    }

    if (!user) {
      setMessage({ type: 'error', text: 'Bạn cần đăng nhập trước khi sử dụng mã.' });
      return;
    }

    setLoading(true);
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('redeem_gift_code', { p_code: normalizedCode });

    if (error) {
      const isMissingFunction = error.message.toLowerCase().includes('function') || error.code === 'PGRST202';
      setMessage({
        type: 'error',
        text: isMissingFunction
          ? 'Chức năng mã quà tặng chưa được cấu hình trên Supabase.'
          : error.message,
      });
      setLoading(false);
      return;
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.success) {
      setMessage({ type: 'error', text: result?.message || 'Mã quà tặng không hợp lệ.' });
      setLoading(false);
      return;
    }

    await refreshUser();
    setCode('');
    setMessage({ type: 'success', text: result.message || 'Đã kích hoạt FlyMax thành công.' });
    setLoading(false);
  };

  return (
    <div className={compact ? '' : 'rounded-2xl border border-primary/20 bg-primary-soft/60 p-5 sm:p-6'}>
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft">
          <Gift aria-hidden="true" className="h-5 w-5" />
        </div>
        <div>
          <Heading className={`font-bold text-foreground ${compact ? 'text-xl' : ''}`}>{compact ? 'Mã quà tặng' : 'Bạn có mã quà tặng?'}</Heading>
          <p className="mt-1 text-sm text-muted-foreground">Nhập mã để nhận số ngày trải nghiệm FlyMax được thiết lập cho mã đó.</p>
        </div>
      </div>

      {user ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <Label htmlFor={compact ? 'profile-gift-code' : 'pricing-gift-code'}>Mã quà tặng</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id={compact ? 'profile-gift-code' : 'pricing-gift-code'}
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="Ví dụ: FLYDO7NGAY"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              disabled={loading}
              aria-describedby={message ? 'gift-code-message' : undefined}
              className="h-12 min-w-0 bg-surface text-base font-semibold uppercase tracking-wide"
            />
            <Button type="submit" size="lg" disabled={loading || !code.trim()} className="sm:min-w-36">
              {loading ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Gift aria-hidden="true" className="h-4 w-4" />}
              {loading ? 'Đang kiểm tra' : 'Nhận quà'}
            </Button>
          </div>
          {message && (
            <p
              id="gift-code-message"
              role={message.type === 'error' ? 'alert' : 'status'}
              className={message.type === 'success' ? 'flex items-center gap-2 text-sm font-medium text-success' : 'flex items-center gap-2 text-sm font-medium text-destructive'}
            >
              {message.type === 'success' ? <CheckCircle2 aria-hidden="true" className="h-4 w-4" /> : <AlertCircle aria-hidden="true" className="h-4 w-4" />}
              {message.text}
            </p>
          )}
        </form>
      ) : (
        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link href="/login">Đăng nhập để nhập mã</Link>
        </Button>
      )}
    </div>
  );
}
