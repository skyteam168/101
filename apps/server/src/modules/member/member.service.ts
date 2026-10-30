import { Injectable } from '@nestjs/common';
import { CustomerStatus, LedgerDirection, Prisma } from '@prisma/client';
import { BusinessError } from '../../common/errors/business.error';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AdjustBalanceDto,
  AdjustPointsDto,
  CreateMemberLevelDto,
  MemberQueryDto,
  UpdateMemberDto,
  UpdateMemberLevelDto,
} from './dto/member.dto';

@Injectable()
export class MemberService {
  constructor(private readonly prisma: PrismaService) {}

  private mapLevel(r: {
    id: bigint;
    nameZh: string;
    nameVi: string;
    minPoints: number;
    discountPercent: number;
    birthdayBonusPoints: number;
    sort: number;
    isActive: boolean;
  }) {
    return {
      id: r.id.toString(),
      nameZh: r.nameZh,
      nameVi: r.nameVi,
      minPoints: r.minPoints,
      discountPercent: r.discountPercent,
      birthdayBonusPoints: r.birthdayBonusPoints,
      sort: r.sort,
      isActive: r.isActive,
    };
  }

  private mapCustomer(
    c: Prisma.CustomerGetPayload<{ include: { memberLevel: true } }>,
  ) {
    return {
      id: c.id.toString(),
      email: c.email,
      name: c.name,
      phone: c.phone,
      lang: c.lang,
      status: c.status,
      birthday: c.birthday?.toISOString().slice(0, 10) ?? null,
      points: c.points,
      balance: Number(c.balance),
      memberLevelId: c.memberLevelId?.toString() ?? null,
      memberLevel: c.memberLevel ? this.mapLevel(c.memberLevel) : null,
      deletedAt: c.deletedAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    };
  }

  listLevels(storeId: string) {
    return this.prisma.memberLevel
      .findMany({
        where: { storeId: BigInt(storeId) },
        orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      })
      .then((rows) => rows.map((r) => this.mapLevel(r)));
  }

  async createLevel(storeId: string, dto: CreateMemberLevelDto) {
    const row = await this.prisma.memberLevel.create({
      data: {
        storeId: BigInt(storeId),
        nameZh: dto.nameZh,
        nameVi: dto.nameVi,
        minPoints: dto.minPoints ?? 0,
        discountPercent: dto.discountPercent ?? 0,
        birthdayBonusPoints: dto.birthdayBonusPoints ?? 0,
        sort: dto.sort ?? 0,
      },
    });
    return this.mapLevel(row);
  }

  async updateLevel(storeId: string, id: string, dto: UpdateMemberLevelDto) {
    const existing = await this.prisma.memberLevel.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('MEMBER_LEVEL_NOT_FOUND');
    const row = await this.prisma.memberLevel.update({
      where: { id: existing.id },
      data: {
        nameZh: dto.nameZh,
        nameVi: dto.nameVi,
        minPoints: dto.minPoints,
        discountPercent: dto.discountPercent,
        birthdayBonusPoints: dto.birthdayBonusPoints,
        sort: dto.sort,
        isActive: dto.isActive,
      },
    });
    return this.mapLevel(row);
  }

  async listMembers(storeId: string, query: MemberQueryDto) {
    void storeId;
    const where: Prisma.CustomerWhereInput = {
      status: query.status
        ? (query.status as CustomerStatus)
        : { not: CustomerStatus.deleted },
    };
    if (query.keyword) {
      where.OR = [
        { email: { contains: query.keyword } },
        { name: { contains: query.keyword } },
        { phone: { contains: query.keyword } },
      ];
    }
    const rows = await this.prisma.customer.findMany({
      where,
      include: { memberLevel: true },
      orderBy: { id: 'desc' },
      take: 200,
    });
    return rows.map((r) => this.mapCustomer(r));
  }

  async getMember(id: string) {
    const row = await this.prisma.customer.findUnique({
      where: { id: BigInt(id) },
      include: { memberLevel: true },
    });
    if (!row || row.status === CustomerStatus.deleted) {
      throw new BusinessError('CUSTOMER_NOT_FOUND');
    }
    return this.mapCustomer(row);
  }

  async updateMember(id: string, dto: UpdateMemberDto) {
    const existing = await this.prisma.customer.findUnique({ where: { id: BigInt(id) } });
    if (!existing || existing.status === CustomerStatus.deleted) {
      throw new BusinessError('CUSTOMER_NOT_FOUND');
    }
    if (dto.memberLevelId) {
      const lv = await this.prisma.memberLevel.findUnique({
        where: { id: BigInt(dto.memberLevelId) },
      });
      if (!lv) throw new BusinessError('MEMBER_LEVEL_NOT_FOUND');
    }
    const row = await this.prisma.customer.update({
      where: { id: existing.id },
      data: {
        name: dto.name,
        phone: dto.phone,
        birthday: dto.birthday ? new Date(dto.birthday) : undefined,
        memberLevelId: dto.memberLevelId ? BigInt(dto.memberLevelId) : undefined,
      },
      include: { memberLevel: true },
    });
    return this.mapCustomer(row);
  }

