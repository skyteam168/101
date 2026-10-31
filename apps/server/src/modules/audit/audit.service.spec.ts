import { AuditService } from './audit.service';

describe('AuditService', () => {
  it('writes audit log with username snapshot from userId', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          username: 'cashier1',
          displayName: '收银员',
          storeId: 1n,
        }),
      },
      auditLog: { create },
    };
    const service = new AuditService(prisma as never);
    await service.log({
      userId: '2',
      action: 'order.checkout',
      targetType: 'order',
      targetId: '99',
      after: { total: 100000 },
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 2n,
        storeId: 1n,
        username: 'cashier1',
        displayName: '收银员',
        module: 'order',
        action: 'order.checkout',
        targetType: 'order',
        targetId: '99',
      }),
    });
  });

  it('swallows write errors', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      auditLog: { create: jest.fn().mockRejectedValue(new Error('db down')) },
    };
    const service = new AuditService(prisma as never);
    await expect(
      service.log({
        action: 'user.create',
        targetType: 'user',
        targetId: '1',
      }),
    ).resolves.toBeUndefined();
  });
});
