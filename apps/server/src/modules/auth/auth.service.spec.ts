import { BusinessError } from '../../common/errors/business.error';

jest.mock('@nestjs/jwt', () => ({
  JwtService: class JwtService {},
}));

import { AuthService } from './auth.service';

describe('AuthService', () => {
  it('rejects invalid credentials', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new AuthService(
      prisma as never,
      { signAsync: jest.fn(), verifyAsync: jest.fn() } as never,
      { set: jest.fn(), get: jest.fn(), del: jest.fn(), keys: jest.fn() } as never,
      { getUserPermissionCodes: jest.fn(), clearUserPermCache: jest.fn() } as never,
      { get: () => 'secret' } as never,
    );
    await expect(service.login({ username: 'x', password: 'y' })).rejects.toBeInstanceOf(
      BusinessError,
    );
  });
});
