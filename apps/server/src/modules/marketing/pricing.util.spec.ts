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

  it('applies member percent after promo/coupon and exposes memberDiscount', () => {
    const result = computePricing({
      lines: [{ dishId: '1', amount: 200000, status: 'pending' }],
      channel: 'dine_in',
      rules: [
        {
          id: 'r1',
          nameZh: '满减',
          nameVi: 'x',
          type: CouponDiscountType.amount,
          value: 20000,
          minSpend: 100000,
          scope: PromoScope.order,
          dishIds: null,
          channel: PromoChannel.all,
        },
      ],
      memberPercent: 10,
      manualDiscount: 0,
      roundOff: 0,
    });
    // 200000 - 20000 promo = 180000; 10% member = 18000 → total 162000
    expect(result.subtotal).toBe(200000);
    expect(result.promoDiscount).toBe(20000);
    expect(result.memberDiscount).toBe(18000);
    expect(result.discount).toBe(38000);
    expect(result.total).toBe(162000);
    expect(result.snapshot.memberDiscount).toBe(18000);
    expect(result.snapshot.memberPercent).toBe(10);
  });

  it('keeps identity subtotal - discount + fees = total', () => {
    const result = computePricing({
      lines,
      channel: 'delivery',
      rules: [],
      memberPercent: 5,
      manualDiscount: 1000,
      roundOff: 500,
      serviceCharge: 10000,
      deliveryFee: 15000,
    });
    expect(result.total).toBe(
      result.subtotal - result.discount + result.serviceCharge + result.deliveryFee,
    );
    expect(result.discount).toBe(
      result.promoDiscount +
        result.couponDiscount +
        result.memberDiscount +
        result.manualDiscount +
        result.roundOff,
    );
  });
});
