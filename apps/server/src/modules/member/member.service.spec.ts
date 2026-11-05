import { CustomerStatus } from '@prisma/client';
import { BusinessError } from '../../common/errors/business.error';
import { MemberService } from './member.service';

describe('MemberService soft delete / ban', () => {
  const prisma = {
    customer: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };
  const service = new MemberService(prisma as never, { sendSystemMessage: jest.fn() } as never, {
    log: jest.fn(),
  } as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('softDelete marks deleted', async () => {
    prisma.customer.findFirst.mockResolvedValue({
      id: 1n,
      status: CustomerStatus.active,
      memberLevel: null,
    });
    prisma.customer.update.mockResolvedValue({
      id: 1n,
      email: 'a@b.com',
      name: 'A',
      phone: null,
      lang: 'vi',
      status: CustomerStatus.deleted,
      birthday: null,
      points: 0,
      balance: 0n,
      memberLevelId: null,
      memberLevel: null,
      deletedAt: new Date(),
      createdAt: new Date(),
    });
    const row = await service.softDelete('1', '1');
    expect(row.status).toBe('deleted');
    expect(prisma.customer.update).toHaveBeenCalled();
  });

  it('setStatus bans', async () => {
    prisma.customer.findFirst.mockResolvedValue({
      id: 1n,
      status: CustomerStatus.active,
      memberLevel: null,
    });
    prisma.customer.update.mockResolvedValue({
      id: 1n,
      email: 'a@b.com',
      name: 'A',
      phone: null,
      lang: 'vi',
      status: CustomerStatus.banned,
      birthday: null,
      points: 0,
      balance: 0n,
      memberLevelId: null,
      memberLevel: null,
      deletedAt: null,
      createdAt: new Date(),
    });
    const row = await service.setStatus('1', '1', 'banned');
    expect(row.status).toBe('banned');
  });

  it('softDelete throws if already deleted', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);
    await expect(service.softDelete('1', '1')).rejects.toBeInstanceOf(BusinessError);
  });
});

describe('MemberService.deleteLevel', () => {
  function makePrisma() {
    const tx = {
      customer: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      memberLevel: { delete: jest.fn().mockResolvedValue({}) },
    };
    return {
      memberLevel: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
      },
      customer: { count: jest.fn() },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
      __tx: tx,
    };
  }

  it('migrates members to lowest remaining level then deletes', async () => {
    const prisma = makePrisma();
    prisma.memberLevel.findFirst.mockResolvedValue({
      id: 9n,
      storeId: 1n,
      nameZh: '银卡',
      nameVi: 'Bac',
    });
    prisma.customer.count.mockResolvedValue(2);
    prisma.memberLevel.findMany.mockResolvedValue([
      { id: 1n, nameZh: '普通会员', nameVi: 'Thuong', minSpend: 0n, sort: 0 },
    ]);
    const audit = { log: jest.fn() };
    const service = new MemberService(prisma as never, { sendSystemMessage: jest.fn() } as never, audit as never);
    const res = await service.deleteLevel('1', '9', '8');
    expect(res.ok).toBe(true);
    expect(res.migratedCount).toBe(2);
    expect(res.fallbackLevelId).toBe('1');
    expect(prisma.__tx.customer.updateMany).toHaveBeenCalledWith({
      where: { memberLevelId: 9n },
      data: { memberLevelId: 1n },
    });
    expect(prisma.__tx.memberLevel.delete).toHaveBeenCalledWith({ where: { id: 9n } });
    expect(audit.log).toHaveBeenCalled();
  });

  it('clears level when no fallback remains', async () => {
    const prisma = makePrisma();
    prisma.memberLevel.findFirst.mockResolvedValue({
      id: 1n,
      storeId: 1n,
      nameZh: '普通会员',
      nameVi: 'Thuong',
    });
    prisma.customer.count.mockResolvedValue(1);
    prisma.memberLevel.findMany.mockResolvedValue([]);
    const service = new MemberService(prisma as never, { sendSystemMessage: jest.fn() } as never, {
      log: jest.fn(),
    } as never);
    const res = await service.deleteLevel('1', '1');
    expect(res.fallbackLevelId).toBeNull();
    expect(prisma.__tx.customer.updateMany).toHaveBeenCalledWith({
      where: { memberLevelId: 1n },
      data: { memberLevelId: null },
    });
  });

  it('deletes unused level without migrating', async () => {
    const prisma = makePrisma();
    prisma.memberLevel.findFirst.mockResolvedValue({
      id: 3n,
      storeId: 1n,
      nameZh: '22',
      nameVi: '22',
    });
    prisma.customer.count.mockResolvedValue(0);
    prisma.memberLevel.findMany.mockResolvedValue([
      { id: 1n, nameZh: '普通会员', nameVi: 'Thuong', minSpend: 0n, sort: 0 },
    ]);
    const service = new MemberService(prisma as never, { sendSystemMessage: jest.fn() } as never, {
      log: jest.fn(),
    } as never);
    const res = await service.deleteLevel('1', '3');
    expect(res.migratedCount).toBe(0);
    expect(prisma.__tx.customer.updateMany).not.toHaveBeenCalled();
    expect(prisma.__tx.memberLevel.delete).toHaveBeenCalled();
  });

  it('throws when level missing', async () => {
    const prisma = makePrisma();
    prisma.memberLevel.findFirst.mockResolvedValue(null);
    const service = new MemberService(prisma as never, { sendSystemMessage: jest.fn() } as never, {
      log: jest.fn(),
    } as never);
    await expect(service.deleteLevel('1', '99')).rejects.toMatchObject({
      errorCode: 'MEMBER_LEVEL_NOT_FOUND',
    });
  });
});
