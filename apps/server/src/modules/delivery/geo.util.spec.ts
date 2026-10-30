import { calcDeliveryFee, haversineKm, isValidVnPhone, isWithinBusinessHours } from './geo.util';

describe('geo.util', () => {
  it('haversineKm roughly computes short distance', () => {
    const km = haversineKm(10.754, 106.666, 10.76, 106.67);
    expect(km).toBeGreaterThan(0);
    expect(km).toBeLessThan(2);
  });

  it('calcDeliveryFee picks ladder tier', () => {
    const rules = [
      { maxKm: 2, fee: 15000 },
      { maxKm: 5, fee: 25000 },
    ];
    expect(calcDeliveryFee(1.2, rules)).toBe(15000);
    expect(calcDeliveryFee(3, rules)).toBe(25000);
    expect(calcDeliveryFee(9, rules)).toBe(25000);
  });

  it('isWithinBusinessHours', () => {
    const hours = { open: '09:00', close: '22:00', days: [0, 1, 2, 3, 4, 5, 6] };
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    expect(isWithinBusinessHours(d, hours)).toBe(true);
    d.setHours(23, 0, 0, 0);
    expect(isWithinBusinessHours(d, hours)).toBe(false);
  });

  it('isValidVnPhone', () => {
    expect(isValidVnPhone('0901234567')).toBe(true);
    expect(isValidVnPhone('+84901234567')).toBe(true);
    expect(isValidVnPhone('123')).toBe(false);
  });
});
