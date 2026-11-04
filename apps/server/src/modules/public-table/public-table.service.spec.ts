import { SessionStatus, TableStatus } from '@prisma/client';
import { BusinessError } from '../../common/errors/business.error';
import { PublicTableService } from './public-table.service';

describe('PublicTableService peek / join', () => {
  const prisma = {
    table: { findUnique: jest.fn(), update: jest.fn() },
    tableSession: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const redis = { get: jest.fn(), set: jest.fn() };
  const jwt = { signAsync: jest.fn() };
  const config = { get: jest.fn().mockReturnValue('test-secret') };
  const events = { emit: jest.fn() };
  const realtime = { emitCartUpdated: jest.fn(), emitToStore: jest.fn() };
  const inventory = { consumeRecipe: jest.fn(), restoreRecipe: jest.fn() };

  let service: PublicTableService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PublicTableService(
      prisma as never,
      redis as never,
      jwt as never,
      config as never,
      events as never,
      realtime as never,
      inventory as never,
    );
    redis.get.mockResolvedValue(null);
    jwt.signAsync.mockResolvedValue('guest.jwt.token');
  });

  it('peek returns table meta', async () => {
    prisma.table.findUnique.mockResolvedValue({
      id: 3n,
      code: 'A01',
      seats: 4,
      status: TableStatus.idle,
      storeId: 1n,
      currentSessionId: null,
      store: {
        nameZh: '店',
        nameVi: 'Shop',
        qrAutoOpen: true,
        qrRequirePin: false,
      },
      area: { nameZh: '大厅', nameVi: 'Sảnh' },
      currentSession: null,
    });

    const r = await service.peek('tok-abc');
    expect(r).toMatchObject({
      tableId: '3',
      code: 'A01',
      storeId: '1',
      needPin: false,
      hasSession: false,
    });
  });

  it('peek throws TABLE_NOT_FOUND', async () => {
    prisma.table.findUnique.mockResolvedValue(null);
    await expect(service.peek('missing')).rejects.toBeInstanceOf(BusinessError);
  });

  it('join rejects cleaning table', async () => {
    prisma.table.findUnique.mockResolvedValue({
      id: 3n,
      code: 'A01',
      status: TableStatus.cleaning,
      storeId: 1n,
      currentSessionId: null,
      store: { qrAutoOpen: true, qrRequirePin: false },
      currentSession: null,
    });
    await expect(service.join('tok', { nickname: '客' })).rejects.toMatchObject({
      errorCode: 'TABLE_IS_CLEANING',
    });
  });

  it('join auto-opens idle table and returns guestToken', async () => {
    const session = {
      id: 10n,
      pin: '1234',
      sessionToken: 'sess-tok',
      status: SessionStatus.open,
    };
    prisma.table.findUnique.mockResolvedValue({
      id: 3n,
      code: 'A01',
      status: TableStatus.idle,
      storeId: 1n,
      currentSessionId: null,
      store: { qrAutoOpen: true, qrRequirePin: false },
      currentSession: null,
    });
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const t = {
        tableSession: { create: jest.fn().mockResolvedValue(session) },
        table: { update: jest.fn() },
      };
      return fn(t);
    });

    const r = await service.join('tok', { nickname: '小明', guestCount: 2 });
    expect(r.guestToken).toBe('guest.jwt.token');
    expect(r.sessionId).toBe('10');
    expect(r.tableCode).toBe('A01');
    expect(events.emit).toHaveBeenCalled();
  });

  it('join requires pin when dining + qrRequirePin', async () => {
    prisma.table.findUnique.mockResolvedValue({
      id: 3n,
      code: 'A01',
      status: TableStatus.dining,
      storeId: 1n,
      currentSessionId: 10n,
      store: { qrAutoOpen: true, qrRequirePin: true },
      currentSession: {
        id: 10n,
        pin: '4321',
        sessionToken: 's',
        status: SessionStatus.open,
      },
    });
    await expect(service.join('tok', { nickname: '客', pin: '0000' })).rejects.toMatchObject({
      errorCode: 'TABLE_PIN_INVALID',
    });
  });
});
