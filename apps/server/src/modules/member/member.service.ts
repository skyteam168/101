import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CustomerStatus, LedgerDirection, Prisma } from '@prisma/client';
import { Events } from '@restaurant/shared';
import { BusinessError } from '../../common/errors/business.error';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ChatService } from '../chat/chat.service';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: ChatService,
    private readonly audit: AuditService,
  ) {}

  private mapLevel(r: {
    id: bigint;
    nameZh: string;
    nameVi: string;
    minPoints: number;
    minSpend?: bigint;
    discountPercent: number;
    birthdayBonusPoints: number;
    deliveryFeeOff?: bigint;
    priorityReserve?: boolean;
    priorityDelivery?: boolean;
    birthdayGift?: boolean;
    sort: number;
    isActive: boolean;
  }) {
    return {
      id: r.id.toString(),
      nameZh: r.nameZh,
      nameVi: r.nameVi,
      minPoints: r.minPoints,
      minSpend: Number(r.minSpend ?? 0),
      discountPercent: r.discountPercent,
      birthdayBonusPoints: r.birthdayBonusPoints,
      deliveryFeeOff: Number(r.deliveryFeeOff ?? 0),
      priorityReserve: !!r.priorityReserve,
      priorityDelivery: !!r.priorityDelivery,
      birthdayGift: r.birthdayGift !== false,
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
      memberJoinedAt: c.memberJoinedAt?.toISOString() ?? null,
      lifetimeSpend: Number(c.lifetimeSpend ?? 0),
      birthdayNotifiedYear: c.birthdayNotifiedYear ?? null,
      birthdayGiftRedeemedYear: c.birthdayGiftRedeemedYear ?? null,
      points: c.points,
      balance: Number(c.balance),
      memberLevelId: c.memberLevelId?.toString() ?? null,
      memberLevel: c.memberLevel ? this.mapLevel(c.memberLevel) : null,
      registerSource: c.registerSource,
      hasPassword: !!c.passwordHash,
      hasGoogle: !!c.googleSub,
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
        minSpend: BigInt(dto.minSpend ?? 0),
        discountPercent: dto.discountPercent ?? 0,
        birthdayBonusPoints: dto.birthdayBonusPoints ?? 0,
        deliveryFeeOff: BigInt(dto.deliveryFeeOff ?? 0),
        priorityReserve: dto.priorityReserve ?? false,
        priorityDelivery: dto.priorityDelivery ?? false,
        birthdayGift: dto.birthdayGift ?? true,
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
        minSpend: dto.minSpend === undefined ? undefined : BigInt(dto.minSpend),
        discountPercent: dto.discountPercent,
        birthdayBonusPoints: dto.birthdayBonusPoints,
        deliveryFeeOff: dto.deliveryFeeOff === undefined ? undefined : BigInt(dto.deliveryFeeOff),
        priorityReserve: dto.priorityReserve,
        priorityDelivery: dto.priorityDelivery,
        birthdayGift: dto.birthdayGift,
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

  async setStatus(id: string, status: 'active' | 'banned', operatorId?: string) {
    const existing = await this.prisma.customer.findUnique({ where: { id: BigInt(id) } });
    if (!existing || existing.status === CustomerStatus.deleted) {
      throw new BusinessError('CUSTOMER_NOT_FOUND');
    }
    const row = await this.prisma.customer.update({
      where: { id: existing.id },
      data: { status },
      include: { memberLevel: true },
    });
    const mapped = this.mapCustomer(row);
    if (status === 'banned') {
      await this.audit.log({
        userId: operatorId,
        module: 'member',
        action: 'member.ban',
        targetType: 'customer',
        targetId: id,
        before: { status: existing.status },
        after: { status },
      });
    }
    return mapped;
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
    customer: {
      id: bigint;
      memberLevelId: bigint | null;
      memberJoinedAt?: Date | null;
      lifetimeSpend?: bigint;
    },
  ) {
    if (!customer.memberLevelId && !customer.memberJoinedAt) return;
    const levels = await tx.memberLevel.findMany({ where: { isActive: true } });
    const spend = Number(customer.lifetimeSpend ?? 0);
    const current = levels.find((l) => l.id === customer.memberLevelId);
    const reachable = levels
      .filter((l) => spend >= Number(l.minSpend))
      .sort((a, b) => Number(b.minSpend) - Number(a.minSpend) || b.sort - a.sort);
    const best = reachable[0];
    if (!best) return;
    const currentSpend = current ? Number(current.minSpend) : -1;
    if (Number(best.minSpend) > currentSpend && best.id !== customer.memberLevelId) {
      await tx.customer.update({
        where: { id: customer.id },
        data: { memberLevelId: best.id },
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

  /** 已入会：主动加入，或历史数据里已经挂了等级 */
  isJoined(c: { memberJoinedAt?: Date | null; memberLevelId?: bigint | null }) {
    return !!c.memberJoinedAt || c.memberLevelId != null;
  }

  async listBenefits(storeId: string) {
    const levels = await this.prisma.memberLevel.findMany({
      where: { storeId: BigInt(storeId), isActive: true },
      orderBy: [{ minSpend: 'asc' }, { sort: 'asc' }],
    });
    return { levels: levels.map((r) => this.mapLevel(r)) };
  }

  async membershipOf(customerId: string) {
    const c = await this.prisma.customer.findUnique({
      where: { id: BigInt(customerId) },
      include: { memberLevel: true },
    });
    if (!c || c.status === CustomerStatus.deleted) throw new BusinessError('CUSTOMER_NOT_FOUND');
    const year = this.vnYear();
    const birthdayToday = this.isBirthdayToday(c.birthday);
    return {
      ...this.mapCustomer(c),
      joined: this.isJoined(c),
      birthdayToday,
      birthdayGiftPending:
        birthdayToday &&
        this.isJoined(c) &&
        c.memberLevel?.birthdayGift !== false &&
        c.birthdayGiftRedeemedYear !== year,
    };
  }

  async join(customerId: string, dto: { birthday: string; agree: boolean }) {
    if (!dto.agree) throw new BusinessError('MEMBER_AGREE_REQUIRED');
    if (!dto.birthday) throw new BusinessError('MEMBER_BIRTHDAY_REQUIRED');
    const existing = await this.prisma.customer.findUnique({
      where: { id: BigInt(customerId) },
    });
    if (!existing || existing.status !== CustomerStatus.active) {
      throw new BusinessError('CUSTOMER_NOT_FOUND');
    }
    const base = await this.prisma.memberLevel.findFirst({
      where: { isActive: true },
      orderBy: [{ minSpend: 'asc' }, { sort: 'asc' }],
    });
    await this.prisma.customer.update({
      where: { id: existing.id },
      data: {
        birthday: new Date(dto.birthday),
        memberJoinedAt: existing.memberJoinedAt ?? new Date(),
        memberLevelId: existing.memberLevelId ?? base?.id ?? null,
      },
    });
    return this.membershipOf(customerId);
  }

  /** 外卖运费减免与优先配送 */
  async deliveryPerk(customerId: string, rawFee: number) {
    const c = await this.prisma.customer.findUnique({
      where: { id: BigInt(customerId) },
      include: { memberLevel: true },
    });
    if (!c || !this.isJoined(c) || !c.memberLevel) {
      return { fee: rawFee, off: 0, priority: false };
    }
    const off = Math.min(rawFee, Number(c.memberLevel.deliveryFeeOff));
    return {
      fee: Math.max(0, rawFee - off),
      off,
      priority: c.memberLevel.priorityDelivery,
    };
  }

  /** 预定是否优先，并附带今日生日赠菜提示 */
  async reservationPerk(phone: string) {
    const c = await this.prisma.customer.findFirst({
      where: { phone, status: CustomerStatus.active },
      include: { memberLevel: true },
      orderBy: { memberJoinedAt: 'desc' },
    });
    if (!c || !this.isJoined(c) || !c.memberLevel) {
      return { priority: false, birthdayGift: false, customerId: null as string | null };
    }
    return {
      priority: c.memberLevel.priorityReserve,
      birthdayGift: this.isBirthdayToday(c.birthday) && c.memberLevel.birthdayGift,
      customerId: c.id.toString(),
    };
  }

  @OnEvent(Events.ORDER_PAID)
  async onOrderPaid(payload: { order?: { customerId?: string | null; total?: number; type?: string } }) {
    const customerId = payload.order?.customerId;
    const total = payload.order?.total;
    if (!customerId || !total || total <= 0) return;
    await this.accrueSpend(customerId, total);
  }

  async accrueSpend(customerId: string, amount: number) {
    await this.prisma.$transaction(async (tx) => {
      const c = await tx.customer.findUnique({ where: { id: BigInt(customerId) } });
      if (!c || !this.isJoined(c)) return;
      const updated = await tx.customer.update({
        where: { id: c.id },
        data: { lifetimeSpend: c.lifetimeSpend + BigInt(Math.round(amount)) },
      });
      await this.maybeUpgradeLevel(tx, updated);
    });
  }

  async redeemBirthdayGift(id: string) {
    const c = await this.prisma.customer.findUnique({
      where: { id: BigInt(id) },
      include: { memberLevel: true },
    });
    if (!c || c.status !== CustomerStatus.active) throw new BusinessError('CUSTOMER_NOT_FOUND');
    if (!this.isBirthdayToday(c.birthday)) throw new BusinessError('NOT_BIRTHDAY');
    const row = await this.prisma.customer.update({
      where: { id: c.id },
      data: { birthdayGiftRedeemedYear: this.vnYear() },
      include: { memberLevel: true },
    });
    return this.mapCustomer(row);
  }

  /** 每小时检查一次，生日当天只发一次 */
  async sendBirthdayGreetings(storeId = '1') {
    const year = this.vnYear();
    const rows = await this.prisma.customer.findMany({
      where: {
        status: CustomerStatus.active,
        birthday: { not: null },
        OR: [{ memberJoinedAt: { not: null } }, { memberLevelId: { not: null } }],
      },
      include: { memberLevel: true },
    });
    let sent = 0;
    for (const c of rows) {
      if (!this.isBirthdayToday(c.birthday) || c.birthdayNotifiedYear === year) continue;
      const vi = c.lang === 'vi';
      const gift = c.memberLevel?.birthdayGift !== false;
      const who = c.name?.trim();
      const text = vi
        ? gift
          ? `${who ? `${who}, ` : ''}thành viên thân mến, hôm nay là sinh nhật của bạn! Chúc mừng sinh nhật. Khi dùng bữa tại quán, cửa hàng sẽ tặng một món do quán chọn.`
          : `${who ? `${who}, ` : ''}thành viên thân mến, hôm nay là sinh nhật của bạn! Chúc bạn một ngày vui vẻ.`
        : gift
          ? `尊贵的会员${who ? ` ${who}` : ''}，今天是你的生日！祝你生日快乐。今天到店用餐，门店会赠送一道菜（由门店安排，不指定具体菜品）。`
          : `尊贵的会员${who ? ` ${who}` : ''}，今天是你的生日！祝你今天愉快。`;
      await this.chat.sendSystemMessage(storeId, c.id.toString(), text);
      if ((c.memberLevel?.birthdayBonusPoints ?? 0) > 0) {
        await this.adjustPoints(c.id.toString(), undefined, {
          delta: c.memberLevel!.birthdayBonusPoints,
          remark: 'birthday_bonus',
        });
      }
      await this.prisma.customer.update({
        where: { id: c.id },
        data: { birthdayNotifiedYear: year },
      });
      sent += 1;
    }
    return { sent };
  }

  private vnYear(now = new Date()) {
    return Number(
      new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric' }).format(now),
    );
  }

  private isBirthdayToday(birthday: Date | null | undefined, now = new Date()) {
    if (!birthday) return false;
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Ho_Chi_Minh',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const month = Number(parts.find((p) => p.type === 'month')?.value);
    const day = Number(parts.find((p) => p.type === 'day')?.value);
    return birthday.getUTCMonth() + 1 === month && birthday.getUTCDate() === day;
  }
}
