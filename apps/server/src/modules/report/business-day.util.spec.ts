import {
  businessDateOf,
  businessDayRange,
  eachBusinessDate,
  formatYmd,
  hcmWallToUtc,
  todayBusinessDate,
  utcToHcmParts,
} from './business-day.util';

describe('business-day.util', () => {
  it('maps wall clock around cut hour', () => {
    // 2026-10-30 03:30 HCM = 2026-10-29 20:30 UTC
    const before = hcmWallToUtc(2026, 10, 30, 3, 30, 0);
    expect(businessDateOf(before, 4)).toBe('2026-10-29');
    const after = hcmWallToUtc(2026, 10, 30, 4, 0, 0);
    expect(businessDateOf(after, 4)).toBe('2026-10-30');
  });

  it('businessDayRange is half-open [cut, nextCut)', () => {
    const { start, end } = businessDayRange('2026-10-30', 4);
    expect(businessDateOf(start, 4)).toBe('2026-10-30');
    expect(end.getTime() - start.getTime()).toBe(24 * 3600 * 1000);
    expect(businessDateOf(new Date(end.getTime() - 1), 4)).toBe('2026-10-30');
  });

  it('eachBusinessDate inclusive', () => {
    expect(eachBusinessDate('2026-10-28', '2026-10-30')).toEqual([
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
    ]);
  });

  it('utcToHcmParts + formatYmd roundtrip style', () => {
    const utc = hcmWallToUtc(2026, 1, 2, 15, 0, 0);
    const p = utcToHcmParts(utc);
    expect(formatYmd(p.y, p.m, p.d)).toBe('2026-01-02');
    expect(p.hour).toBe(15);
  });

  it('todayBusinessDate uses cut', () => {
    const noon = hcmWallToUtc(2026, 10, 30, 12, 0, 0);
    expect(todayBusinessDate(4, noon)).toBe('2026-10-30');
  });
});
