import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: {
    userId?: string | null;
    action: string;
    targetType: string;
    targetId: string;
    before?: unknown;
    after?: unknown;
    ip?: string | null;
  }) {
    await this.prisma.auditLog.create({
      data: {
        userId: input.userId ? BigInt(input.userId) : null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        before: (input.before ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        after: (input.after ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        ip: input.ip ?? null,
      },
    });
  }
}
