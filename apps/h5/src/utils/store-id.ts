const STORAGE_KEY = 'h5_store_id';

/** 公开页门店：query > sessionStorage > VITE_STORE_ID > '1' */
export function getPublicStoreId(): string {
  try {
    const q = new URLSearchParams(window.location.search).get('storeId');
    if (q?.trim()) {
      persistPublicStoreId(q.trim());
      return q.trim();
    }
  } catch {
    /* ignore */
  }
  try {
    const cached = sessionStorage.getItem(STORAGE_KEY)?.trim();
    if (cached) return cached;
  } catch {
    /* ignore */
  }
  const fromEnv = (import.meta.env.VITE_STORE_ID as string | undefined)?.trim();
  return fromEnv || '1';
}

export function persistPublicStoreId(storeId: string) {
  const id = (storeId || '').trim();
  if (!id) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}
