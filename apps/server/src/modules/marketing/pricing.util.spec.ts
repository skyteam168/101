import { CouponDiscountType, PromoChannel, PromoScope } from '@prisma/client';
import { computePricing } from './pricing.util';

describe('computePricing', () => {
  const lines = [
    { dishId: '1', amount: 200000, status: 'pending' },
    { dishId: '2', amount: 50000, status: 'pending' },
  ];

  it('applies amount promo then coupon percent', () => {
    const result = computePricing({
      lines,
      channel: 'delivery',
      rules: [
        {
          id: 'r1',
          nameZh: '满减',
          nameVi: 'x',
          type: CouponDiscountType.amount,
          value: 20000,
          minSpend: 200000,
          scope: PromoScope.order,
          dishIds: null,
          channel: PromoChannel.all,
        },
      ],
      coupon: {
        id: 'c1',
        nameZh: '9折',
        nameVi: 'x',
        type: CouponDiscountType.percent,
        value: 10,
        minSpend: 100000,
        scope: PromoScope.order,
        dishIds: null,
        channel: PromoChannel.all,
      },
      manualDiscount: 0,
      roundOff: 0,
    });
    expect(result.subtotal).toBe(250000);
    expect(result.promoDiscount).toBe(20000);
    expect(result.couponDiscount).toBe(23000);
    expect(result.total).toBe(207000);
  });

  it('gift lines excluded from subtotal', () => {
    const result = computePricing({
      lines: [
        { dishId: '1', amount: 100000, status: 'pending' },
        { dishId: '2', amount: 0, status: 'pending', isGift: true },
      ],
      channel: 'dine_in',
      rules: [],
    });
    expect(result.subtotal).toBe(100000);
    expect(result.total).toBe(100000);
  });
});
