import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type AuditLogInput = {
  userId?: string | null;
  storeId?: string | null;
  username?: string | null;
  displayName?: string | null;
  module?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
};

export type OperationLogQuery = {
  page?: number;
  pageSize?: number;
  username?: string;
  module?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  storeId?: string;
  from?: string;
  to?: string;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 写审计失败不抛出，避免拖垮业务主流程 */
  async log(input: AuditLogInput): Promise<void> {
    try {
      let storeId = input.storeId ? BigInt(input.storeId) : null;
      let username = input.username ?? null;
      let displayName = input.displayName ?? null;

      if (input.userId && (!username || !displayName || storeId == null)) {
        const user = await this.prisma.user.findUnique({
          where: { id: BigInt(input.userId) },
          select: { username: true, displayName: true, storeId: true },
        });
        if (user) {
          username = username ?? user.username;
          displayName = displayName ?? user.displayName;
          if (storeId == null && user.storeId != null) storeId = user.storeId;
        }
      }

      // 从 module 前缀推断：action 形如 order.void_item
      const module =
        input.module ??
        (input.action.includes('.') ? input.action.split('.')[0] : null);

      await this.prisma.auditLog.create({
        data: {
          storeId,
          userId: input.userId ? BigInt(input.userId) : null,
          username,
          displayName,
          module,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          before: (input.before ?? undefined) as Prisma.InputJsonValue | undefined,
          after: (input.after ?? undefined) as Prisma.InputJsonValue | undefined,
          ip: input.ip ?? null,
          userAgent: input.userAgent ? input.userAgent.slice(0, 512) : null,
          requestId: input.requestId ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(`audit log failed: ${(err as Error).message}`);
    }
  }

  async listOperationLogs(query: OperationLogQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.AuditLogWhereInput = {};

    if (query.username) {
      where.username = { contains: query.username };
    }
    if (query.module) where.module = query.module;
    if (query.action) where.action = { contains: query.action };
    if (query.targetType) where.targetType = query.targetType;
    if (query.targetId) where.targetId = query.targetId;
    if (query.storeId) where.storeId = BigInt(query.storeId);
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
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
        displayName: r.displayName,
        module: r.module,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        before: r.before,
        after: r.after,
        ip: r.ip,
        userAgent: r.userAgent,
        requestId: r.requestId,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }
}
