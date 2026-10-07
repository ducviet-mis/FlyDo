"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  ArrowLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  ShieldAlert,
  Trash2,
  UserPlus,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleAuthOption } from "./google-auth-option";
import {
  forgetRememberedAccount,
  getRememberedAccounts,
  rememberAccount,
  type RememberedAccount,
} from "../lib/remembered-accounts";
import { useAuthStore } from "../stores/auth-store";
import { clearDeviceLinkIntent, getDeviceLinkIntent, setDeviceLinkIntent } from "@/lib/auth/device-link";

const loginSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(6, "Mật khẩu phải có ít nhất 6 ký tự"),
});

type LoginFormData = z.infer<typeof loginSchema>;
type LoginMode = "remembered" | "password" | "other";

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function LoginForm({
  oauthError = false,
  sessionReplaced = false,
  deviceLimit = false,
  deviceSetup = false,
}: {
  oauthError?: boolean;
  sessionReplaced?: boolean;
  deviceLimit?: boolean;
  deviceSetup?: boolean;
}) {
  const { login, isLoading, error, clearError, user, initialized } = useAuthStore();
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>("remembered");
  const [accounts, setAccounts] = useState<RememberedAccount[] | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<RememberedAccount | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [linkCode, setLinkCode] = useState('');
  const [linkConfirmed, setLinkConfirmed] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const displayedError = linkError || error;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    clearErrors,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  useEffect(() => {
    const remembered = getRememberedAccounts();
    setAccounts(remembered);
    if (remembered.length === 0) setMode("other");
    const intent = getDeviceLinkIntent();
    if (intent) { setLinkMode(true); setLinkCode(intent.code); }
  }, []);

  useEffect(() => {
    if (!user) return;
    setAccounts(rememberAccount(user));
    setMode((current) => (current === "other" ? "remembered" : current));
  }, [user]);

  const onSubmit = async (data: LoginFormData) => {
    if (!prepareLogin(data.email)) return;
    clearError();
    const success = await login(data.email, data.password);
    if (success) router.push("/home");
  };

  function normalLogin() {
    clearDeviceLinkIntent();
    setLinkMode(false); setLinkCode(''); setLinkConfirmed(false); setLinkError(null);
  }

  function prepareLogin(email?: string): boolean {
    if (!linkMode) { clearDeviceLinkIntent(); return true; }
    if (!linkCode.trim() || !linkConfirmed) {
      setLinkError(!linkCode.trim() ? 'Hãy nhập mã liên kết.' : 'Hãy xác nhận hai trình duyệt ở trên cùng máy trước khi đăng nhập.');
      document.getElementById(!linkCode.trim() ? 'device-link-code' : 'device-link-confirm')?.focus();
      return false;
    }
    const previous = getDeviceLinkIntent();
    if (!setDeviceLinkIntent(linkCode, previous?.code === linkCode.trim() ? previous.accountId : undefined, email)) {
      setLinkError('Không thể lưu mã trong tab này. Hãy bật bộ nhớ trình duyệt rồi thử lại.');
      return false;
    }
    setLinkError(null);
    return true;
  }

  const chooseAccount = (account: RememberedAccount) => {
    if (!initialized) return;
    clearError();

    const intent = getDeviceLinkIntent();
    if (intent && ((intent.accountId && intent.accountId !== account.id) || (intent.email && intent.email !== account.email.toLowerCase()))) normalLogin();

    if (user?.id === account.id || user?.email === account.email) {
      router.push("/home");
      return;
    }

    setSelectedAccount(account);
    setValue("email", account.email);
    setValue("password", "");
    clearErrors();
    setShowPassword(false);
    setMode("password");
  };

  const useAnotherAccount = () => {
    normalLogin();
    clearError();
    setSelectedAccount(null);
    reset({ email: "", password: "" });
    setShowPassword(false);
    setMode("other");
  };

  const showRememberedAccounts = () => {
    normalLogin();
    clearError();
    setSelectedAccount(null);
    reset({ email: "", password: "" });
    setShowPassword(false);
    setMode("remembered");
  };

  const forgetAccount = (accountId: string) => {
    const next = forgetRememberedAccount(accountId);
    setAccounts(next);
    if (selectedAccount?.id === accountId) {
      setSelectedAccount(null);
      reset({ email: "", password: "" });
      setMode(next.length > 0 ? "remembered" : "other");
    } else if (next.length === 0) {
      setMode("other");
    }
  };

  const passwordField = (
    <div className="space-y-2">
      <Label htmlFor="password" className="ml-1 font-bold text-foreground">
        Mật khẩu
      </Label>
      <div className="relative">
        <Input
          id="password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          autoFocus={mode === "password"}
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? "login-password-error" : undefined}
          placeholder="Nhập mật khẩu"
          className="h-12 rounded-md border-control bg-card px-5 pr-14"
          {...register("password")}
        />
        <button
          type="button"
          onClick={() => setShowPassword((value) => !value)}
          aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
          className="absolute right-0.5 top-0.5 inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {showPassword ? <EyeOff aria-hidden="true" className="h-5 w-5" /> : <Eye aria-hidden="true" className="h-5 w-5" />}
        </button>
      </div>
      {errors.password && (
        <p id="login-password-error" role="alert" className="ml-1 text-sm text-destructive">
          {errors.password.message}
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      {oauthError && !displayedError && (
        <div role="alert" className="rounded-lg bg-destructive-soft p-4 text-sm font-medium text-destructive">
          Không thể hoàn tất đăng nhập Google. Vui lòng thử lại hoặc sử dụng email.
        </div>
      )}

      {sessionReplaced && !displayedError && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-3 rounded-lg border border-warning/35 bg-warning/10 p-4 text-sm text-foreground"
        >
          <ShieldAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div className="space-y-1">
            <p className="font-bold">Thiết bị không còn được phép đăng nhập</p>
            <p className="leading-relaxed text-muted-foreground">
              Thiết bị này đã bị xóa khỏi danh sách hoặc phiên đăng nhập đã kết thúc. Hãy dùng thiết bị khác đang được phép.
            </p>
          </div>
        </div>
      )}

      {deviceLimit && !displayedError && (
        <div role="alert" className="rounded-lg border border-warning/35 bg-warning/10 p-4 text-sm text-foreground">
          Loại thiết bị này đã đủ 2 nhóm. Nếu đây là trình duyệt khác trên cùng máy, hãy lấy mã liên kết từ trình duyệt đang đăng nhập. Khi thay máy, vào Thông tin tài khoản → Bảo mật và xóa nhóm cũ trước khi thay thế.
        </div>
      )}

      {deviceSetup && !displayedError && (
        <div role="alert" className="rounded-lg bg-destructive-soft p-4 text-sm text-destructive">
          Không thể xác nhận thiết bị. Hãy bật bộ nhớ trình duyệt và kiểm tra bản cập nhật cơ sở dữ liệu quản lý thiết bị.
        </div>
      )}

      {displayedError && !linkMode && (
        <div role="alert" className="rounded-lg bg-destructive-soft p-4 text-sm font-medium text-destructive">
          {displayedError}
        </div>
      )}

      <div className="space-y-3">
        <Button type="button" variant="outline" disabled={isLoading} aria-expanded={linkMode}
          onClick={() => { if (linkMode) normalLogin(); else { clearError(); setLinkMode(true); } }}
          className="min-h-12 w-full whitespace-normal rounded-md">
          {linkMode ? 'Đăng nhập thông thường' : 'Liên kết trình duyệt trên cùng máy'}
        </Button>
        {linkMode && (
          <fieldset className="space-y-3 rounded-lg border border-control bg-card p-4" disabled={isLoading}>
            <legend className="px-1 text-sm font-semibold text-foreground">Liên kết tự nguyện</legend>
            <p id="device-link-help" className="text-sm leading-relaxed text-muted-foreground">
              Lấy mã từ Thông tin tài khoản → Bảo mật của trình duyệt đang đăng nhập trên cùng máy, cùng tài khoản FlyDo. Mã dùng một lần trong 5 phút.
              {' '}Chỉ xác nhận khi hai trình duyệt ở trên cùng máy. Liên kết không chứng minh hay bảo đảm cùng phần cứng.
            </p>
            <Label htmlFor="device-link-code" className="block font-bold text-foreground">Mã liên kết</Label>
            <Input id="device-link-code" value={linkCode} autoComplete="one-time-code" spellCheck={false}
              autoCapitalize="none" className="h-12 rounded-md border-control bg-card"
              aria-invalid={!!linkError} aria-describedby={`device-link-help${displayedError ? ' device-link-error' : ''}`}
              onChange={event => {
                setLinkCode(event.target.value); setLinkConfirmed(false); setLinkError(null); clearDeviceLinkIntent();
              }} />
            <label htmlFor="device-link-confirm" className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm leading-relaxed text-foreground">
              <input id="device-link-confirm" type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-primary"
                checked={linkConfirmed} onChange={event => {
                  setLinkConfirmed(event.target.checked); setLinkError(null);
                  const previous = getDeviceLinkIntent();
                  if (event.target.checked) setDeviceLinkIntent(linkCode, previous?.code === linkCode.trim() ? previous.accountId : undefined, previous?.email);
                  else clearDeviceLinkIntent();
                }} />
              Tôi xác nhận đây là trình duyệt khác trên cùng máy của tôi.
            </label>
            {displayedError && <p id="device-link-error" role="alert" className="text-sm text-destructive">{displayedError}</p>}
          </fieldset>
        )}
      </div>

      {accounts === null ? (
        <div className="space-y-3" aria-label="Đang tải tài khoản đã lưu">
          <div className="h-16 animate-pulse rounded-xl bg-muted" />
          <div className="h-16 animate-pulse rounded-xl bg-muted" />
        </div>
      ) : mode === "remembered" ? (
        <div className="space-y-4">
          <div className="text-center">
            <h2 className="text-lg font-bold text-foreground">Chọn tài khoản</h2>
            <p className="mt-1 text-sm text-muted-foreground">Chạm vào tài khoản để tiếp tục học.</p>
          </div>

          <div className="space-y-2">
            {accounts.map((account) => {
              const hasActiveSession = user?.id === account.id || user?.email === account.email;
              return (
                <div key={account.id} className="grid grid-cols-[1fr_44px] gap-2">
                  <button
                    type="button"
                    onClick={() => chooseAccount(account)}
                    disabled={!initialized}
                    className="group flex min-h-16 min-w-0 items-center gap-3 rounded-xl border border-control bg-card p-3 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/45 hover:bg-primary-soft/40 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60 motion-reduce:transform-none"
                  >
                    <Avatar className="h-12 w-12 border-2 border-primary/15">
                      <AvatarImage src={account.avatarUrl} alt="" />
                      <AvatarFallback>{getInitials(account.name)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold text-foreground">{account.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{account.email}</span>
                      <span className="mt-0.5 block text-xs font-medium text-primary">
                        {!initialized
                          ? "Đang kiểm tra phiên đăng nhập..."
                          : hasActiveSession
                            ? "Tiếp tục không cần mật khẩu"
                            : "Nhập mật khẩu để tiếp tục"}
                      </span>
                    </span>
                    <ChevronRight aria-hidden="true" className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => forgetAccount(account.id)}
                    aria-label={`Xóa ${account.name} khỏi thiết bị này`}
                    className="inline-flex h-11 w-11 self-center items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>

          <Button type="button" variant="outline" onClick={useAnotherAccount} className="h-12 w-full rounded-md">
            <UserPlus aria-hidden="true" className="h-5 w-5" />
            Đăng nhập bằng tài khoản khác
          </Button>
          <p className="text-center text-xs leading-relaxed text-muted-foreground">
            Thiết bị này chỉ lưu tên, email và ảnh đại diện. FlyDo không lưu mật khẩu của bạn.
          </p>
        </div>
      ) : mode === "password" && selectedAccount ? (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <input type="hidden" {...register("email")} />
          <button
            type="button"
            onClick={showRememberedAccounts}
            className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Tài khoản đã lưu
          </button>

          <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary-soft/35 p-3">
            <Avatar className="h-12 w-12 border-2 border-primary/15">
              <AvatarImage src={selectedAccount.avatarUrl} alt="" />
              <AvatarFallback>{getInitials(selectedAccount.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-bold text-foreground">{selectedAccount.name}</p>
              <p className="truncate text-sm text-muted-foreground">{selectedAccount.email}</p>
            </div>
          </div>

          {passwordField}

          <Button type="submit" className="h-12 w-full rounded-md text-base font-bold shadow-card" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                Đang đăng nhập...
              </>
            ) : (
              "Tiếp tục"
            )}
          </Button>
          <Button type="button" variant="ghost" onClick={useAnotherAccount} className="h-11 w-full">
            Đăng nhập bằng tài khoản khác
          </Button>
        </form>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {accounts.length > 0 && (
            <button
              type="button"
              onClick={showRememberedAccounts}
              className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              Tài khoản đã lưu
            </button>
          )}

          <div onClickCapture={event => {
            if ((event.target as HTMLElement).closest('button') && !prepareLogin()) {
              event.preventDefault(); event.stopPropagation();
            }
          }}>
            <GoogleAuthOption mode="login" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="ml-1 font-bold text-foreground">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "login-email-error" : undefined}
              placeholder="email@example.com"
              className="h-12 rounded-md border-control bg-card px-5"
              {...register("email", { onChange: event => {
                const intent = getDeviceLinkIntent();
                if (intent?.email && intent.email !== event.target.value.trim().toLowerCase()) normalLogin();
              } })}
            />
            {errors.email && (
              <p id="login-email-error" role="alert" className="ml-1 text-sm text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>

          {passwordField}

          <Button type="submit" className="mt-6 h-12 w-full rounded-md text-base font-bold shadow-card" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                Đang đăng nhập...
              </>
            ) : (
              "Đăng nhập"
            )}
          </Button>
        </form>
      )}

      <p className="text-center text-sm text-muted-foreground">
        Chưa có tài khoản?{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Đăng ký ngay
        </Link>
      </p>
    </div>
  );
}
