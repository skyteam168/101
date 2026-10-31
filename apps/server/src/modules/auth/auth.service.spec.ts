import { BusinessError } from '../../common/errors/business.error';

jest.mock('@nestjs/jwt', () => ({
  JwtService: class JwtService {},
}));

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const loginLogs = { write: jest.fn().mockResolvedValue(undefined) };
  const turnstile = { assertValid: jest.fn().mockResolvedValue(undefined) };
  const loginLock = {
    assertNotLocked: jest.fn().mockResolvedValue(undefined),
    recordFailure: jest.fn().mockResolvedValue(undefined),
    clearFailures: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    loginLogs.write.mockClear();
    turnstile.assertValid.mockClear().mockResolvedValue(undefined);
    loginLock.assertNotLocked.mockClear().mockResolvedValue(undefined);
    loginLock.recordFailure.mockClear().mockResolvedValue(undefined);
    loginLock.clearFailures.mockClear().mockResolvedValue(undefined);
    (bcrypt.compare as jest.Mock).mockReset();
  });

  function createService(prisma: unknown) {
    return new AuthService(
      prisma as never,
      { signAsync: jest.fn().mockResolvedValue('token'), verifyAsync: jest.fn() } as never,
      { set: jest.fn(), get: jest.fn(), del: jest.fn(), keys: jest.fn() } as never,
      { getUserPermissionCodes: jest.fn(), clearUserPermCache: jest.fn() } as never,
      { get: () => 'secret' } as never,
      loginLogs as never,
      turnstile as never,
      loginLock as never,
    );
  }

  it('rejects when turnstile fails and writes fail login log', async () => {
    turnstile.assertValid.mockRejectedValue(new BusinessError('TURNSTILE_REQUIRED'));
    const service = createService({ user: { findUnique: jest.fn() } });
    await expect(service.login({ username: 'admin', password: 'Admin@123' })).rejects.toBeInstanceOf(
      BusinessError,
    );
    expect(loginLock.recordFailure).toHaveBeenCalled();
    expect(loginLogs.write).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'admin',
        result: 'fail',
        failReason: 'TURNSTILE_REQUIRED',
      }),
    );
  });

  it('rejects invalid credentials and writes fail login log', async () => {
    const service = createService({
      user: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    await expect(service.login({ username: 'x', password: 'y' })).rejects.toBeInstanceOf(
      BusinessError,
    );
    expect(loginLock.recordFailure).toHaveBeenCalledWith('staff', 'x', undefined);
    expect(loginLogs.write).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'x',
        result: 'fail',
        failReason: 'USER_NOT_FOUND',
      }),
    );
  });

  it('writes success login log on valid credentials', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    const service = createService({
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1n,
          username: 'admin',
          passwordHash: 'hashed',
          displayName: 'Admin',
          storeId: 1n,
          status: 'active',
          lang: 'zh',
          userRoles: [{ role: { code: 'super_admin' } }],
        }),
      },
    });

    const result = await service.login(
      { username: 'admin', password: 'Admin@123', cfTurnstileToken: 'tok' },
      { ip: '127.0.0.1', userAgent: 'jest' },
    );
    expect(turnstile.assertValid).toHaveBeenCalledWith('tok', '127.0.0.1');
    expect(loginLock.clearFailures).toHaveBeenCalledWith('staff', 'admin', '127.0.0.1');
    expect(result.accessToken).toBe('token');
    expect(loginLogs.write).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'admin',
        result: 'success',
        ip: '127.0.0.1',
      }),
    );
  });

  it('rejects when account is locked', async () => {
    loginLock.assertNotLocked.mockRejectedValue(new BusinessError('AUTH_LOGIN_LOCKED'));
    const service = createService({ user: { findUnique: jest.fn() } });
    await expect(service.login({ username: 'admin', password: 'Admin@123' })).rejects.toMatchObject({
      errorCode: 'AUTH_LOGIN_LOCKED',
    });
    expect(loginLock.recordFailure).not.toHaveBeenCalled();
  });
});
