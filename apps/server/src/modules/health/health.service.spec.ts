import { HealthService } from './health.service';

describe('HealthService', () => {
  it('returns ok when db responds', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '1': 1n }]) };
    const service = new HealthService(prisma as never);
    await expect(service.check()).resolves.toEqual({ status: 'ok', db: 'up' });
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });
});
