import { ReservationStatus, TableStatus } from '@prisma/client';
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
      count: jest.fn(),
      findMany: jest.fn(),
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
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn({
      tableSession: { create: jest.fn().mockResolvedValue({ id: 100n }) },
      table: { update: jest.fn() },
    })),
  };
}

/** 构造预定 mock 行 */
function makeReservationRow(overrides: Partial<{ status: ReservationStatus }> = {}) {
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
    status: overrides.status ?? ReservationStatus.pending,
    deposit: 0n,
    remark: null,
    createdBy: 1n,
    seatedSessionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('ReservationService.confirm', () => {
  it('非 pending 状态抛出 RESERVATION_NOT_PENDING', async () => {
    const prisma = makePrisma();
    prisma.reservation.findFirst.mockResolvedValue(
      makeReservationRow({ status: ReservationStatus.confirmed }),
    );
    const service = new ReservationService(prisma as never);
    await expect(service.confirm('1', '1')).rejects.toThrow(BusinessError);
  });

  it('pending → confirmed 正常变更', async () => {
    const prisma = makePrisma();
    prisma.reservation.findFirst.mockResolvedValue(makeReservationRow());
    const updated = makeReservationRow({ status: ReservationStatus.confirmed });
    prisma.reservation.update.mockResolvedValue(updated);

    const service = new ReservationService(prisma as never);
    const result = await service.confirm('1', '1');
    expect(result.status).toBe(ReservationStatus.confirmed);
  });
});

describe('ReservationService.cancel', () => {
  it('已入座不可取消', async () => {
    const prisma = makePrisma();
    prisma.reservation.findFirst.mockResolvedValue(
      makeReservationRow({ status: ReservationStatus.seated }),
    );
    const service = new ReservationService(prisma as never);
    await expect(service.cancel('1', '1', {})).rejects.toThrow(BusinessError);
  });

  it('已取消不可再取消', async () => {
    const prisma = makePrisma();
    prisma.reservation.findFirst.mockResolvedValue(
      makeReservationRow({ status: ReservationStatus.cancelled }),
    );
    const service = new ReservationService(prisma as never);
    await expect(service.cancel('1', '1', {})).rejects.toThrow(BusinessError);
  });

  it('pending → cancelled 正常变更', async () => {
    const prisma = makePrisma();
    prisma.reservation.findFirst.mockResolvedValue(makeReservationRow());
    const updated = makeReservationRow({ status: ReservationStatus.cancelled });
    prisma.reservation.update.mockResolvedValue(updated);

    const service = new ReservationService(prisma as never);
    const result = await service.cancel('1', '1', { reason: '顾客取消' });
    expect(result.status).toBe(ReservationStatus.cancelled);
  });
});

describe('ReservationService.noShow', () => {
  it('已入座时不可标记 no_show', async () => {
    const prisma = makePrisma();
    prisma.reservation.findFirst.mockResolvedValue(
      makeReservationRow({ status: ReservationStatus.seated }),
    );
    const service = new ReservationService(prisma as never);
    await expect(service.noShow('1', '1')).rejects.toThrow(BusinessError);
  });

  it('confirmed → no_show 正常变更', async () => {
    const prisma = makePrisma();
    prisma.reservation.findFirst.mockResolvedValue(
      makeReservationRow({ status: ReservationStatus.confirmed }),
    );
    const updated = makeReservationRow({ status: ReservationStatus.no_show });
    prisma.reservation.update.mockResolvedValue(updated);

    const service = new ReservationService(prisma as never);
    const result = await service.noShow('1', '1');
    expect(result.status).toBe(ReservationStatus.no_show);
  });
});

describe('ReservationService.seat', () => {
  it('已入座时不可再次入座', async () => {
    const prisma = makePrisma();
    prisma.reservation.findFirst.mockResolvedValue(
      makeReservationRow({ status: ReservationStatus.seated }),
    );
    const service = new ReservationService(prisma as never);
    await expect(service.seat('1', '1', {}, '1')).rejects.toThrow(BusinessError);
  });

  it('指定桌台不存在时抛出 TABLE_NOT_FOUND', async () => {
    const prisma = makePrisma();
    prisma.reservation.findFirst.mockResolvedValue(makeReservationRow());
    prisma.table.findFirst.mockResolvedValue(null);

    const service = new ReservationService(prisma as never);
    await expect(service.seat('1', '1', { tableId: '99' }, '1')).rejects.toThrow(BusinessError);
  });

  it('桌台非 idle 时抛出 TABLE_NOT_IDLE', async () => {
    const prisma = makePrisma();
    prisma.reservation.findFirst.mockResolvedValue(makeReservationRow());
    prisma.table.findFirst.mockResolvedValue({
      id: 1n,
      status: TableStatus.dining,
      currentSessionId: 5n,
    });

    const service = new ReservationService(prisma as never);
    await expect(service.seat('1', '1', { tableId: '1' }, '1')).rejects.toThrow(BusinessError);
  });

  it('无桌台时直接入座（状态 → seated）', async () => {
    const prisma = makePrisma();
    // 预定中没有 tableId
    prisma.reservation.findFirst.mockResolvedValue(makeReservationRow());
    const updated = makeReservationRow({ status: ReservationStatus.seated });
    prisma.reservation.update.mockResolvedValue(updated);

    const service = new ReservationService(prisma as never);
    const result = await service.seat('1', '1', {}, '1');
    expect(result.status).toBe(ReservationStatus.seated);
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

    const service = new ReservationService(prisma as never);
    const result = await service.list('1', {});
    expect(result.total).toBe(2);
    expect(result.list).toHaveLength(2);
    expect(result.list[0].customerName).toBe('张三');
  });
});
