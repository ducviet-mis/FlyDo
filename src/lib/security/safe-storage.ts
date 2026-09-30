/** Optional browser caching must never block reading or publishing content. */
export function readLocalCache(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

export function writeLocalCache(key: string, value: string): boolean {
  try { window.localStorage.setItem(key, value); return true; } catch { return false; }
}
