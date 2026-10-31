import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GroupMealInquiryStatus } from '@prisma/client';
import { Events } from '@restaurant/shared';
import { BusinessError } from '../../common/errors/business.error';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateGroupMealInquiryDto,
  GroupMealInquiryQueryDto,
  UpdateGroupMealInquiryDto,
} from './dto/group-meal.dto';

@Injectable()
export class GroupMealService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  private map(row: {
    id: bigint;
    storeId: bigint;
    contactName: string;
    phone: string;
    company: string | null;
    guestCount: number;
    preferAt: Date;
    address: string | null;
    comboId: bigint | null;
    budget: bigint | null;
    remark: string | null;
    customerId: bigint | null;
    status: GroupMealInquiryStatus;
    adminRemark: string | null;
    createdAt: Date;
    updatedAt: Date;
    combo?: { nameZh: string; nameVi: string } | null;
  }) {
    return {
      id: row.id.toString(),
      storeId: row.storeId.toString(),
      contactName: row.contactName,
      phone: row.phone,
      company: row.company,
      guestCount: row.guestCount,
      preferAt: row.preferAt.toISOString(),
      address: row.address,
      comboId: row.comboId?.toString() ?? null,
      comboNameZh: row.combo?.nameZh ?? null,
      comboNameVi: row.combo?.nameVi ?? null,
      budget: row.budget != null ? Number(row.budget) : null,
      remark: row.remark,
      customerId: row.customerId?.toString() ?? null,
      status: row.status,
      adminRemark: row.adminRemark,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async createInquiry(dto: CreateGroupMealInquiryDto, customerId?: string) {
    const storeId = BigInt(dto.storeId || '1');
    if (dto.comboId) {
      const combo = await this.prisma.combo.findFirst({
        where: {
          id: BigInt(dto.comboId),
          storeId,
          status: 'on',
          isGroupMeal: true,
        },
      });
      if (!combo) throw new BusinessError('COMBO_NOT_FOUND');
    }

    const row = await this.prisma.groupMealInquiry.create({
      data: {
        storeId,
        contactName: dto.contactName,
        phone: dto.phone,
        company: dto.company,
        guestCount: dto.guestCount,
        preferAt: new Date(dto.preferAt),
        address: dto.address,
        comboId: dto.comboId ? BigInt(dto.comboId) : null,
        budget: dto.budget != null ? BigInt(dto.budget) : null,
        remark: dto.remark,
        customerId: customerId ? BigInt(customerId) : null,
      },
      include: { combo: { select: { nameZh: true, nameVi: true } } },
    });

    const mapped = this.map(row);
    const pendingCount = await this.countPending(mapped.storeId);
    this.events.emit(Events.GROUP_MEAL_INQUIRY_CREATED, {
      storeId: mapped.storeId,
      inquiry: mapped,
      pendingCount,
    });
    return mapped;
  }

  /** 待处理团购询单数量（菜单角标） */
  async countPending(storeId: string): Promise<number> {
    return this.prisma.groupMealInquiry.count({
      where: { storeId: BigInt(storeId), status: GroupMealInquiryStatus.pending },
    });
  }

  async list(storeId: string, query: GroupMealInquiryQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where = {
      storeId: BigInt(storeId),
      ...(query.status ? { status: query.status as GroupMealInquiryStatus } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.groupMealInquiry.count({ where }),
      this.prisma.groupMealInquiry.findMany({
        where,
        include: { combo: { select: { nameZh: true, nameVi: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, page, pageSize, list: rows.map((r) => this.map(r)) };
  }

  async update(storeId: string, id: string, dto: UpdateGroupMealInquiryDto) {
    const existing = await this.prisma.groupMealInquiry.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('GROUP_MEAL_INQUIRY_NOT_FOUND');
    const row = await this.prisma.groupMealInquiry.update({
      where: { id: existing.id },
      data: {
        status: dto.status as GroupMealInquiryStatus | undefined,
        adminRemark: dto.adminRemark,
      },
      include: { combo: { select: { nameZh: true, nameVi: true } } },
    });
    const mapped = this.map(row);
    const pendingCount = await this.countPending(storeId);
    this.events.emit(Events.GROUP_MEAL_INQUIRY_CREATED, {
      storeId,
      inquiry: mapped,
      pendingCount,
      updated: true,
    });
    return mapped;
  }
}
