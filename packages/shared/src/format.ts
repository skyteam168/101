/**
 * 格式化越南盾金额（整数盾）。
 * 中文界面也统一显示 VND。
 */
export function formatVND(amount: number | bigint | null | undefined): string {
  const n = amount == null ? 0 : typeof amount === 'bigint' ? Number(amount) : amount;
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(n);
}

/** 聊天相对时间结果（由前端 i18n 拼文案） */
export type ChatTimeParts =
  | { kind: 'justNow'; hm: string }
  | { kind: 'minutesAgo'; n: number; hm: string }
  | { kind: 'hoursAgo'; n: number; hm: string }
  | { kind: 'yesterday'; hm: string }
  | { kind: 'dayBeforeYesterday'; hm: string }
  | { kind: 'weekday'; weekday: number; hm: string }
  | { kind: 'date'; month: number; day: number; hm: string }
  | { kind: 'dateYear'; year: number; month: number; day: number; hm: string };

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * 聊天消息相对时间：刚刚 / N分钟前 / N小时前 / 昨天 / 前天 / 星期 / 日期。
 * 前端用 vue-i18n 翻译 kind。
 */
export function getChatTimeParts(
  iso: string | Date | null | undefined,
  now: Date | number = new Date(),
): ChatTimeParts | null {
  if (iso == null || iso === '') return null;
  const then = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const nowDate = typeof now === 'number' ? new Date(now) : now;
  const diffMs = Math.max(0, nowDate.getTime() - then.getTime());
  const hm = `${pad2(then.getHours())}:${pad2(then.getMinutes())}`;

  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return { kind: 'justNow', hm };

  const min = Math.floor(sec / 60);
  if (min < 60) return { kind: 'minutesAgo', n: min, hm };

  const dayThen = startOfLocalDay(then);
  const dayNow = startOfLocalDay(nowDate);
  const dayDiff = Math.round((dayNow - dayThen) / 86400000);

  if (dayDiff === 0) {
    const hours = Math.floor(min / 60);
    return { kind: 'hoursAgo', n: Math.max(1, hours), hm };
  }
  if (dayDiff === 1) return { kind: 'yesterday', hm };
  if (dayDiff === 2) return { kind: 'dayBeforeYesterday', hm };
  if (dayDiff > 2 && dayDiff < 7) {
    return { kind: 'weekday', weekday: then.getDay(), hm };
  }
  if (then.getFullYear() === nowDate.getFullYear()) {
    return { kind: 'date', month: then.getMonth() + 1, day: then.getDate(), hm };
  }
  return {
    kind: 'dateYear',
    year: then.getFullYear(),
    month: then.getMonth() + 1,
    day: then.getDate(),
    hm,
  };
}

/** 两条消息间隔超过该毫秒数时插入时间分隔条（默认 5 分钟） */
export const CHAT_TIME_GAP_MS = 5 * 60 * 1000;

export function shouldShowChatTimeDivider(
  prevIso: string | null | undefined,
  currIso: string | null | undefined,
  gapMs = CHAT_TIME_GAP_MS,
): boolean {
  if (!currIso) return false;
  if (!prevIso) return true;
  const a = new Date(prevIso).getTime();
  const b = new Date(currIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return b - a >= gapMs;
}

/** 仅返回 HH:mm，用于气泡内时刻 */
export function formatChatClock(iso: string | Date | null | undefined): string {
  if (iso == null || iso === '') return '';
  const then = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const h = then.getHours();
  const m = then.getMinutes();
  return `${h < 10 ? `0${h}` : h}:${m < 10 ? `0${m}` : m}`;
}
