import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CustomerStatus, UserLang } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { BusinessError } from '../../common/errors/business.error';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { MailService } from './mail.service';
import {
  CustomerLoginDto,
  ForgotPasswordDto,
  RegisterDto,
  SendCodeDto,
  UpdateCustomerProfileDto,
} from './dto/delivery.dto';
import { isValidVnPhone } from './geo.util';

const CODE_TTL = 600;
const COOLDOWN = 60;
const DAILY_LIMIT = 10;

@Injectable()
export class CustomerAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

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

  async sendCode(dto: SendCodeDto) {
    const email = dto.email.toLowerCase();
    const lang = dto.lang === 'zh' ? 'zh' : 'vi';
    if (await this.redis.get(this.coolKey(email))) {
      throw new BusinessError('EMAIL_CODE_TOO_FREQUENT');
    }
    const dayCount = Number((await this.redis.get(this.dayKey(email))) || 0);
    if (dayCount >= DAILY_LIMIT) throw new BusinessError('EMAIL_CODE_DAILY_LIMIT');

    const code = String(randomInt(100000, 999999));
    await this.redis.set(this.codeKey(email), code, CODE_TTL);
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
    const key = this.codeKey(email.toLowerCase());
    const saved = await this.redis.get(key);
    if (!saved || saved !== code) throw new BusinessError('EMAIL_CODE_INVALID');
    await this.redis.del(key);
  }

  private async issueToken(customer: {
    id: bigint;
    email: string;
    lang: UserLang;
    name: string | null;
    phone: string | null;
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
    lang: UserLang;
    emailVerifiedAt?: Date | null;
    status?: CustomerStatus;
    points?: number;
    balance?: bigint;
    birthday?: Date | null;
  }) {
    return {
      id: c.id.toString(),
      email: c.email,
      name: c.name,
      phone: c.phone,
      lang: c.lang,
      emailVerifiedAt: c.emailVerifiedAt ?? null,
      status: c.status ?? CustomerStatus.active,
      points: c.points ?? 0,
      balance: Number(c.balance ?? 0),
      birthday: c.birthday?.toISOString().slice(0, 10) ?? null,
    };
  }

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    await this.assertCode(email, dto.code);
    const exists = await this.prisma.customer.findUnique({ where: { email } });
    if (exists && exists.status !== CustomerStatus.deleted) {
      throw new BusinessError('EMAIL_ALREADY_REGISTERED');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const defaultLevel = await this.prisma.memberLevel.findFirst({
      where: { isActive: true },
      orderBy: { minPoints: 'asc' },
    });
    if (exists?.status === CustomerStatus.deleted) {
      const row = await this.prisma.customer.update({
        where: { id: exists.id },
        data: {
          passwordHash,
          name: dto.name || null,
          lang: (dto.lang === 'zh' ? 'zh' : 'vi') as UserLang,
          emailVerifiedAt: new Date(),
          status: CustomerStatus.active,
          deletedAt: null,
          memberLevelId: defaultLevel?.id ?? null,
        },
      });
      return this.issueToken(row);
    }
    const row = await this.prisma.customer.create({
      data: {
        email,
        passwordHash,
        name: dto.name || null,
        lang: (dto.lang === 'zh' ? 'zh' : 'vi') as UserLang,
        emailVerifiedAt: new Date(),
        memberLevelId: defaultLevel?.id ?? null,
      },
    });
    return this.issueToken(row);
  }

  async login(dto: CustomerLoginDto) {
    const email = dto.email.toLowerCase();
    const row = await this.prisma.customer.findUnique({ where: { email } });
    if (!row) throw new BusinessError('AUTH_INVALID_CREDENTIALS');
    this.assertLoginable(row);
    const ok = await bcrypt.compare(dto.password, row.passwordHash);
    if (!ok) throw new BusinessError('AUTH_INVALID_CREDENTIALS');
    return this.issueToken(row);
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.toLowerCase();
    await this.assertCode(email, dto.code);
    const row = await this.prisma.customer.findUnique({ where: { email } });
    if (!row) throw new BusinessError('CUSTOMER_NOT_FOUND');
    this.assertLoginable(row);
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    const updated = await this.prisma.customer.update({
      where: { id: row.id },
      data: { passwordHash, emailVerifiedAt: row.emailVerifiedAt || new Date() },
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
      data: { status: CustomerStatus.deleted, deletedAt: new Date() },
    });
    return { ok: true };
  }
}
