import { OrderItemStatus, OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
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
  const service = new OrderService({} as never, makeEvents() as never, makeAudit() as never, { activeRulesAsSpecs: async () => [], couponAsSpec: async () => null, markCouponUsed: async () => undefined } as never, {} as never, { consumeRecipe: async () => undefined, restoreRecipe: async () => undefined } as never);

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
    const service = new OrderService({} as never, makeEvents() as never, makeAudit() as never, { activeRulesAsSpecs: async () => [], couponAsSpec: async () => null, markCouponUsed: async () => undefined } as never, {} as never, { consumeRecipe: async () => undefined, restoreRecipe: async () => undefined } as never);
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
    const service = new OrderService({} as never, makeEvents() as never, makeAudit() as never, { activeRulesAsSpecs: async () => [], couponAsSpec: async () => null, markCouponUsed: async () => undefined } as never, {} as never, { consumeRecipe: async () => undefined, restoreRecipe: async () => undefined } as never);
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
    const service = new OrderService({} as never, makeEvents() as never, makeAudit() as never, { activeRulesAsSpecs: async () => [], couponAsSpec: async () => null, markCouponUsed: async () => undefined } as never, {} as never, { consumeRecipe: async () => undefined, restoreRecipe: async () => undefined } as never);
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
      refunds: [],
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
    const service = new OrderService(prisma as never, events as never, makeAudit() as never, { activeRulesAsSpecs: async () => [], couponAsSpec: async () => null, markCouponUsed: async () => undefined } as never, {} as never, { consumeRecipe: async () => undefined, restoreRecipe: async () => undefined } as never);
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
    const service = new OrderService(prisma as never, events as never, makeAudit() as never, { activeRulesAsSpecs: async () => [], couponAsSpec: async () => null, markCouponUsed: async () => undefined } as never, {} as never, { consumeRecipe: async () => undefined, restoreRecipe: async () => undefined } as never);
    await service.addItems('1', '100', { items: [{ dishId: '10', qty: 1 }] }, '9');
    expect(events.emit).toHaveBeenCalledWith(Events.ORDER_BATCH_ADDED, expect.any(Object));
  });

  it('voidItem restores stock and emits ORDER_ITEM_VOIDED', async () => {
    const prisma = basePrisma();
    const events = makeEvents();
    const service = new OrderService(prisma as never, events as never, makeAudit() as never, { activeRulesAsSpecs: async () => [], couponAsSpec: async () => null, markCouponUsed: async () => undefined } as never, {} as never, { consumeRecipe: async () => undefined, restoreRecipe: async () => undefined } as never);
    await service.voidItem('1', '300', { reason: 'guest cancel' }, '9');
    expect(events.emit).toHaveBeenCalledWith(
      Events.ORDER_ITEM_VOIDED,
      expect.objectContaining({ itemId: '300', reason: 'guest cancel' }),
    );
  });

  it('checkout rejects mismatched non-cash payment total', async () => {
    const prisma = basePrisma();
    const service = new OrderService(prisma as never, makeEvents() as never, makeAudit() as never, { activeRulesAsSpecs: async () => [], couponAsSpec: async () => null, markCouponUsed: async () => undefined } as never, {} as never, { consumeRecipe: async () => undefined, restoreRecipe: async () => undefined } as never);
    await expect(
      service.checkout(
        '1',
        '100',
        { payments: [{ method: PaymentMethod.card, amount: 1 }] },
        '9',
      ),
    ).rejects.toMatchObject({ errorCode: 'PAYMENT_AMOUNT_MISMATCH' });
  });

  it('checkout cash rejects when received less than due', async () => {
    const prisma = basePrisma();
    const service = new OrderService(prisma as never, makeEvents() as never, makeAudit() as never, { activeRulesAsSpecs: async () => [], couponAsSpec: async () => null, markCouponUsed: async () => undefined } as never, {} as never, { consumeRecipe: async () => undefined, restoreRecipe: async () => undefined } as never);
    await expect(
      service.checkout(
        '1',
        '100',
        { payments: [{ method: PaymentMethod.cash, amount: 1, received: 1 }] },
        '9',
      ),
    ).rejects.toMatchObject({ errorCode: 'CASH_RECEIVED_INSUFFICIENT' });
  });
});

