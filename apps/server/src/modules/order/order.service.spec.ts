import { OrderItemStatus, OrderStatus, PaymentMethod } from '@prisma/client';
import { Events } from '@restaurant/shared';
import { BusinessError } from '../../common/errors/business.error';
import { OrderService } from './order.service';

function makeEvents() {
  return { emit: jest.fn() };
}

function makeAudit() {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

describe('OrderService.calculateAmounts', () => {
  const service = new OrderService({} as never, makeEvents() as never, makeAudit() as never, { activeRulesAsSpecs: async () => [], couponAsSpec: async () => null, markCouponUsed: async () => undefined } as never, {} as never);

  it('sums non-voided items and applies discount/service', () => {
    const result = service.calculateAmounts({
      items: [
        { amount: 100000, status: 'pending' },
        { amount: 50000, status: OrderItemStatus.voided },
        { amount: 20000, status: 'served' },
      ],
      discount: 10000,
      serviceCharge: 5000,
    });
    expect(Number(result.subtotal)).toBe(120000);
    expect(Number(result.discount)).toBe(10000);
    expect(Number(result.serviceCharge)).toBe(5000);
    expect(Number(result.total)).toBe(115000);
  });

  it('clamps discount to subtotal', () => {
    const result = service.calculateAmounts({
      items: [{ amount: 30000, status: 'pending' }],
      discount: 99999,
      serviceCharge: 0,
    });
    expect(Number(result.discount)).toBe(30000);
    expect(Number(result.total)).toBe(0);
  });
});

describe('OrderService.deductStock', () => {
  it('throws DISH_SOLD_OUT when stock insufficient', async () => {
    const tx = {
      dish: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1n,
          status: 'on',
          isDineIn: true,
          stock: 1,
          dailyStock: null,
          soldToday: 0,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn(),
      },
    };
    const service = new OrderService({} as never, makeEvents() as never, makeAudit() as never, { activeRulesAsSpecs: async () => [], couponAsSpec: async () => null, markCouponUsed: async () => undefined } as never, {} as never);
    await expect(service.deductStock(tx as never, 1n, 2)).rejects.toMatchObject({
      errorCode: 'DISH_SOLD_OUT',
    });
  });

  it('decrements stock when enough', async () => {
    const tx = {
      dish: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1n,
          status: 'on',
          isDineIn: true,
          stock: 5,
          dailyStock: null,
          soldToday: 0,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
      },
    };
    const service = new OrderService({} as never, makeEvents() as never, makeAudit() as never, { activeRulesAsSpecs: async () => [], couponAsSpec: async () => null, markCouponUsed: async () => undefined } as never, {} as never);
    await service.deductStock(tx as never, 1n, 2);
    expect(tx.dish.updateMany).toHaveBeenCalledWith({
      where: { id: 1n, stock: { gte: 2 } },
      data: { stock: { decrement: 2 }, soldToday: { increment: 2 } },
    });
  });

  it('throws DISH_SOLD_OUT when daily stock exhausted', async () => {
    const tx = {
      dish: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1n,
          status: 'on',
          isDineIn: true,
          stock: null,
          dailyStock: 10,
          soldToday: 9,
        }),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
    };
    const service = new OrderService({} as never, makeEvents() as never, makeAudit() as never, { activeRulesAsSpecs: async () => [], couponAsSpec: async () => null, markCouponUsed: async () => undefined } as never, {} as never);
    await expect(service.deductStock(tx as never, 1n, 2)).rejects.toBeInstanceOf(BusinessError);
    await expect(service.deductStock(tx as never, 1n, 2)).rejects.toMatchObject({
      errorCode: 'DISH_SOLD_OUT',
    });
  });
});

