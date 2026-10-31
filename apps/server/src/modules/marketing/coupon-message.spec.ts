import { couponGiftMessage } from './coupon-message';

describe('couponGiftMessage', () => {
  it('describes an amount coupon in Chinese', () => {
    const text = couponGiftMessage({
      lang: 'zh',
      nameZh: '满减券',
      nameVi: 'Giảm tiền',
      type: 'amount',
      value: 20000,
      minSpend: 100000,
      channel: 'all',
      expiresAt: '2026-12-01T00:00:00.000Z',
    });
    expect(text).toContain('满减券');
    expect(text).toContain('20.000');
    expect(text).toContain('到店消费或外卖');
    expect(text).toContain('2026-12-01');
  });

  it('describes a percent coupon in Vietnamese for dine-in', () => {
    const text = couponGiftMessage({
      lang: 'vi',
      nameZh: '折扣',
      nameVi: 'Giảm 10%',
      type: 'percent',
      value: 10,
      minSpend: 0,
      channel: 'dine_in',
      expiresAt: '2026-12-01',
    });
    expect(text).toContain('Giảm 10%');
    expect(text).toContain('giảm 10%');
    expect(text).toContain('tại quán');
  });
});
