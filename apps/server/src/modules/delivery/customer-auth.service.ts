import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CustomerStatus, RegisterSource, UserLang } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { BusinessError } from '../../common/errors/business.error';
import { assertPasswordComplexity } from '../../common/password.util';
import { ClientMeta } from '../../common/utils/client-ip.util';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { CustomerLoginLogService } from '../security/customer-login-log.service';
import { LoginLockService } from '../security/login-lock.service';
import { TurnstileService } from '../security/turnstile.service';
import { MailService } from './mail.service';
import {
  ChangePasswordDto,
  CustomerLoginDto,
  ForgotPasswordDto,
  GoogleLoginDto,
  LoginByCodeDto,
  RegisterDto,
  SendCodeDto,
  UpdateCustomerProfileDto,
} from './dto/delivery.dto';
import { isValidVnPhone } from './geo.util';

const CODE_TTL = 600;
const COOLDOWN = 60;
const DAILY_LIMIT = 10;
/** 验证码错误次数上限；超限作废验证码并短时锁定 */
const CODE_MAX_FAILS = 5;
const CODE_LOCK_SEC = 900;

@Injectable()
export class CustomerAuthService {
  private readonly logger = new Logger(CustomerAuthService.name);
  private googleClient: OAuth2Client | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly turnstile: TurnstileService,
    private readonly loginLogs: CustomerLoginLogService,
    private readonly loginLock: LoginLockService,
  ) {}

  private googleClientId(): string {
    return (this.config.get<string>('GOOGLE_CLIENT_ID') ?? '').trim();
  }

  private getGoogleClient(): OAuth2Client {
    if (!this.googleClient) {
      this.googleClient = new OAuth2Client(this.googleClientId());
    }
    return this.googleClient;
  }

  private codeKey(email: string) {
    return `delivery:code:${email.toLowerCase()}`;
  }
  private coolKey(email: string) {
    return `delivery:code:cool:${email.toLowerCase()}`;
  }
  private dayKey(email: string) {
    const d = new Date().toISOString().slice(0, 10);
    return `delivery:code:day:${email.toLowerCase()}:${d}`;
  }
  private failKey(email: string) {
    return `delivery:code:fail:${email.toLowerCase()}`;
  }
  private lockKey(email: string) {
    return `delivery:code:lock:${email.toLowerCase()}`;
  }

  async sendCode(dto: SendCodeDto) {
    const email = dto.email.toLowerCase();
    const lang = dto.lang === 'zh' ? 'zh' : 'vi';
    const purpose = dto.purpose ?? 'register';

    if (await this.redis.get(this.lockKey(email))) {
      throw new BusinessError('EMAIL_CODE_LOCKED');
    }

    if (purpose === 'login' || purpose === 'reset') {
      const existing = await this.prisma.customer.findUnique({ where: { email } });
      if (!existing || existing.status === CustomerStatus.deleted) {
        throw new BusinessError('CUSTOMER_NOT_FOUND');
      }
      if (existing.status === CustomerStatus.banned) {
        throw new BusinessError('CUSTOMER_BANNED');
      }
    }

    if (await this.redis.get(this.coolKey(email))) {
      throw new BusinessError('EMAIL_CODE_TOO_FREQUENT');
    }
    const dayCount = Number((await this.redis.get(this.dayKey(email))) || 0);
    if (dayCount >= DAILY_LIMIT) throw new BusinessError('EMAIL_CODE_DAILY_LIMIT');

    const code = String(randomInt(100000, 999999));
    await this.redis.set(this.codeKey(email), code, CODE_TTL);
    await this.redis.del(this.failKey(email));
    await this.redis.set(this.coolKey(email), '1', COOLDOWN);
    await this.redis.set(this.dayKey(email), String(dayCount + 1), 86400);

    const sent = await this.mail.sendVerifyCode(email, code, lang);
    return {
      ok: true,
      expiresIn: CODE_TTL,
      ...(sent && 'dev' in sent && sent.dev ? { devCode: code } : {}),
    };
  }

  private async assertCode(email: string, code: string) {
    const normalized = email.toLowerCase();
    if (await this.redis.get(this.lockKey(normalized))) {
      throw new BusinessError('EMAIL_CODE_LOCKED');
    }
    const key = this.codeKey(normalized);
    const saved = await this.redis.get(key);
    if (!saved || saved !== code) {
      const fails = await this.redis.incr(this.failKey(normalized), CODE_TTL);
      if (fails >= CODE_MAX_FAILS) {
        await this.redis.del(key, this.failKey(normalized));
        await this.redis.set(this.lockKey(normalized), '1', CODE_LOCK_SEC);
        this.logger.warn(`email code locked email=${normalized} fails=${fails}`);
        throw new BusinessError('EMAIL_CODE_LOCKED');
      }
      throw new BusinessError('EMAIL_CODE_INVALID');
    }
    await this.redis.del(key, this.failKey(normalized));
  }

  private async issueToken(customer: {
    id: bigint;
    email: string;
    lang: UserLang;
    name: string | null;
    phone: string | null;
    avatar?: string | null;
    passwordHash?: string | null;
    emailVerifiedAt?: Date | null;
    status?: CustomerStatus;
    points?: number;
    balance?: bigint;
    birthday?: Date | null;
  }) {
    const accessToken = await this.jwt.signAsync(
      {
        typ: 'customer',
        sub: customer.id.toString(),
        email: customer.email,
        lang: customer.lang,
      },
      {
        secret: this.config.get<string>('JWT_SECRET') ?? 'dev-secret-change-me',
        expiresIn: '7d',
      },
    );
    return {
      accessToken,
      customer: this.mapCustomer(customer),
    };
  }

  private assertLoginable(row: { status: CustomerStatus }) {
    if (row.status === CustomerStatus.banned) throw new BusinessError('CUSTOMER_BANNED');
    if (row.status === CustomerStatus.deleted) throw new BusinessError('CUSTOMER_DELETED');
  }

  mapCustomer(c: {
    id: bigint;
    email: string;
    name: string | null;
    phone: string | null;
    avatar?: string | null;
    lang: UserLang;
    emailVerifiedAt?: Date | null;
    status?: CustomerStatus;
    points?: number;
    balance?: bigint;
    birthday?: Date | null;
    passwordHash?: string | null;
    googleSub?: string | null;
    registerSource?: RegisterSource | null;
  }) {
    return {
      id: c.id.toString(),
      email: c.email,
      name: c.name,
      phone: c.phone,
      avatar: c.avatar ?? null,
      lang: c.lang,
      emailVerifiedAt: c.emailVerifiedAt ?? null,
      status: c.status ?? CustomerStatus.active,
      points: c.points ?? 0,
      balance: Number(c.balance ?? 0),
      birthday: c.birthday?.toISOString().slice(0, 10) ?? null,
      hasPassword: !!c.passwordHash,
      hasGoogle: !!c.googleSub,
      registerSource: c.registerSource ?? RegisterSource.email,
    };
  }

  async register(dto: RegisterDto, meta: ClientMeta = {}) {
    const email = dto.email.toLowerCase();
    try {
      await this.turnstile.assertValid(dto.cfTurnstileToken, meta.ip);
      await this.assertCode(email, dto.code);
      const phone = dto.phone?.trim() || null;
      if (phone && !isValidVnPhone(phone)) {
        throw new BusinessError('INVALID_VN_PHONE');
      }
      assertPasswordComplexity(dto.password);
      const exists = await this.prisma.customer.findUnique({ where: { email } });
      if (exists && exists.status !== CustomerStatus.deleted) {
        throw new BusinessError('EMAIL_ALREADY_REGISTERED');
      }
      const passwordHash = await bcrypt.hash(dto.password, 10);
      let row;
      if (exists?.status === CustomerStatus.deleted) {
        row = await this.prisma.customer.update({
          where: { id: exists.id },
          data: {
            passwordHash,
            registerSource: RegisterSource.email,
            googleSub: null,
            name: dto.name || null,
            phone,
            lang: (dto.lang === 'zh' ? 'zh' : 'vi') as UserLang,
            emailVerifiedAt: new Date(),
            status: CustomerStatus.active,
            deletedAt: null,
            memberLevelId: null,
            memberJoinedAt: null,
          },
        });
      } else {
        row = await this.prisma.customer.create({
          data: {
            email,
            passwordHash,
            registerSource: RegisterSource.email,
            name: dto.name || null,
            phone,
            lang: (dto.lang === 'zh' ? 'zh' : 'vi') as UserLang,
            emailVerifiedAt: new Date(),
          },
        });
      }
      await this.loginLogs.write({
        customerId: row.id.toString(),
        email,
        action: 'register',
        result: 'success',
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return this.issueToken(row);
    } catch (err) {
      const code = err instanceof BusinessError ? err.errorCode : 'REGISTER_FAILED';
      await this.loginLogs.write({
        email,
        action: 'register',
        result: 'fail',
        failReason: code,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw err;
    }
  }

  async login(dto: CustomerLoginDto, meta: ClientMeta = {}) {
    const email = dto.email.toLowerCase();
    try {
      await this.loginLock.assertNotLocked('customer', email, meta.ip);
      await this.turnstile.assertValid(dto.cfTurnstileToken, meta.ip);
      const row = await this.prisma.customer.findUnique({ where: { email } });
      if (!row) {
        await this.loginLock.recordFailure('customer', email, meta.ip);
        await this.loginLogs.write({
          email,
          action: 'login',
          result: 'fail',
          failReason: 'USER_NOT_FOUND',
          ip: meta.ip,
          userAgent: meta.userAgent,
        });
        throw new BusinessError('AUTH_INVALID_CREDENTIALS');
      }
      try {
        this.assertLoginable(row);
      } catch (statusErr) {
        const code =
          statusErr instanceof BusinessError ? statusErr.errorCode : 'CUSTOMER_BANNED';
        await this.loginLock.recordFailure('customer', email, meta.ip);
        await this.loginLogs.write({
          customerId: row.id.toString(),
          email,
          action: 'login',
          result: 'fail',
          failReason: code,
          ip: meta.ip,
          userAgent: meta.userAgent,
        });
        throw statusErr;
      }
      if (!row.passwordHash) {
        await this.loginLogs.write({
          customerId: row.id.toString(),
          email,
          action: 'login',
          result: 'fail',
          failReason: 'NO_PASSWORD',
          ip: meta.ip,
          userAgent: meta.userAgent,
        });
        throw new BusinessError('AUTH_USE_GOOGLE_OR_CODE');
      }
      const ok = await bcrypt.compare(dto.password, row.passwordHash);
      if (!ok) {
        await this.loginLock.recordFailure('customer', email, meta.ip);
        await this.loginLogs.write({
          customerId: row.id.toString(),
          email,
          action: 'login',
          result: 'fail',
          failReason: 'BAD_PASSWORD',
          ip: meta.ip,
          userAgent: meta.userAgent,
        });
        throw new BusinessError('AUTH_INVALID_CREDENTIALS');
      }
      await this.loginLock.clearFailures('customer', email, meta.ip);
      await this.loginLogs.write({
        customerId: row.id.toString(),
        email,
        action: 'login',
        result: 'success',
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return this.issueToken(row);
    } catch (err) {
      if (err instanceof BusinessError) {
        if (
          err.errorCode === 'TURNSTILE_REQUIRED' ||
          err.errorCode === 'TURNSTILE_FAILED' ||
          err.errorCode === 'AUTH_LOGIN_LOCKED'
        ) {
          if (err.errorCode !== 'AUTH_LOGIN_LOCKED') {
            await this.loginLock.recordFailure('customer', email, meta.ip);
          }
          await this.loginLogs.write({
            email,
            action: 'login',
            result: 'fail',
            failReason: err.errorCode,
            ip: meta.ip,
            userAgent: meta.userAgent,
          });
        }
        throw err;
      }
      this.logger.error(`login unexpected: ${(err as Error).message}`);
      throw err;
    }
  }

  async loginByCode(dto: LoginByCodeDto, meta: ClientMeta = {}) {
    const email = dto.email.toLowerCase();
    try {
      await this.loginLock.assertNotLocked('customer', email, meta.ip);
      await this.turnstile.assertValid(dto.cfTurnstileToken, meta.ip);
      await this.assertCode(email, dto.code);
      const row = await this.prisma.customer.findUnique({ where: { email } });
      if (!row || row.status === CustomerStatus.deleted) {
        await this.loginLock.recordFailure('customer', email, meta.ip);
        await this.loginLogs.write({
          email,
          action: 'login_code',
          result: 'fail',
          failReason: 'USER_NOT_FOUND',
          ip: meta.ip,
          userAgent: meta.userAgent,
        });
        throw new BusinessError('AUTH_INVALID_CREDENTIALS');
      }
      this.assertLoginable(row);
      await this.loginLock.clearFailures('customer', email, meta.ip);
      await this.loginLogs.write({
        customerId: row.id.toString(),
        email,
        action: 'login_code',
        result: 'success',
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return this.issueToken(row);
    } catch (err) {
      if (err instanceof BusinessError) {
        if (
          err.errorCode === 'TURNSTILE_REQUIRED' ||
          err.errorCode === 'TURNSTILE_FAILED' ||
          err.errorCode === 'EMAIL_CODE_INVALID' ||
          err.errorCode === 'AUTH_LOGIN_LOCKED'
        ) {
          if (
            err.errorCode === 'TURNSTILE_REQUIRED' ||
            err.errorCode === 'TURNSTILE_FAILED' ||
            err.errorCode === 'EMAIL_CODE_INVALID'
          ) {
            await this.loginLock.recordFailure('customer', email, meta.ip);
          }
          await this.loginLogs.write({
            email,
            action: 'login_code',
            result: 'fail',
            failReason: err.errorCode,
            ip: meta.ip,
            userAgent: meta.userAgent,
          });
        }
        throw err;
      }
      throw err;
    }
  }

  async loginWithGoogle(dto: GoogleLoginDto, meta: ClientMeta = {}) {
    const clientId = this.googleClientId();
    if (!clientId) throw new BusinessError('GOOGLE_AUTH_DISABLED');

    let email = '';
    let sub = '';
    let name: string | null = null;
    let picture: string | null = null;
    try {
      const ticket = await this.getGoogleClient().verifyIdToken({
        idToken: dto.idToken,
        audience: clientId,
      });
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email) {
        throw new BusinessError('GOOGLE_TOKEN_INVALID');
      }
      if (payload.email_verified === false) {
        throw new BusinessError('GOOGLE_EMAIL_UNVERIFIED');
      }
      sub = payload.sub;
      email = payload.email.toLowerCase();
      name = payload.name || null;
      picture = payload.picture || null;
    } catch (err) {
      if (err instanceof BusinessError) {
        await this.loginLogs.write({
          email: email || 'unknown',
          action: 'google',
          result: 'fail',
          failReason: err.errorCode,
          ip: meta.ip,
          userAgent: meta.userAgent,
        });
        throw err;
      }
      this.logger.warn(`Google token verify failed: ${(err as Error).message}`);
      await this.loginLogs.write({
        email: email || 'unknown',
        action: 'google',
        result: 'fail',
        failReason: 'GOOGLE_TOKEN_INVALID',
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw new BusinessError('GOOGLE_TOKEN_INVALID');
    }

    try {
      let row = await this.prisma.customer.findFirst({
        where: {
          OR: [{ googleSub: sub }, { email }],
        },
      });

      if (row?.status === CustomerStatus.banned) {
        throw new BusinessError('CUSTOMER_BANNED');
      }

      if (row) {
        // 合并同邮箱：保留原 registerSource；已注销账号用 Google 重新激活则记为 google
        const reviveAsGoogle = row.status === CustomerStatus.deleted;
        row = await this.prisma.customer.update({
          where: { id: row.id },
          data: {
            googleSub: row.googleSub || sub,
            emailVerifiedAt: row.emailVerifiedAt || new Date(),
            name: row.name || name,
            avatar: row.avatar || picture,
            lang: row.lang || ((dto.lang === 'zh' ? 'zh' : 'vi') as UserLang),
            status: CustomerStatus.active,
            deletedAt: null,
            ...(reviveAsGoogle ? { registerSource: RegisterSource.google } : {}),
          },
        });
      } else {
        row = await this.prisma.customer.create({
          data: {
            email,
            googleSub: sub,
            passwordHash: null,
            registerSource: RegisterSource.google,
            name,
            avatar: picture,
            lang: (dto.lang === 'zh' ? 'zh' : 'vi') as UserLang,
            emailVerifiedAt: new Date(),
          },
        });
      }

      await this.loginLogs.write({
        customerId: row.id.toString(),
        email,
        action: 'google',
        result: 'success',
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return this.issueToken(row);
    } catch (err) {
      if (err instanceof BusinessError) {
        await this.loginLogs.write({
          email,
          action: 'google',
          result: 'fail',
          failReason: err.errorCode,
          ip: meta.ip,
          userAgent: meta.userAgent,
        });
      }
      throw err;
    }
  }

  async changePassword(customerId: string, dto: ChangePasswordDto, meta: ClientMeta = {}) {
    const row = await this.prisma.customer.findUnique({ where: { id: BigInt(customerId) } });
    if (!row) throw new BusinessError('CUSTOMER_NOT_FOUND');
    this.assertLoginable(row);

    if (row.passwordHash) {
      if (!dto.oldPassword) throw new BusinessError('OLD_PASSWORD_REQUIRED');
      const ok = await bcrypt.compare(dto.oldPassword, row.passwordHash);
      if (!ok) throw new BusinessError('OLD_PASSWORD_WRONG');
    }

    assertPasswordComplexity(dto.newPassword);
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    const updated = await this.prisma.customer.update({
      where: { id: row.id },
      data: { passwordHash },
    });
    await this.loginLogs.write({
      customerId,
      email: row.email,
      action: 'password_change',
      result: 'success',
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return this.mapCustomer(updated);
  }

  async logout(customerId: string, meta: ClientMeta = {}) {
    const row = await this.prisma.customer.findUnique({
      where: { id: BigInt(customerId) },
      select: { id: true, email: true },
    });
    await this.loginLogs.write({
      customerId,
      email: row?.email ?? '',
      action: 'logout',
      result: 'logout',
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return { ok: true };
  }

  async forgotPassword(dto: ForgotPasswordDto, meta: ClientMeta = {}) {
    const email = dto.email.toLowerCase();
    await this.turnstile.assertValid(dto.cfTurnstileToken, meta.ip);
    await this.assertCode(email, dto.code);
    const row = await this.prisma.customer.findUnique({ where: { email } });
    if (!row) throw new BusinessError('CUSTOMER_NOT_FOUND');
    this.assertLoginable(row);
    assertPasswordComplexity(dto.newPassword);
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    const updated = await this.prisma.customer.update({
      where: { id: row.id },
      data: { passwordHash, emailVerifiedAt: row.emailVerifiedAt || new Date() },
    });
    await this.loginLogs.write({
      customerId: updated.id.toString(),
      email: updated.email,
      action: 'password_reset',
      result: 'success',
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return this.issueToken(updated);
  }

  async me(customerId: string) {
    const row = await this.prisma.customer.findUnique({ where: { id: BigInt(customerId) } });
    if (!row) throw new BusinessError('CUSTOMER_NOT_FOUND');
    this.assertLoginable(row);
    return this.mapCustomer(row);
  }

  async updateProfile(customerId: string, dto: UpdateCustomerProfileDto) {
    if (dto.phone && !isValidVnPhone(dto.phone)) {
      throw new BusinessError('INVALID_VN_PHONE');
    }
    const existing = await this.prisma.customer.findUnique({
      where: { id: BigInt(customerId) },
    });
    if (!existing) throw new BusinessError('CUSTOMER_NOT_FOUND');
    this.assertLoginable(existing);
    const row = await this.prisma.customer.update({
      where: { id: existing.id },
      data: {
        name: dto.name,
        phone: dto.phone,
        avatar: dto.avatar === undefined ? undefined : dto.avatar,
        lang: dto.lang as UserLang | undefined,
        birthday: dto.birthday ? new Date(dto.birthday) : undefined,
      },
    });
    return this.mapCustomer(row);
  }

  async cancelAccount(customerId: string) {
    const existing = await this.prisma.customer.findUnique({
      where: { id: BigInt(customerId) },
    });
    if (!existing || existing.status === CustomerStatus.deleted) {
      throw new BusinessError('CUSTOMER_NOT_FOUND');
    }
    await this.prisma.customer.update({
      where: { id: existing.id },
      data: { status: CustomerStatus.deleted, deletedAt: new Date(), googleSub: null },
    });
    return { ok: true };
  }
}
