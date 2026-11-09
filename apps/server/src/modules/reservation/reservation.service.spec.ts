import { ReservationStatus, SessionStatus, TableStatus } from '@prisma/client';
import { BusinessError } from '../../common/errors/business.error';
import { ReservationService } from './reservation.service';

/** 构造最小化 PrismaService mock */
function makePrisma() {
  return {
    reservation: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    reservationItem: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    dish: {
      findFirst: jest.fn(),
    },
    table: {
      findFirst: jest.fn(),
    },
    area: {
      findFirst: jest.fn(),
    },
    tableSession: {
      create: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        tableSession: { create: jest.fn().mockResolvedValue({ id: 100n }) },
        table: { update: jest.fn() },
        reservation: {
          create: jest.fn(),
          update: jest.fn(),
          findUniqueOrThrow: jest.fn(),
        },
        reservationItem: {
          deleteMany: jest.fn(),
          createMany: jest.fn(),
        },
      }),
    ),
  };
}

function makeOrders() {
  return { submit: jest.fn().mockResolvedValue({ id: '500' }) };
}

function makeMembers() {
  return {
    reservationPerk: jest
      .fn()
      .mockResolvedValue({ priority: false, birthdayGift: false, customerId: null }),
  };
}

/** 构造预定 mock 行 */
function makeReservationRow(
  overrides: Partial<{
    status: ReservationStatus;
    items: unknown[];
    seatedSessionId: bigint | null;
    seatedSession: { id: bigint; status: SessionStatus } | null;
  }> = {},
) {
  return {
    id: 1n,
    storeId: 1n,
    customerName: '张三',
    phone: '0901234567',
    guestCount: 2,
    reserveAt: new Date('2026-10-30T19:00:00+07:00'),
    tableId: null,
    table: null,
    areaId: null,
    area: null,
    customerId: null,
    memberPriority: false,
    status: overrides.status ?? ReservationStatus.pending,
    deposit: 0n,
    remark: null,
    createdBy: 1n,
    seatedSessionId: overrides.seatedSessionId ?? null,
    seatedSession: overrides.seatedSession ?? null,
    items: overrides.items ?? [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>, orders = makeOrders()) {
  return new ReservationService(
    prisma as never,
    { emit: jest.fn() } as never,
    makeMembers() as never,
    orders as never,
  );
}

describe('ReservationService.confirm', () => {
  it('非 pending 状态抛出 RESERVATION_NOT_PENDING', async () => {
    const prisma = makePrisma();
    prisma.reservation.findFirst.mockResolvedValue(
      makeReservationRow({ status: ReservationStatus.confirmed }),
    );
    await expect(makeService(prisma).confirm('1', '1')).rejects.toThrow(BusinessError);
  });

  it('pending → confirmed 正常变更', async () => {
    const prisma = makePrisma();
    prisma.reservation.findFirst.mockResolvedValue(makeReservationRow());
    const updated = makeReservationRow({ status: ReservationStatus.confirmed });
    prisma.reservation.update.mockResolvedValue(updated);
    prisma.reservation.count.mockResolvedValue(0);

    const result = await makeService(prisma).confirm('1', '1');
    expect(result.status).toBe(ReservationStatus.confirmed);
  });
});

describe('ReservationService.cancel', () => {
  it('已入座不可取消', async () => {
    const prisma = makePrisma();
    prisma.reservation.findFirst.mockResolvedValue(
      makeReservationRow({ status: ReservationStatus.seated }),
    );
    await expect(makeService(prisma).cancel('1', '1', {})).rejects.toThrow(BusinessError);
  });

  it('已取消不可再取消', async () => {
    const prisma = makePrisma();
    prisma.reservation.findFirst.mockResolvedValue(
      makeReservationRow({ status: ReservationStatus.cancelled }),
    );
    await expect(makeService(prisma).cancel('1', '1', {})).rejects.toThrow(BusinessError);
  });

  it('pending → cancelled 正常变更', async () => {
    const prisma = makePrisma();
    prisma.reservation.findFirst.mockResolvedValue(makeReservationRow());
    const updated = makeReservationRow({ status: ReservationStatus.cancelled });
    prisma.reservation.update.mockResolvedValue(updated);
    prisma.reservation.count.mockResolvedValue(0);

    const result = await makeService(prisma).cancel('1', '1', { reason: '顾客取消' });
    expect(result.status).toBe(ReservationStatus.cancelled);
  });
});

describe('ReservationService.noShow', () => {
  it('已入座时不可标记 no_show', async () => {
    const prisma = makePrisma();
    prisma.reservation.findFirst.mockResolvedValue(
      makeReservationRow({ status: ReservationStatus.seated }),
    );
    await expect(makeService(prisma).noShow('1', '1')).rejects.toThrow(BusinessError);
  });

  it('confirmed → no_show 正常变更', async () => {
    const prisma = makePrisma();
    prisma.reservation.findFirst.mockResolvedValue(
      makeReservationRow({ status: ReservationStatus.confirmed }),
    );
    const updated = makeReservationRow({ status: ReservationStatus.no_show });
    prisma.reservation.update.mockResolvedValue(updated);
    prisma.reservation.count.mockResolvedValue(0);

    const result = await makeService(prisma).noShow('1', '1');
    expect(result.status).toBe(ReservationStatus.no_show);
  });
});

describe('ReservationService.seat', () => {
  it('已入座时不可再次入座', async () => {
    const prisma = makePrisma();
    prisma.reservation.findFirst.mockResolvedValue(
      makeReservationRow({ status: ReservationStatus.seated }),
    );
    await expect(makeService(prisma).seat('1', '1', {}, '1')).rejects.toThrow(BusinessError);
  });

  it('指定桌台不存在时抛出 TABLE_NOT_FOUND', async () => {
    const prisma = makePrisma();
    prisma.reservation.findFirst.mockResolvedValue(makeReservationRow());
    prisma.table.findFirst.mockResolvedValue(null);

    await expect(makeService(prisma).seat('1', '1', { tableId: '99' }, '1')).rejects.toThrow(
      BusinessError,
    );
  });

  it('桌台非 idle 时抛出 TABLE_NOT_IDLE', async () => {
    const prisma = makePrisma();
    prisma.reservation.findFirst.mockResolvedValue(makeReservationRow());
    prisma.table.findFirst.mockResolvedValue({
      id: 1n,
      status: TableStatus.dining,
      currentSessionId: 5n,
    });

    await expect(makeService(prisma).seat('1', '1', { tableId: '1' }, '1')).rejects.toThrow(
      BusinessError,
    );
  });

  it('无桌台时直接入座（状态 → seated）', async () => {
    const prisma = makePrisma();
    prisma.reservation.findFirst.mockResolvedValue(makeReservationRow());
    const updated = makeReservationRow({ status: ReservationStatus.seated });
    prisma.reservation.update.mockResolvedValue(updated);
    prisma.reservation.count.mockResolvedValue(0);

    const result = await makeService(prisma).seat('1', '1', {}, '1');
    expect(result.status).toBe(ReservationStatus.seated);
  });

  it('有预点菜且开台时调用 order.submit', async () => {
    const prisma = makePrisma();
    const items = [
      {
        id: 10n,
        reservationId: 1n,
        dishId: 7n,
        nameZh: '宫保鸡丁',
        nameVi: 'Ga',
        qty: 2,
        unitPrice: 80000n,
        optionsSnapshot: null,
        remark: null,
        sort: 0,
        createdAt: new Date(),
      },
    ];
    prisma.reservation.findFirst.mockResolvedValue(
      makeReservationRow({ status: ReservationStatus.confirmed, items }),
    );
    prisma.table.findFirst.mockResolvedValue({
      id: 3n,
      status: TableStatus.idle,
      currentSessionId: null,
    });
    const updated = makeReservationRow({ status: ReservationStatus.seated, items });
    prisma.reservation.update.mockResolvedValue(updated);
    prisma.reservation.count.mockResolvedValue(0);

    const orders = makeOrders();
    const result = await makeService(prisma, orders).seat('1', '1', { tableId: '3' }, '9');
    expect(result.status).toBe(ReservationStatus.seated);
    expect(orders.submit).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({
        tableId: '3',
        items: [{ dishId: '7', qty: 2, optionsSnapshot: undefined }],
      }),
      '9',
    );
    expect(result.orderId).toBe('500');
  });
});

describe('ReservationService.list', () => {
  it('返回分页数据', async () => {
    const prisma = makePrisma();
    prisma.reservation.count.mockResolvedValue(2);
    prisma.reservation.findMany.mockResolvedValue([
      makeReservationRow(),
      makeReservationRow({ status: ReservationStatus.confirmed }),
    ]);

    const result = await makeService(prisma).list('1', {});
    expect(result.total).toBe(2);
    expect(result.list).toHaveLength(2);
    expect(result.list[0].customerName).toBe('张三');
    expect(result.list[0].preorderCount).toBe(0);
  });
});

describe('ReservationService.listKitchenPreorders', () => {
  it('仅返回已确认且含菜的预定', async () => {
    const prisma = makePrisma();
    prisma.reservation.findMany.mockResolvedValue([
      makeReservationRow({
        status: ReservationStatus.confirmed,
        items: [
          {
            id: 1n,
            reservationId: 1n,
            dishId: 1n,
            nameZh: '白米饭',
            nameVi: 'Com',
            qty: 1,
            unitPrice: 10000n,
            optionsSnapshot: null,
            remark: null,
            sort: 0,
            createdAt: new Date(),
          },
        ],
      }),
    ]);
    const list = await makeService(prisma).listKitchenPreorders('1');
    expect(list).toHaveLength(1);
    expect(list[0].preorderCount).toBe(1);
  });
});

describe('ReservationService.delete', () => {
  it('用餐中的入座预定不可删除', async () => {
    const prisma = makePrisma();
    prisma.reservation.findFirst.mockResolvedValue(
      makeReservationRow({
        status: ReservationStatus.seated,
        seatedSessionId: 9n,
        seatedSession: { id: 9n, status: SessionStatus.open },
      }),
    );
    await expect(makeService(prisma).delete('1', '1')).rejects.toThrow(BusinessError);
    expect(prisma.reservation.delete).not.toHaveBeenCalled();
  });

  it('入座但会话已结束时可删除', async () => {
    const prisma = makePrisma();
    prisma.reservation.findFirst.mockResolvedValue(
      makeReservationRow({
        status: ReservationStatus.seated,
        seatedSessionId: 9n,
        seatedSession: { id: 9n, status: SessionStatus.closed },
      }),
    );
    prisma.reservation.delete.mockResolvedValue({});
    prisma.reservation.count.mockResolvedValue(0);
    await expect(makeService(prisma).delete('1', '1')).resolves.toEqual({ success: true });
    expect(prisma.reservation.delete).toHaveBeenCalled();
  });

  it('入座但无会话记录时可删除（历史测试数据）', async () => {
    const prisma = makePrisma();
    prisma.reservation.findFirst.mockResolvedValue(
      makeReservationRow({ status: ReservationStatus.seated, seatedSessionId: null }),
    );
    prisma.reservation.delete.mockResolvedValue({});
    prisma.reservation.count.mockResolvedValue(0);
    await expect(makeService(prisma).delete('1', '1')).resolves.toEqual({ success: true });
  });
});

describe('ReservationService 顾客自助', () => {
  it('listByPhone 按归一化手机号查询', async () => {
    const prisma = makePrisma();
    prisma.reservation.findMany.mockResolvedValue([makeReservationRow()]);
    const list = await makeService(prisma).listByPhone('1', ' 0901234567 ');
    expect(list).toHaveLength(1);
    expect(prisma.reservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ phone: '0901234567' }),
      }),
    );
  });

  it('cancelByPhone 手机号不匹配时拒绝', async () => {
    const prisma = makePrisma();
    prisma.reservation.findFirst.mockResolvedValue(makeReservationRow());
    await expect(
      makeService(prisma).cancelByPhone('1', '1', { phone: '0999999999' }),
    ).rejects.toBeInstanceOf(BusinessError);
  });

  it('cancelByPhone 手机号匹配时可取消', async () => {
    const prisma = makePrisma();
    prisma.reservation.findFirst.mockResolvedValue(makeReservationRow());
    prisma.reservation.update.mockResolvedValue(
      makeReservationRow({ status: ReservationStatus.cancelled }),
    );
    prisma.reservation.count.mockResolvedValue(0);
    const row = await makeService(prisma).cancelByPhone('1', '1', {
      phone: '0901234567',
      reason: '改期',
    });
    expect(row.status).toBe(ReservationStatus.cancelled);
  });
});