  async setStatus(id: string, status: 'active' | 'banned') {
    const existing = await this.prisma.customer.findUnique({ where: { id: BigInt(id) } });
    if (!existing || existing.status === CustomerStatus.deleted) {
      throw new BusinessError('CUSTOMER_NOT_FOUND');
    }
    const row = await this.prisma.customer.update({
      where: { id: existing.id },
      data: { status },
      include: { memberLevel: true },
    });
    return this.mapCustomer(row);
  }

  async softDelete(id: string, operatorId?: string) {
    void operatorId;
    const existing = await this.prisma.customer.findUnique({ where: { id: BigInt(id) } });
    if (!existing || existing.status === CustomerStatus.deleted) {
      throw new BusinessError('CUSTOMER_NOT_FOUND');
    }
    const row = await this.prisma.customer.update({
      where: { id: existing.id },
      data: { status: CustomerStatus.deleted, deletedAt: new Date() },
      include: { memberLevel: true },
    });
    return this.mapCustomer(row);
  }

  async adjustPoints(id: string, operatorId: string | undefined, dto: AdjustPointsDto) {
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.customer.findUnique({ where: { id: BigInt(id) } });
      if (!c || c.status === CustomerStatus.deleted) throw new BusinessError('CUSTOMER_NOT_FOUND');
      const next = c.points + dto.delta;
      if (next < 0) throw new BusinessError('POINTS_INSUFFICIENT');
      const updated = await tx.customer.update({
        where: { id: c.id },
        data: { points: next },
        include: { memberLevel: true },
      });
      await tx.pointsLedger.create({
        data: {
          customerId: c.id,
          direction:
            dto.delta > 0
              ? LedgerDirection.in
              : dto.delta < 0
                ? LedgerDirection.out
                : LedgerDirection.adjust,
          amount: Math.abs(dto.delta),
          balanceAfter: next,
          remark: dto.remark,
          operatorId: operatorId ? BigInt(operatorId) : null,
        },
      });
      await this.maybeUpgradeLevel(tx, updated);
      const fresh = await tx.customer.findUniqueOrThrow({
        where: { id: c.id },
        include: { memberLevel: true },
      });
      return this.mapCustomer(fresh);
    });
  }

  async adjustBalance(id: string, operatorId: string | undefined, dto: AdjustBalanceDto) {
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.customer.findUnique({ where: { id: BigInt(id) } });
      if (!c || c.status === CustomerStatus.deleted) throw new BusinessError('CUSTOMER_NOT_FOUND');
      const next = c.balance + BigInt(dto.delta);
      if (next < 0n) throw new BusinessError('BALANCE_INSUFFICIENT');
      const updated = await tx.customer.update({
        where: { id: c.id },
        data: { balance: next },
        include: { memberLevel: true },
      });
      await tx.balanceLedger.create({
        data: {
          customerId: c.id,
          direction:
            dto.delta > 0
              ? LedgerDirection.in
              : dto.delta < 0
                ? LedgerDirection.out
                : LedgerDirection.adjust,
          amount: BigInt(Math.abs(dto.delta)),
          balanceAfter: next,
          remark: dto.remark,
          operatorId: operatorId ? BigInt(operatorId) : null,
        },
      });
      return this.mapCustomer(updated);
    });
  }

  private async maybeUpgradeLevel(
    tx: Prisma.TransactionClient,
    customer: { id: bigint; points: number; memberLevelId: bigint | null },
  ) {
    const levels = await tx.memberLevel.findMany({
      where: { isActive: true },
      orderBy: { minPoints: 'desc' },
    });
    const match = levels.find((l) => customer.points >= l.minPoints);
    if (match && match.id !== customer.memberLevelId) {
      await tx.customer.update({
        where: { id: customer.id },
        data: { memberLevelId: match.id },
      });
    }
  }

  /** 生日当天发等级生日积分（可手动触发） */
  async grantBirthdayBonus(id: string, operatorId?: string) {
    const c = await this.prisma.customer.findUnique({
      where: { id: BigInt(id) },
      include: { memberLevel: true },
    });
    if (!c || c.status !== CustomerStatus.active) throw new BusinessError('CUSTOMER_NOT_FOUND');
    if (!c.birthday) throw new BusinessError('BIRTHDAY_NOT_SET');
    const today = new Date();
    if (
      c.birthday.getUTCMonth() !== today.getUTCMonth() ||
      c.birthday.getUTCDate() !== today.getUTCDate()
    ) {
      throw new BusinessError('NOT_BIRTHDAY');
    }
    const bonus = c.memberLevel?.birthdayBonusPoints ?? 0;
    if (bonus <= 0) return this.mapCustomer(c);
    return this.adjustPoints(id, operatorId, {
      delta: bonus,
      remark: 'birthday_bonus',
    });
  }

  async searchActive(keyword?: string) {
    const where: Prisma.CustomerWhereInput = { status: CustomerStatus.active };
    if (keyword) {
      where.OR = [
        { email: { contains: keyword } },
        { name: { contains: keyword } },
        { phone: { contains: keyword } },
      ];
    }
    const rows = await this.prisma.customer.findMany({
      where,
      include: { memberLevel: true },
      take: 30,
      orderBy: { id: 'desc' },
    });
    return rows.map((r) => this.mapCustomer(r));
  }
}
