export interface DeviceLinkIntent {
  code: string;
  accountId?: string;
  email?: string;
}

const STORAGE_KEY = 'flydo-device-link-intent-v1';
// Keeps an opt-in attempt fail-closed if tab storage is blocked mid-request.
let pendingIntent: DeviceLinkIntent | null = null;

export function getDeviceLinkIntent(): DeviceLinkIntent | null {
  if (typeof window === 'undefined') return null;
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage failure alone does not opt a normal login into linking.
    return pendingIntent;
  }
  if (!raw) return pendingIntent;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value.code !== 'string'
      || (value.accountId !== undefined && typeof value.accountId !== 'string')
      || (value.email !== undefined && typeof value.email !== 'string')) return (pendingIntent = { code: '' });
    return (pendingIntent = value);
  } catch {
    // A corrupt stored intent is still an explicit attempt: never enroll instead.
    return (pendingIntent = { code: '' });
  }
}

export function setDeviceLinkIntent(code: string, accountId?: string, email?: string): boolean {
  pendingIntent = { code: code.trim(), ...(accountId ? { accountId } : {}), ...(email ? { email: email.trim().toLowerCase() } : {}) };
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pendingIntent));
    return true;
  } catch {
    return false;
  }
}

export function clearDeviceLinkIntent(expected?: DeviceLinkIntent): void {
  const current = getDeviceLinkIntent();
  if (expected && (current?.code !== expected.code || current?.accountId !== expected.accountId || current?.email !== expected.email)) return;
  pendingIntent = null;
  try { window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* No durable storage fallback. */ }
}

export function deviceLinkError(reason: string): string {
  switch (reason) {
    case 'invalid': return 'Mã liên kết không hợp lệ hoặc không thuộc tài khoản này. Hãy kiểm tra mã rồi thử lại.';
    case 'expired': return 'Mã liên kết đã hết hạn. Hãy tạo mã mới từ trình duyệt đang đăng nhập trên cùng máy.';
    case 'removed': return 'Nhóm thiết bị tạo mã đã bị xóa. Hãy dùng trình duyệt còn được phép đăng nhập để tạo mã mới.';
    case 'type': return 'Mã liên kết chỉ dùng cho cùng loại thiết bị: điện thoại, máy tính hoặc máy tính bảng.';
    case 'used': return 'Mã liên kết đã được dùng. Hãy tạo mã mới từ trình duyệt đang đăng nhập trên cùng máy.';
    case 'capacity': return 'Nhóm này đã đạt tối đa 20 hồ sơ trình duyệt. Không thể liên kết thêm; hãy kiểm tra nhóm trong Bảo mật hoặc liên hệ hỗ trợ.';
    default: return 'Chưa thể liên kết trình duyệt. Hãy kiểm tra kết nối hoặc chờ FlyDo cập nhật tính năng rồi thử lại. Mã của bạn được giữ để thử lại.';
  }
}
