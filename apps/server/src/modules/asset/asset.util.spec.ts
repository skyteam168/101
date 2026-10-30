import {
  assertQtyBalance,
  monthsBetween,
  QtyState,
  straightLineNetUnit,
} from './asset.util';

describe('asset.util', () => {
  it('straightLineNetUnit halves after half life', () => {
    const purchase = new Date(2024, 0, 1);
    const asOf = new Date(2024, 18, 1); // 18 months
    expect(straightLineNetUnit(100000, purchase, 36, asOf)).toBe(50000);
  });

  it('straightLineNetUnit is 0 after full depreciation', () => {
    const purchase = new Date(2020, 0, 1);
    const asOf = new Date(2024, 0, 1);
    expect(straightLineNetUnit(100000, purchase, 36, asOf)).toBe(0);
  });

  it('straightLineNetUnit without purchase returns full price', () => {
    expect(straightLineNetUnit(88000, null, 36)).toBe(88000);
  });

  it('monthsBetween works across years', () => {
    expect(monthsBetween(new Date(2023, 10, 1), new Date(2024, 1, 1))).toBe(3);
  });

  it('assertQtyBalance rejects negative or imbalance', () => {
    const bad: QtyState = {
      qtyTotal: 5,
      qtyInUse: 2,
      qtyIdle: 2,
      qtyRepair: 0,
      qtyDisposed: 0,
    };
    expect(() => assertQtyBalance(bad)).toThrow();
    const ok: QtyState = {
      qtyTotal: 5,
      qtyInUse: 2,
      qtyIdle: 2,
      qtyRepair: 1,
      qtyDisposed: 0,
    };
    expect(() => assertQtyBalance(ok)).not.toThrow();
  });
});
