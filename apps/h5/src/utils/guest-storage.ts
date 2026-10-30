const TOKEN = 'guest_token';
const META = 'guest_meta';

export type GuestMeta = {
  qrToken: string;
  nickname: string;
  sessionId: string;
  tableId: string;
  tableCode: string;
  storeId: string;
  pin: string;
  guestId: string;
};

export function getGuestToken() {
  return localStorage.getItem(TOKEN);
}

export function setGuestSession(token: string, meta: GuestMeta) {
  localStorage.setItem(TOKEN, token);
  localStorage.setItem(META, JSON.stringify(meta));
}

export function getGuestMeta(): GuestMeta | null {
  const raw = localStorage.getItem(META);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GuestMeta;
  } catch {
    return null;
  }
}

export function clearGuestSession() {
  localStorage.removeItem(TOKEN);
  localStorage.removeItem(META);
}
