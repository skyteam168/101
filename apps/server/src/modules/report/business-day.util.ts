/** 越南无夏令时，固定 UTC+7；对外统一按 Asia/Ho_Chi_Minh 理解营业日 */

export const HCM_OFFSET_MS = 7 * 60 * 60 * 1000;

export function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split('-').map((x) => Number(x));
  if (!y || !m || !d) throw new Error('INVALID_DATE');
  return { y, m, d };
}

/** 将胡志明墙钟时间转为 UTC Date */
export function hcmWallToUtc(y: number, m: number, d: number, hour = 0, minute = 0, second = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, hour, minute, second) - HCM_OFFSET_MS);
}

/** UTC Date → 胡志明墙钟 Y-M-D-H */
export function utcToHcmParts(date: Date): {
  y: number;
  m: number;
  d: number;
  hour: number;
  minute: number;
} {
  const t = new Date(date.getTime() + HCM_OFFSET_MS);
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    hour: t.getUTCHours(),
    minute: t.getUTCMinutes(),
  };
}

export function formatYmd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * 给定时刻所属营业日（切日 hour，默认 4 点）。
 * 例：cut=4，10-30 03:59 → 营业日 10-29；10-30 04:00 → 营业日 10-30
 */
export function businessDateOf(instant: Date, cutHour: number): string {
  const p = utcToHcmParts(instant);
  let { y, m, d, hour } = p;
  if (hour < cutHour) {
    const prev = hcmWallToUtc(y, m, d, 12, 0, 0);
    prev.setUTCDate(prev.getUTCDate() - 1);
    const pp = utcToHcmParts(prev);
    y = pp.y;
    m = pp.m;
    d = pp.d;
  }
  return formatYmd(y, m, d);
}

/** 营业日 [start, end) UTC 区间 */
export function businessDayRange(businessDate: string, cutHour: number): { start: Date; end: Date } {
  const { y, m, d } = parseYmd(businessDate);
  const start = hcmWallToUtc(y, m, d, cutHour, 0, 0);
  const next = new Date(start.getTime());
  next.setUTCDate(next.getUTCDate() + 1);
  return { start, end: next };
}

/** 今日营业日（HCM） */
export function todayBusinessDate(cutHour: number, now = new Date()): string {
  return businessDateOf(now, cutHour);
}

/** 列出 [fromYmd, toYmd] 闭区间内每个营业日 */
export function eachBusinessDate(fromYmd: string, toYmd: string): string[] {
  const from = parseYmd(fromYmd);
  const to = parseYmd(toYmd);
  let cur = hcmWallToUtc(from.y, from.m, from.d, 12, 0, 0);
  const end = hcmWallToUtc(to.y, to.m, to.d, 12, 0, 0);
  const out: string[] = [];
  while (cur.getTime() <= end.getTime()) {
    const p = utcToHcmParts(cur);
    out.push(formatYmd(p.y, p.m, p.d));
    cur = new Date(cur.getTime() + 24 * 3600 * 1000);
  }
  return out;
}
