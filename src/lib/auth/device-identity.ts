export type AccountDeviceType = 'phone' | 'computer' | 'tablet';

const DEVICE_KEY_STORAGE = 'flydo-device-key-v1';

export function getBrowserDeviceKey(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(DEVICE_KEY_STORAGE);
    if (stored && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored)) {
      return stored;
    }
    const key = window.crypto.randomUUID();
    window.localStorage.setItem(DEVICE_KEY_STORAGE, key);
    return key;
  } catch {
    // A stable key is required; without storage, quota accounting is unreliable.
    return null;
  }
}

export function getBrowserDeviceInfo(): { type: AccountDeviceType; name: string } {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const ipadDesktopMode = typeof navigator !== 'undefined'
    && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  const type: AccountDeviceType = ipadDesktopMode || /iPad|Tablet|Android(?!.*Mobile)/i.test(ua)
    ? 'tablet'
    : /iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua)
      ? 'phone'
      : 'computer';

  const browser = /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
      : /Firefox\//.test(ua) ? 'Firefox'
        : /Chrome\//.test(ua) ? 'Chrome'
          : /Safari\//.test(ua) ? 'Safari' : 'Trình duyệt';
  const system = /iPhone|iPad|iPod/.test(ua) || ipadDesktopMode ? 'iOS/iPadOS'
    : /Android/.test(ua) ? 'Android'
      : /Windows/.test(ua) ? 'Windows'
        : /Mac OS X/.test(ua) ? 'macOS'
          : /Linux/.test(ua) ? 'Linux' : 'Thiết bị khác';

  return { type, name: `${browser} · ${system}` };
}
