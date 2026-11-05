/** 营业日 / 时段展示（H5） */

const WEEKDAY_I18N_KEYS = [
  'chat.time.sun',
  'chat.time.mon',
  'chat.time.tue',
  'chat.time.wed',
  'chat.time.thu',
  'chat.time.fri',
  'chat.time.sat',
] as const;

type HoursLike = {
  open?: string;
  close?: string;
  days?: number[];
  deliveryMinutes?: number;
} | null | undefined;

function dayLabel(day: number, t: (key: string) => string): string {
  const key = WEEKDAY_I18N_KEYS[day];
  return key ? t(key) : String(day);
}

/** 将连续营业日合并为「周一至周五」等形式 */
export function formatBusinessDaysRange(
  days: number[] | undefined,
  t: (key: string) => string,
): string {
  if (!days?.length) return '';
  const unique = [...new Set(days.filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b);
  if (!unique.length) return '';
  if (unique.length === 7) return t('shop.openEveryDay');

  const parts: string[] = [];
  let start = unique[0]!;
  let prev = start;
  for (let i = 1; i <= unique.length; i++) {
    const cur = unique[i];
    if (cur === prev + 1) {
      prev = cur;
      continue;
    }
    if (start === prev) parts.push(dayLabel(start, t));
    else parts.push(`${dayLabel(start, t)}-${dayLabel(prev, t)}`);
    if (cur == null) break;
    start = cur;
    prev = cur;
  }
  return parts.join(t('shop.dayListSep'));
}

export function formatBusinessHoursLine(hours: HoursLike, t: (key: string) => string): string {
  if (!hours?.open || !hours?.close) return '';
  const daysPart = formatBusinessDaysRange(hours.days, t);
  const timePart = `${hours.open} - ${hours.close}`;
  if (daysPart) return `${daysPart} ${timePart}`;
  return timePart;
}

export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
}

export function normalizeTel(phone: string | null | undefined): string | null {
  const p = (phone || '').trim();
  if (!p) return null;
  return p.replace(/\s+/g, '');
}
