import { Injectable } from '@nestjs/common';
import { BusinessError } from '../../common/errors/business.error';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateNoticeDto, UpdateNoticeDto } from './dto/notice.dto';

@Injectable()
export class NoticeService {
  constructor(private readonly prisma: PrismaService) {}

  private map(n: {
    id: bigint;
    storeId: bigint;
    titleZh: string;
    titleVi: string;
    contentZh: string;
    contentVi: string;
    level: string;
    isActive: boolean;
    sort: number;
    expiresAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: n.id.toString(),
      storeId: n.storeId.toString(),
      titleZh: n.titleZh,
      titleVi: n.titleVi,
      contentZh: n.contentZh,
      contentVi: n.contentVi,
      level: n.level,
      isActive: n.isActive,
      sort: n.sort,
      expiresAt: n.expiresAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
    };
  }

  async list(storeId: string) {
    const rows = await this.prisma.storeNotice.findMany({
      where: { storeId: BigInt(storeId) },
      orderBy: [{ sort: 'asc' }, { id: 'desc' }],
    });
    return rows.map((r) => this.map(r));
  }

  /** H5 首页：仅启用且未过期 */
  async listPublic(storeId: string) {
    const now = new Date();
    const rows = await this.prisma.storeNotice.findMany({
      where: {
        storeId: BigInt(storeId),
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: [{ sort: 'asc' }, { id: 'desc' }],
      take: 20,
    });
    return rows.map((r) => this.map(r));
  }

  async create(storeId: string, dto: CreateNoticeDto) {
    const row = await this.prisma.storeNotice.create({
      data: {
        storeId: BigInt(storeId),
        titleZh: dto.titleZh,
        titleVi: dto.titleVi,
        contentZh: dto.contentZh,
        contentVi: dto.contentVi,
        level: dto.level ?? 'info',
        isActive: dto.isActive ?? true,
        sort: dto.sort ?? 0,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
    return this.map(row);
  }

  async update(storeId: string, id: string, dto: UpdateNoticeDto) {
    const existing = await this.prisma.storeNotice.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('NOTICE_NOT_FOUND');

    const row = await this.prisma.storeNotice.update({
      where: { id: existing.id },
      data: {
        titleZh: dto.titleZh,
        titleVi: dto.titleVi,
        contentZh: dto.contentZh,
        contentVi: dto.contentVi,
        level: dto.level,
        isActive: dto.isActive,
        sort: dto.sort,
        expiresAt:
          dto.expiresAt === undefined
            ? undefined
            : dto.expiresAt
              ? new Date(dto.expiresAt)
              : null,
      },
    });
    return this.map(row);
  }

  async remove(storeId: string, id: string) {
    const existing = await this.prisma.storeNotice.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('NOTICE_NOT_FOUND');
    await this.prisma.storeNotice.delete({ where: { id: existing.id } });
    return { ok: true };
  }
}
