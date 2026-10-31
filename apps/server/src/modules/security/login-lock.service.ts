import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessError } from '../../common/errors/business.error';
import { RedisService } from '../../redis/redis.service';

export type LoginLockScope = 'staff' | 'customer';

/**
 * 登录失败锁定（Redis）：
 * - 账号：默认 5 次 / 15 分钟窗口 → 锁定 15 分钟
 * - IP：默认 20 次 / 同窗口 → 锁定 15 分钟（防撞库扫号）
 */
@Injectable()
export class LoginLockService {
  private readonly logger = new Logger(LoginLockService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  private maxAccountFails(): number {
    return Math.max(3, Number(this.config.get('LOGIN_MAX_FAILS') ?? 5) || 5);
  }

  private maxIpFails(): number {
    return Math.max(10, Number(this.config.get('LOGIN_MAX_IP_FAILS') ?? 20) || 20);
  }

  private windowSec(): number {
    return Math.max(60, Number(this.config.get('LOGIN_FAIL_WINDOW_SECONDS') ?? 900) || 900);
  }

  private lockSec(): number {
    return Math.max(60, Number(this.config.get('LOGIN_LOCK_SECONDS') ?? 900) || 900);
  }

  private failAccountKey(scope: LoginLockScope, identity: string) {
    return `auth:fail:${scope}:acct:${identity.trim().toLowerCase()}`;
  }

  private failIpKey(scope: LoginLockScope, ip: string) {
    return `auth:fail:${scope}:ip:${ip || 'unknown'}`;
  }

  private lockAccountKey(scope: LoginLockScope, identity: string) {
    return `auth:lock:${scope}:acct:${identity.trim().toLowerCase()}`;
  }

  private lockIpKey(scope: LoginLockScope, ip: string) {
    return `auth:lock:${scope}:ip:${ip || 'unknown'}`;
  }

  async assertNotLocked(
    scope: LoginLockScope,
    identity: string,
    ip?: string | null,
  ): Promise<void> {
    const lockedAcct = await this.redis.get(this.lockAccountKey(scope, identity));
    if (lockedAcct) {
      throw new BusinessError('AUTH_LOGIN_LOCKED');
    }
    if (ip) {
      const lockedIp = await this.redis.get(this.lockIpKey(scope, ip));
      if (lockedIp) {
        throw new BusinessError('AUTH_LOGIN_LOCKED');
      }
    }
  }

  async recordFailure(
    scope: LoginLockScope,
    identity: string,
    ip?: string | null,
  ): Promise<void> {
    const window = this.windowSec();
    const lockTtl = this.lockSec();

    const acctFails = await this.redis.incr(this.failAccountKey(scope, identity), window);
    if (acctFails >= this.maxAccountFails()) {
      await this.redis.set(this.lockAccountKey(scope, identity), '1', lockTtl);
      await this.redis.del(this.failAccountKey(scope, identity));
      this.logger.warn(
        `login locked scope=${scope} identity=${identity} ip=${ip ?? '-'} fails=${acctFails}`,
      );
    }

    if (ip) {
      const ipFails = await this.redis.incr(this.failIpKey(scope, ip), window);
      if (ipFails >= this.maxIpFails()) {
        await this.redis.set(this.lockIpKey(scope, ip), '1', lockTtl);
        await this.redis.del(this.failIpKey(scope, ip));
        this.logger.warn(`login IP locked scope=${scope} ip=${ip} fails=${ipFails}`);
      }
    }
  }

  async clearFailures(
    scope: LoginLockScope,
    identity: string,
    ip?: string | null,
  ): Promise<void> {
    const keys = [
      this.failAccountKey(scope, identity),
      this.lockAccountKey(scope, identity),
    ];
    if (ip) {
      keys.push(this.failIpKey(scope, ip), this.lockIpKey(scope, ip));
    }
    await this.redis.del(...keys);
  }
}
