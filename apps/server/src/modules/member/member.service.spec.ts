import { CustomerStatus } from '@prisma/client';
import { BusinessError } from '../../common/errors/business.error';
import { MemberService } from './member.service';

describe('MemberService soft delete / ban', () => {
  const prisma = {
    customer: {
      findUnique: jest.fn(),
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
    prisma.customer.findUnique.mockResolvedValue({
      id: 1n,
      status: CustomerStatus.active,
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
    const row = await service.softDelete('1');
    expect(row.status).toBe('deleted');
    expect(prisma.customer.update).toHaveBeenCalled();
  });

  it('setStatus bans', async () => {
    prisma.customer.findUnique.mockResolvedValue({
      id: 1n,
      status: CustomerStatus.active,
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
    const row = await service.setStatus('1', 'banned');
    expect(row.status).toBe('banned');
  });

  it('softDelete throws if already deleted', async () => {
    prisma.customer.findUnique.mockResolvedValue({
      id: 1n,
      status: CustomerStatus.deleted,
    });
    await expect(service.softDelete('1')).rejects.toBeInstanceOf(BusinessError);
  });
});
