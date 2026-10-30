/** Haversine 距离（公里） */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type DeliveryFeeRule = { maxKm: number; fee: number };

export function calcDeliveryFee(distanceKm: number, rules: DeliveryFeeRule[]): number {
  const sorted = [...rules].sort((a, b) => a.maxKm - b.maxKm);
  for (const r of sorted) {
    if (distanceKm <= r.maxKm) return Math.round(Number(r.fee));
  }
  const last = sorted[sorted.length - 1];
  return last ? Math.round(Number(last.fee)) : 0;
}

export type BusinessHours = {
  open: string; // HH:mm
  close: string;
  days: number[]; // 0=Sun ... 6=Sat
};

export function isWithinBusinessHours(now: Date, hours: BusinessHours | null | undefined): boolean {
  if (!hours?.open || !hours?.close) return true;
  const day = now.getDay();
  if (Array.isArray(hours.days) && hours.days.length && !hours.days.includes(day)) return false;
  const [oh, om] = hours.open.split(':').map(Number);
  const [ch, cm] = hours.close.split(':').map(Number);
  const mins = now.getHours() * 60 + now.getMinutes();
  const openMins = oh * 60 + (om || 0);
  const closeMins = ch * 60 + (cm || 0);
  if (closeMins >= openMins) return mins >= openMins && mins <= closeMins;
  // 跨午夜
  return mins >= openMins || mins <= closeMins;
}

/** 越南手机号：0xxxxxxxxx 或 +84xxxxxxxxx */
export function isValidVnPhone(phone: string): boolean {
  const p = phone.replace(/\s+/g, '');
  return /^(0\d{9}|\+84\d{9})$/.test(p);
}
