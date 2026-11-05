import { Injectable, Logger } from '@nestjs/common';
import { LoginResult, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type LoginLogInput = {
  storeId?: string | null;
  userId?: string | null;
  username: string;
  result: LoginResult;
  failReason?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

export type LoginLogQuery = {
  storeId?: string;
  page?: number;
  pageSize?: number;
  username?: string;
  result?: LoginResult | string;
  ip?: string;
  from?: string;
  to?: string;
};

@Injectable()
export class LoginLogService {
  private readonly logger = new Logger(LoginLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 写登录日志失败不阻断登录主流程 */
  async write(input: LoginLogInput): Promise<void> {
    try {
      await this.prisma.loginLog.create({
        data: {
          storeId: input.storeId ? BigInt(input.storeId) : null,
          userId: input.userId ? BigInt(input.userId) : null,
          username: input.username.slice(0, 64),
          result: input.result,
          failReason: input.failReason ?? null,
          ip: input.ip ?? null,
          userAgent: input.userAgent ? input.userAgent.slice(0, 512) : null,
        },
      });
      this.logger.log(
        `staff_auth result=${input.result} user=${input.username} ip=${input.ip ?? '-'} reason=${input.failReason ?? '-'}`,
      );
    } catch (err) {
      this.logger.warn(`login log failed: ${(err as Error).message}`);
    }
  }

  async list(query: LoginLogQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.LoginLogWhereInput = {};
    if (query.storeId) where.storeId = BigInt(query.storeId);

    if (query.username) {
      where.username = { contains: query.username };
    }
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
      this.prisma.loginLog.count({ where }),
      this.prisma.loginLog.findMany({
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
        storeId: r.storeId?.toString() ?? null,
        userId: r.userId?.toString() ?? null,
        username: r.username,
        result: r.result,
        failReason: r.failReason,
        ip: r.ip,
        userAgent: r.userAgent,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }
}
