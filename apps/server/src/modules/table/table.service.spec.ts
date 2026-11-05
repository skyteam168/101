import { BusinessError } from '../../common/errors/business.error';
import { TableService } from './table.service';

describe('TableService.deleteTable', () => {
  function makeService(prisma: Record<string, unknown>) {
    return new TableService(prisma as never, { emit: jest.fn() } as never, {
      get: jest.fn(),
    } as never);
  }

  it('空闲且无预定时解绑历史会话后删除', async () => {
    const tx = {
      table: {
        findFirst: jest.fn().mockResolvedValue({
          id: 5n,
          storeId: 1n,
          status: 'idle',
          currentSessionId: null,
        }),
        delete: jest.fn().mockResolvedValue({}),
      },
      tableSession: {
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      reservation: {
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const result = await makeService(prisma).deleteTable('1', '5');
    expect(result).toEqual({ ok: true });
    expect(tx.reservation.updateMany).toHaveBeenCalled();
    expect(tx.tableSession.updateMany).toHaveBeenCalledWith({
      where: { tableId: 5n },
      data: { tableId: null },
    });
    expect(tx.table.delete).toHaveBeenCalledWith({ where: { id: 5n } });
  });

  it('有未完成预定时抛出 TABLE_HAS_ACTIVE_RESERVATION', async () => {
    const tx = {
      table: {
        findFirst: jest.fn().mockResolvedValue({
          id: 5n,
          storeId: 1n,
          status: 'idle',
          currentSessionId: null,
        }),
        delete: jest.fn(),
      },
      tableSession: { count: jest.fn().mockResolvedValue(0), updateMany: jest.fn() },
      reservation: {
        count: jest.fn().mockResolvedValue(1),
        updateMany: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    await expect(makeService(prisma).deleteTable('1', '5')).rejects.toBeInstanceOf(BusinessError);
    await expect(makeService(prisma).deleteTable('1', '5')).rejects.toMatchObject({
      errorCode: 'TABLE_HAS_ACTIVE_RESERVATION',
    });
    expect(tx.table.delete).not.toHaveBeenCalled();
  });

  it('非空闲抛出 TABLE_NOT_IDLE', async () => {
    const tx = {
      table: {
        findFirst: jest.fn().mockResolvedValue({
          id: 5n,
          storeId: 1n,
          status: 'dining',
          currentSessionId: 9n,
        }),
      },
      tableSession: { count: jest.fn(), updateMany: jest.fn() },
      reservation: { count: jest.fn(), updateMany: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    await expect(makeService(prisma).deleteTable('1', '5')).rejects.toMatchObject({
      errorCode: 'TABLE_NOT_IDLE',
    });
  });
});