describe('OrderService.refund', () => {
  function paidPrisma(overrides: Partial<{
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    paidAmount: bigint;
    type: string;
  }> = {}) {
    const orderRow = {
      id: 100n,
      storeId: 1n,
      orderNo: 'D1',
      type: overrides.type ?? 'dine_in',
      source: 'waiter',
      tableSessionId: 50n,
      status: overrides.status ?? OrderStatus.paid,
      subtotal: 89000n,
      discount: 0n,
      roundOff: 0n,
      serviceCharge: 0n,
      deliveryFee: 0n,
      total: 89000n,
      paidAmount: overrides.paidAmount ?? 89000n,
      paymentStatus: overrides.paymentStatus ?? PaymentStatus.paid,
      remark: null,
      cancelReason: null,
      customerId: null,
      couponId: null,
      promoSnapshot: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      batches: [],
      items: [],
      payments: [
        {
          id: 1n,
          method: PaymentMethod.cash,
          amount: 89000n,
          received: 89000n,
          change: 0n,
          createdAt: new Date(),
        },
      ],
      refunds: [] as {
        id: bigint;
        method: PaymentMethod;
        amount: bigint;
        reason: string;
        operatorId: bigint | null;
        createdAt: Date;
      }[],
      tableSession: {
        id: 50n,
        status: 'closed',
        guestCount: 2,
        table: { id: 7n, code: 'A01' },
      },
    };

    const state = { order: orderRow };

    const prisma: Record<string, unknown> = {
      order: {
        findUnique: jest.fn(async () => ({ ...state.order })),
        findFirst: jest.fn(async () => ({ ...state.order })),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(state.order, data);
          return { ...state.order };
        }),
      },
      orderRefund: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = {
            id: 900n,
            method: data.method as PaymentMethod,
            amount: data.amount as bigint,
            reason: data.reason as string,
            operatorId: data.operatorId as bigint,
            createdAt: new Date(),
          };
          state.order.refunds = [...state.order.refunds, row];
          return row;
        }),
      },
    };
    prisma.$transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
    return { prisma, state };
  }

  it('full refund sets paymentStatus refunded and paidAmount 0', async () => {
    const { prisma, state } = paidPrisma();
    const audit = makeAudit();
    const events = makeEvents();
    const service = new OrderService(
      prisma as never,
      events as never,
      audit as never,
      { activeRulesAsSpecs: async () => [], couponAsSpec: async () => null, markCouponUsed: async () => undefined } as never,
      {} as never,
      { consumeRecipe: async () => undefined, restoreRecipe: async () => undefined } as never,
    );
    const result = await service.refund(
      '1',
      '100',
      { amount: 89000, method: PaymentMethod.cash, reason: 'customer request' },
      '9',
    );
    expect(state.order.paidAmount).toBe(0n);
    expect(state.order.paymentStatus).toBe(PaymentStatus.refunded);
    expect(result.paymentStatus).toBe(PaymentStatus.refunded);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'order.refund' }),
    );
    expect(events.emit).toHaveBeenCalledWith(Events.ORDER_STATUS_CHANGED, expect.any(Object));
  });

  it('partial refund leaves paymentStatus partial', async () => {
    const { prisma, state } = paidPrisma();
    const service = new OrderService(
      prisma as never,
      makeEvents() as never,
      makeAudit() as never,
      { activeRulesAsSpecs: async () => [], couponAsSpec: async () => null, markCouponUsed: async () => undefined } as never,
      {} as never,
      { consumeRecipe: async () => undefined, restoreRecipe: async () => undefined } as never,
    );
    await service.refund(
      '1',
      '100',
      { amount: 20000, method: PaymentMethod.bank_transfer, reason: 'partial' },
      '9',
    );
    expect(state.order.paidAmount).toBe(69000n);
    expect(state.order.paymentStatus).toBe(PaymentStatus.partial);
  });

  it('rejects open unpaid order', async () => {
    const { prisma } = paidPrisma({
      status: OrderStatus.open,
      paymentStatus: PaymentStatus.unpaid,
      paidAmount: 0n,
    });
    const service = new OrderService(
      prisma as never,
      makeEvents() as never,
      makeAudit() as never,
      { activeRulesAsSpecs: async () => [], couponAsSpec: async () => null, markCouponUsed: async () => undefined } as never,
      {} as never,
      { consumeRecipe: async () => undefined, restoreRecipe: async () => undefined } as never,
    );
    await expect(
      service.refund('1', '100', { amount: 1000, method: PaymentMethod.cash, reason: 'x' }, '9'),
    ).rejects.toMatchObject({ errorCode: 'ORDER_NOT_REFUNDABLE' });
  });

  it('rejects amount over remaining paid', async () => {
    const { prisma } = paidPrisma({ paidAmount: 10000n, paymentStatus: PaymentStatus.partial });
    const service = new OrderService(
      prisma as never,
      makeEvents() as never,
      makeAudit() as never,
      { activeRulesAsSpecs: async () => [], couponAsSpec: async () => null, markCouponUsed: async () => undefined } as never,
      {} as never,
      { consumeRecipe: async () => undefined, restoreRecipe: async () => undefined } as never,
    );
    await expect(
      service.refund('1', '100', { amount: 20000, method: PaymentMethod.cash, reason: 'x' }, '9'),
    ).rejects.toMatchObject({ errorCode: 'REFUND_EXCEEDS_PAID' });
  });

  it('allows refund on completed delivery', async () => {
    const { prisma, state } = paidPrisma({
      status: OrderStatus.completed,
      type: 'delivery',
    });
    const service = new OrderService(
      prisma as never,
      makeEvents() as never,
      makeAudit() as never,
      { activeRulesAsSpecs: async () => [], couponAsSpec: async () => null, markCouponUsed: async () => undefined } as never,
      {} as never,
      { consumeRecipe: async () => undefined, restoreRecipe: async () => undefined } as never,
    );
    await service.refund(
      '1',
      '100',
      { amount: 89000, method: PaymentMethod.bank_transfer, reason: 'wrong dish' },
      '9',
    );
    expect(state.order.paymentStatus).toBe(PaymentStatus.refunded);
  });
});
