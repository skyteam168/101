import { getChatTimeParts, type ChatTimeParts } from '@restaurant/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TFn = (key: string, values?: any) => string;

const WEEKDAY_KEYS = [
  'chat.time.sun',
  'chat.time.mon',
  'chat.time.tue',
  'chat.time.wed',
  'chat.time.thu',
  'chat.time.fri',
  'chat.time.sat',
] as const;

function renderParts(t: TFn, parts: ChatTimeParts): string {
  switch (parts.kind) {
    case 'justNow':
      return String(t('chat.time.justNow'));
    case 'minutesAgo':
      return String(t('chat.time.minutesAgo', { n: parts.n }));
    case 'hoursAgo':
      return String(t('chat.time.hoursAgo', { n: parts.n }));
    case 'yesterday':
      return String(t('chat.time.yesterday', { time: parts.hm }));
    case 'dayBeforeYesterday':
      return String(t('chat.time.dayBeforeYesterday', { time: parts.hm }));
    case 'weekday':
      return String(
        t('chat.time.weekday', {
          day: t(WEEKDAY_KEYS[parts.weekday] || WEEKDAY_KEYS[0]),
          time: parts.hm,
        }),
      );
    case 'date':
      return String(t('chat.time.date', { month: parts.month, day: parts.day, time: parts.hm }));
    case 'dateYear':
      return String(
        t('chat.time.dateYear', {
          year: parts.year,
          month: parts.month,
          day: parts.day,
          time: parts.hm,
        }),
      );
    default:
      return parts.hm;
  }
}

export function formatChatTime(
  iso: string | null | undefined,
  t: TFn,
  now: Date | number = Date.now(),
): string {
  const parts = getChatTimeParts(iso, now);
  if (!parts) return '';
  return renderParts(t, parts);
}
