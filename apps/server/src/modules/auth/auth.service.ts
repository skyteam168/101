import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'crypto';
import { UserLang, UserStatus } from '@prisma/client';
import { BusinessError } from '../../common/errors/business.error';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { RbacService } from '../rbac/rbac.service';
import { AuthUser, JwtPayload } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

const REFRESH_PREFIX = 'auth:refresh:';
const ACCESS_EXPIRES = '2h';
const REFRESH_EXPIRES = '7d';
const REFRESH_TTL_SEC = 7 * 24 * 3600;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    private readonly rbac: RbacService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user || user.status !== UserStatus.active) {
      throw new BusinessError('AUTH_INVALID_CREDENTIALS');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new BusinessError('AUTH_INVALID_CREDENTIALS');
    }

    const roles = user.userRoles.map((ur) => ur.role.code);
    const tokens = await this.issueTokens({
      id: user.id.toString(),
      username: user.username,
      storeId: user.storeId?.toString() ?? null,
      roles,
      isSuperAdmin: roles.includes('super_admin'),
    });

    return {
      ...tokens,
      user: {
        id: user.id.toString(),
        username: user.username,
        displayName: user.displayName,
        lang: user.lang,
      },
    };
  }

  async refresh(refreshToken: string) {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new BusinessError('AUTH_REFRESH_INVALID', undefined, 401);
    }
    if (payload.typ !== 'refresh' || !payload.jti) {
      throw new BusinessError('AUTH_REFRESH_INVALID', undefined, 401);
    }

    const key = `${REFRESH_PREFIX}${payload.sub}:${payload.jti}`;
    const stored = await this.redis.get(key);
    const hash = this.hashToken(refreshToken);
    if (!stored || stored !== hash) {
      throw new BusinessError('AUTH_REFRESH_INVALID', undefined, 401);
    }

    await this.redis.del(key);
    const authUser = await this.validateAccessPayload({
      ...payload,
      typ: 'access',
    });
    return this.issueTokens(authUser);
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      try {
        const payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
          secret: this.config.get<string>('JWT_SECRET'),
        });
        if (payload.jti && payload.sub === userId) {
          await this.redis.del(`${REFRESH_PREFIX}${userId}:${payload.jti}`);
        }
      } catch {
        // 忽略无效 refresh
      }
    }
    const keys = await this.redis.keys(`${REFRESH_PREFIX}${userId}:*`);
    if (keys.length) await this.redis.del(...keys);
    await this.rbac.clearUserPermCache(userId);
    return { ok: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user || user.status !== UserStatus.active) {
      throw new BusinessError('UNAUTHORIZED', undefined, 401);
    }

    const roles = user.userRoles.map((ur) => ({
      code: ur.role.code,
      nameZh: ur.role.nameZh,
      nameVi: ur.role.nameVi,
    }));
    const permissions = await this.rbac.getUserPermissionCodes(userId);
    const menus = await this.rbac.getMenuTreeForUser(userId, roles.some((r) => r.code === 'super_admin'));

    return {
      user: {
        id: user.id.toString(),
        username: user.username,
        displayName: user.displayName,
        phone: user.phone,
        lang: user.lang,
        status: user.status,
        storeId: user.storeId?.toString() ?? null,
      },
      roles,
      permissions,
      menus,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const data: { lang?: UserLang; displayName?: string } = {};
    if (dto.lang) data.lang = dto.lang as UserLang;
    if (dto.displayName) data.displayName = dto.displayName;
    const user = await this.prisma.user.update({
      where: { id: BigInt(userId) },
      data,
    });
    return {
      id: user.id.toString(),
      username: user.username,
      displayName: user.displayName,
      lang: user.lang,
    };
  }

  async validateAccessPayload(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(payload.sub) },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user || user.status !== UserStatus.active) {
      throw new BusinessError('UNAUTHORIZED', undefined, 401);
    }
    const roles = user.userRoles.map((ur) => ur.role.code);
    return {
      id: user.id.toString(),
      username: user.username,
      storeId: user.storeId?.toString() ?? null,
      roles,
      isSuperAdmin: roles.includes('super_admin'),
    };
  }

  private async issueTokens(user: AuthUser) {
    const jti = randomUUID();
    const secret = this.config.get<string>('JWT_SECRET');
    const accessExpires = this.config.get<string>('JWT_ACCESS_EXPIRES') ?? ACCESS_EXPIRES;
    const refreshExpires = this.config.get<string>('JWT_REFRESH_EXPIRES') ?? REFRESH_EXPIRES;
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, username: user.username, typ: 'access' } satisfies JwtPayload,
      { secret, expiresIn: accessExpires as `${number}h` },
    );
    const refreshToken = await this.jwt.signAsync(
      {
        sub: user.id,
        username: user.username,
        typ: 'refresh',
        jti,
      } satisfies JwtPayload,
      { secret, expiresIn: refreshExpires as `${number}d` },
    );
    await this.redis.set(
      `${REFRESH_PREFIX}${user.id}:${jti}`,
      this.hashToken(refreshToken),
      REFRESH_TTL_SEC,
    );
    return {
      accessToken,
      refreshToken,
      expiresIn: 2 * 3600,
      tokenType: 'Bearer',
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