describe('OrderService.submit / addItems / voidItem', () => {
  const dish = {
    id: 10n,
    storeId: 1n,
    status: 'on',
    isDineIn: true,
    nameZh: 'ÃÂ¥ÃÂ®ÃÂ«ÃÂ¤ÃÂ¿ÃÂÃÂ©ÃÂ¸ÃÂ¡ÃÂ¤ÃÂ¸ÃÂ',
    nameVi: 'GÃÂÃÂ  Kung Pao',
    price: 89000n,
    stock: null,
    dailyStock: null,
    soldToday: 0,
  };

  function basePrisma(overrides: Record<string, unknown> = {}) {
    const orderRow = {
      id: 100n,
      storeId: 1n,
      orderNo: 'D1',
      type: 'dine_in',
      source: 'waiter',
      tableSessionId: 50n,
      status: OrderStatus.open,
      subtotal: 89000n,
      discount: 0n,
      serviceCharge: 0n,
      deliveryFee: 0n,
      total: 89000n,
      paidAmount: 0n,
      paymentStatus: 'unpaid',
      remark: null,
      cancelReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      batches: [
        {
          id: 200n,
          orderId: 100n,
          roundNo: 1,
          source: 'waiter',
          guestNickname: null,
          printStatus: 'pending',
          createdAt: new Date(),
          items: [
            {
              id: 300n,
              orderId: 100n,
              batchId: 200n,
              dishId: 10n,
              nameZh: dish.nameZh,
              nameVi: dish.nameVi,
              unitPrice: 89000n,
              qty: 1,
              amount: 89000n,
              status: OrderItemStatus.pending,
              voidReason: null,
              optionsSnapshot: null,
              guestNickname: null,
            },
          ],
        },
      ],
      items: [
        {
          id: 300n,
          orderId: 100n,
          batchId: 200n,
          dishId: 10n,
          nameZh: dish.nameZh,
          nameVi: dish.nameVi,
          unitPrice: 89000n,
          qty: 1,
          amount: 89000n,
          status: OrderItemStatus.pending,
          voidReason: null,
        },
      ],
      payments: [],
      tableSession: {
        id: 50n,
        status: 'open',
        table: { id: 7n, code: 'A01' },
      },
    };

    return {
      table: {
        findFirst: jest.fn().mockResolvedValue({
          id: 7n,
          storeId: 1n,
          status: 'dining',
          currentSessionId: 50n,
          currentSession: { id: 50n, orders: [] },
        }),
      },
      order: {
        findUnique: jest.fn().mockResolvedValue(orderRow),
        findFirst: jest.fn().mockResolvedValue(orderRow),
        create: jest.fn().mockResolvedValue({ id: 100n }),
        update: jest.fn().mockResolvedValue(orderRow),
        findUniqueOrThrow: jest.fn().mockResolvedValue(orderRow),
      },
      orderBatch: {
        create: jest.fn().mockResolvedValue({ id: 200n, roundNo: 1 }),
      },
      orderItem: {
        create: jest.fn().mockResolvedValue({ id: 300n }),
        findMany: jest.fn().mockResolvedValue(orderRow.items),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      dish: {
        findFirst: jest.fn().mockResolvedValue(dish),
        findUnique: jest.fn().mockResolvedValue(dish),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          dish: {
            findFirst: jest.fn().mockResolvedValue(dish),
            findUnique: jest.fn().mockResolvedValue(dish),
            update: jest.fn(),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          order: {
            create: jest.fn().mockResolvedValue({ id: 100n }),
            findFirst: jest.fn().mockResolvedValue({
              ...orderRow,
              batches: [{ roundNo: 1 }],
            }),
            findUniqueOrThrow: jest.fn().mockResolvedValue(orderRow),
            update: jest.fn(),
          },
          orderBatch: {
            create: jest.fn().mockResolvedValue({ id: 201n, roundNo: 2 }),
          },
          orderItem: {
            create: jest.fn(),
            findMany: jest.fn().mockResolvedValue([
              ...orderRow.items,
              {
                id: 301n,
                orderId: 100n,
                amount: 89000n,
                status: OrderItemStatus.pending,
                dishId: 10n,
                qty: 1,
              },
            ]),
            findUnique: jest.fn().mockResolvedValue({
              id: 300n,
              orderId: 100n,
              dishId: 10n,
              qty: 1,
              status: OrderItemStatus.pending,
              order: { storeId: 1n, status: OrderStatus.open },
            }),
            update: jest.fn(),
          },
          payment: { create: jest.fn(), deleteMany: jest.fn() },
          table: { update: jest.fn() },
          tableSession: { update: jest.fn() },
        };
        return fn(tx);
      }),
      ...overrides,
    };
  }

  it('submit creates order + batch and emits ORDER_CREATED', async () => {
    const prisma = basePrisma();
    const events = makeEvents();
    const service = new OrderService(prisma as never, events as never, makeAudit() as never, { activeRulesAsSpecs: async () => [], couponAsSpec: async () => null, markCouponUsed: async () => undefined } as never, {} as never);
    const result = await service.submit(
      '1',
      { tableId: '7', items: [{ dishId: '10', qty: 1 }] },
      '9',
    );
    expect(result.orderNo).toBeDefined();
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith(Events.ORDER_CREATED, expect.any(Object));
    expect(events.emit).toHaveBeenCalledWith(Events.ORDER_BATCH_ADDED, expect.any(Object));
  });

  it('addItems creates next round batch', async () => {
    const prisma = basePrisma();
    const events = makeEvents();
    const service = new OrderService(prisma as never, events as never, makeAudit() as never, { activeRulesAsSpecs: async () => [], couponAsSpec: async () => null, markCouponUsed: async () => undefined } as never, {} as never);
    await service.addItems('1', '100', { items: [{ dishId: '10', qty: 1 }] }, '9');
    expect(events.emit).toHaveBeenCalledWith(Events.ORDER_BATCH_ADDED, expect.any(Object));
  });

  it('voidItem restores stock and emits ORDER_ITEM_VOIDED', async () => {
    const prisma = basePrisma();
    const events = makeEvents();
    const service = new OrderService(prisma as never, events as never, makeAudit() as never, { activeRulesAsSpecs: async () => [], couponAsSpec: async () => null, markCouponUsed: async () => undefined } as never, {} as never);
    await service.voidItem('1', '300', { reason: 'guest cancel' }, '9');
    expect(events.emit).toHaveBeenCalledWith(
      Events.ORDER_ITEM_VOIDED,
      expect.objectContaining({ itemId: '300', reason: 'guest cancel' }),
    );
  });

  it('checkout rejects mismatched payment total', async () => {
    const prisma = basePrisma();
    const service = new OrderService(prisma as never, makeEvents() as never, makeAudit() as never, { activeRulesAsSpecs: async () => [], couponAsSpec: async () => null, markCouponUsed: async () => undefined } as never, {} as never);
    await expect(
      service.checkout(
        '1',
        '100',
        { payments: [{ method: PaymentMethod.cash, amount: 1, received: 1 }] },
        '9',
      ),
    ).rejects.toMatchObject({ errorCode: 'PAYMENT_AMOUNT_MISMATCH' });
  });
});
