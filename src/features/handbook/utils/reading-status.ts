const STORAGE_PREFIX = 'vivux_handbook_read_posts';

function storageKey(scope?: string) {
  return `${STORAGE_PREFIX}_${scope || 'guest'}`;
}

export function getReadPostIds(scope?: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey(scope)) || '[]');
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function markPostAsRead(postId: string, scope?: string) {
  if (typeof window === 'undefined' || !postId) return;
  const ids = new Set(getReadPostIds(scope));
  ids.add(postId);
  try { localStorage.setItem(storageKey(scope), JSON.stringify(Array.from(ids))); }
  catch { /* Reading stays available when storage is blocked or full. */ }
}
