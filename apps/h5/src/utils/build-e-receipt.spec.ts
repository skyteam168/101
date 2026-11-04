import { describe, expect, it } from 'vitest';
import type { DeliveryOrder } from '../api/delivery';
import { buildEReceiptPayload, canShowEReceipt } from './build-e-receipt';

function baseOrder(over: Partial<DeliveryOrder> = {}): DeliveryOrder {
  return {
    id: '1',
    orderNo: 'D001',
    status: 'pending',
    subtotal: 100000,
    deliveryFee: 10000,
    total: 110000,
    items: [
      {
        id: 'i1',
        dishId: '1',
        nameZh: '宫保鸡丁',
        nameVi: 'Gà',
        unitPrice: 100000,
        qty: 1,
        amount: 100000,
      },
    ],
    statusTimeline: [],
    createdAt: '2026-11-04T01:00:00.000Z',
    updatedAt: '2026-11-04T01:10:00.000Z',
    ...over,
  };
}

describe('canShowEReceipt', () => {
  it('已付款 / 已完成可看', () => {
    expect(canShowEReceipt(baseOrder({ paymentStatus: 'paid' }))).toBe(true);
    expect(canShowEReceipt(baseOrder({ status: 'completed' }))).toBe(true);
    expect(canShowEReceipt(baseOrder({ status: 'paid' }))).toBe(true);
  });

  it('未付不可看', () => {
    expect(canShowEReceipt(baseOrder({ status: 'pending', paymentStatus: 'unpaid' }))).toBe(false);
  });
});

describe('buildEReceiptPayload', () => {
  it('组装 58mm receipt 字段', () => {
    const payload = buildEReceiptPayload(
      baseOrder({
        status: 'completed',
        payMethod: 'cash',
        paidAmount: 110000,
        statusTimeline: [{ status: 'completed', at: '2026-11-04T01:20:00.000Z' }],
      }),
      {
        nameZh: '好运中餐厅',
        nameVi: 'Nhà hàng',
        address: 'HCM',
        phone: '09',
      },
    );
    expect(payload.template).toBe('receipt');
    expect(payload.paperWidth).toBe(58);
    expect(payload.data.orderNo).toBe('D001');
    expect(payload.data.total).toBe(110000);
    expect(payload.data.paidAt).toBe('2026-11-04T01:20:00.000Z');
    expect(payload.data.payments?.[0]?.method).toBe('cash');
  });
});
