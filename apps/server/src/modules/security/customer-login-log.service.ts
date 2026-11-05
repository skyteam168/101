import { Injectable, Logger } from '@nestjs/common';
import { LoginResult, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type CustomerLoginLogInput = {
  customerId?: string | null;
  email: string;
  action:
    | 'register'
    | 'login'
    | 'login_code'
    | 'google'
    | 'logout'
    | 'password_change'
    | 'password_reset';
  result: LoginResult;
  failReason?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

export type CustomerLoginLogQuery = {
  /** 按本店关联顾客过滤；无 storeId 时仅超管可看全量 */
  storeId?: string;
  page?: number;
  pageSize?: number;
  email?: string;
  action?: string;
  result?: LoginResult | string;
  ip?: string;
  from?: string;
  to?: string;
};

@Injectable()
export class CustomerLoginLogService {
  private readonly logger = new Logger(CustomerLoginLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 写失败不阻断认证主流程 */
  async write(input: CustomerLoginLogInput): Promise<void> {
    try {
      await this.prisma.customerLoginLog.create({
        data: {
          customerId: input.customerId ? BigInt(input.customerId) : null,
          email: input.email.slice(0, 128).toLowerCase(),
          action: input.action,
          result: input.result,
          failReason: input.failReason ?? null,
          ip: input.ip ?? null,
          userAgent: input.userAgent ? input.userAgent.slice(0, 512) : null,
        },
      });
      this.logger.log(
        `customer_auth action=${input.action} result=${input.result} email=${input.email} ip=${input.ip ?? '-'} reason=${input.failReason ?? '-'}`,
      );
    } catch (err) {
      this.logger.warn(`customer login log failed: ${(err as Error).message}`);
    }
  }

  async list(query: CustomerLoginLogQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.CustomerLoginLogWhereInput = {};

    if (query.storeId) {
      const sid = BigInt(query.storeId);
      where.customer = {
        OR: [
          { memberLevel: { storeId: sid } },
          { orders: { some: { storeId: sid } } },
          { chatConversations: { some: { storeId: sid } } },
          { reservations: { some: { storeId: sid } } },
          { groupMealInquiries: { some: { storeId: sid } } },
        ],
      };
    }

    if (query.email) where.email = { contains: query.email };
    if (query.action) where.action = query.action;
    if (query.result && Object.values(LoginResult).includes(query.result as LoginResult)) {
      where.result = query.result as LoginResult;
    }
    if (query.ip) where.ip = { contains: query.ip };
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.customerLoginLog.count({ where }),
      this.prisma.customerLoginLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      total,
      page,
      pageSize,
      list: rows.map((r) => ({
        id: r.id.toString(),
        customerId: r.customerId?.toString() ?? null,
        email: r.email,
        action: r.action,
        result: r.result,
        failReason: r.failReason,
        ip: r.ip,
        userAgent: r.userAgent,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }
}
