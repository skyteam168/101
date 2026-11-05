import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CustomerStatus, LedgerDirection, Prisma } from '@prisma/client';
import { Events } from '@restaurant/shared';
import { BusinessError } from '../../common/errors/business.error';
import { resolvePublicStoreId } from '../../common/public-store.util';
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

  /**
   * 删除会员等级（安全策略）：
   * - 仍有会员挂在该等级：先迁移到本店「剩余等级中 minSpend 最低」的档位；若无其它等级则清空 memberLevelId（保留入会状态）。
   * - 清空后会员暂时无折扣/配送减免等权益，下次消费升级逻辑可按累计消费重新挂档。
   * - 历史订单金额不受影响（结账时已按当时折扣写入）。
   * - 停用请用 isActive=false，不必删除。
   */
  async deleteLevel(storeId: string, id: string, operatorId?: string) {
    const sid = BigInt(storeId);
    const lid = BigInt(id);
    const existing = await this.prisma.memberLevel.findFirst({
      where: { id: lid, storeId: sid },
    });
    if (!existing) throw new BusinessError('MEMBER_LEVEL_NOT_FOUND');

    const memberCount = await this.prisma.customer.count({
      where: { memberLevelId: lid },
    });

    const fallbacks = await this.prisma.memberLevel.findMany({
      where: { storeId: sid, id: { not: lid } },
      orderBy: [{ minSpend: 'asc' }, { sort: 'asc' }, { id: 'asc' }],
    });
    const fallback = fallbacks[0] ?? null;

    await this.prisma.$transaction(async (tx) => {
      if (memberCount > 0) {
        await tx.customer.updateMany({
          where: { memberLevelId: lid },
          data: { memberLevelId: fallback?.id ?? null },
        });
      }
      await tx.memberLevel.delete({ where: { id: lid } });
    });

    await this.audit.log({
      userId: operatorId,
      storeId,
      module: 'member',
      action: 'member_level.delete',
      targetType: 'member_level',
      targetId: id,
      before: {
        nameZh: existing.nameZh,
        nameVi: existing.nameVi,
        memberCount,
        fallbackLevelId: fallback?.id?.toString() ?? null,
      },
    });

    return {
      ok: true,
      migratedCount: memberCount,
      fallbackLevelId: fallback?.id?.toString() ?? null,
      fallbackNameZh: fallback?.nameZh ?? null,
      fallbackNameVi: fallback?.nameVi ?? null,
    };
  }

  /** 本店相关顾客：会员等级 / 订单 / 聊天 / 预订 / 团餐询价 */
  private storeCustomerScope(storeId: string): Prisma.CustomerWhereInput {
    const sid = BigInt(storeId);
    return {
      OR: [
        { memberLevel: { storeId: sid } },
        { orders: { some: { storeId: sid } } },
        { chatConversations: { some: { storeId: sid } } },
        { reservations: { some: { storeId: sid } } },
        { groupMealInquiries: { some: { storeId: sid } } },
      ],
    };
  }

  private async requireStoreCustomer(storeId: string, customerId: string) {
    const row = await this.prisma.customer.findFirst({
      where: {
        id: BigInt(customerId),
        status: { not: CustomerStatus.deleted },
        ...this.storeCustomerScope(storeId),
      },
      include: { memberLevel: true },
    });
    if (!row) throw new BusinessError('CUSTOMER_NOT_FOUND');
    return row;
  }

  async listMembers(storeId: string, query: MemberQueryDto) {
    const and: Prisma.CustomerWhereInput[] = [
      this.storeCustomerScope(storeId),
      {
        status: query.status
          ? (query.status as CustomerStatus)
          : { not: CustomerStatus.deleted },
      },
    ];
    if (query.keyword) {
      and.push({
        OR: [
          { email: { contains: query.keyword } },
          { name: { contains: query.keyword } },
          { phone: { contains: query.keyword } },
        ],
      });
    }
    const rows = await this.prisma.customer.findMany({
      where: { AND: and },
      include: { memberLevel: true },
      orderBy: { id: 'desc' },
      take: 200,
    });
    return rows.map((r) => this.mapCustomer(r));
  }

  async getMember(storeId: string, id: string) {
    const row = await this.requireStoreCustomer(storeId, id);
    return this.mapCustomer(row);
  }

  async updateMember(storeId: string, id: string, dto: UpdateMemberDto) {
    const existing = await this.requireStoreCustomer(storeId, id);
    if (dto.memberLevelId) {
      const lv = await this.prisma.memberLevel.findUnique({
        where: { id: BigInt(dto.memberLevelId), storeId: BigInt(storeId) },
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

  async setStatus(
    storeId: string,
    id: string,
    status: 'active' | 'banned',
    operatorId?: string,
  ) {
    const existing = await this.requireStoreCustomer(storeId, id);
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

  async softDelete(storeId: string, id: string, operatorId?: string) {
    void operatorId;
    const existing = await this.requireStoreCustomer(storeId, id);
    const row = await this.prisma.customer.update({
      where: { id: existing.id },
      data: { status: CustomerStatus.deleted, deletedAt: new Date() },
      include: { memberLevel: true },
    });
    return this.mapCustomer(row);
  }

  async adjustPoints(
    storeId: string,
    id: string,
    operatorId: string | undefined,
    dto: AdjustPointsDto,
  ) {
    await this.requireStoreCustomer(storeId, id);
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

  async adjustBalance(
    storeId: string,
    id: string,
    operatorId: string | undefined,
    dto: AdjustBalanceDto,
  ) {
    await this.requireStoreCustomer(storeId, id);
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
  async grantBirthdayBonus(storeId: string, id: string, operatorId?: string) {
    const c = await this.requireStoreCustomer(storeId, id);
    if (c.status !== CustomerStatus.active) throw new BusinessError('CUSTOMER_NOT_FOUND');
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
    return this.adjustPoints(storeId, id, operatorId, {
      delta: bonus,
      remark: 'birthday_bonus',
    });
  }

  async searchActive(storeId: string, keyword?: string) {
    const and: Prisma.CustomerWhereInput[] = [
      this.storeCustomerScope(storeId),
      { status: CustomerStatus.active },
    ];
    if (keyword) {
      and.push({
        OR: [
          { email: { contains: keyword } },
          { name: { contains: keyword } },
          { phone: { contains: keyword } },
        ],
      });
    }
    const rows = await this.prisma.customer.findMany({
      where: { AND: and },
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

  async join(storeId: string, customerId: string, dto: { birthday: string; agree: boolean }) {
    if (!dto.agree) throw new BusinessError('MEMBER_AGREE_REQUIRED');
    if (!dto.birthday) throw new BusinessError('MEMBER_BIRTHDAY_REQUIRED');
    const existing = await this.prisma.customer.findUnique({
      where: { id: BigInt(customerId) },
      include: { memberLevel: true },
    });
    if (!existing || existing.status !== CustomerStatus.active) {
      throw new BusinessError('CUSTOMER_NOT_FOUND');
    }
    const sid = BigInt(storeId);
    // 已挂他店等级则保留；未入会时只绑定本店最低档
    const keepLevel =
      existing.memberLevelId && existing.memberLevel?.storeId === sid
        ? existing.memberLevelId
        : null;
    const base =
      keepLevel != null
        ? null
        : await this.prisma.memberLevel.findFirst({
            where: { storeId: sid, isActive: true },
            orderBy: [{ minSpend: 'asc' }, { sort: 'asc' }],
          });
    await this.prisma.customer.update({
      where: { id: existing.id },
      data: {
        birthday: new Date(dto.birthday),
        memberJoinedAt: existing.memberJoinedAt ?? new Date(),
        memberLevelId: keepLevel ?? base?.id ?? null,
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

  async redeemBirthdayGift(storeId: string, id: string) {
    const c = await this.requireStoreCustomer(storeId, id);
    if (c.status !== CustomerStatus.active) throw new BusinessError('CUSTOMER_NOT_FOUND');
    if (!this.isBirthdayToday(c.birthday)) throw new BusinessError('NOT_BIRTHDAY');
    const row = await this.prisma.customer.update({
      where: { id: c.id },
      data: { birthdayGiftRedeemedYear: this.vnYear() },
      include: { memberLevel: true },
    });
    return this.mapCustomer(row);
  }

  /** 每小时检查一次，生日当天只发一次 */
  async sendBirthdayGreetings(storeId?: string) {
    storeId = resolvePublicStoreId(storeId);
    const year = this.vnYear();
    const rows = await this.prisma.customer.findMany({
      where: {
        AND: [
          this.storeCustomerScope(storeId),
          {
            status: CustomerStatus.active,
            birthday: { not: null },
            OR: [{ memberJoinedAt: { not: null } }, { memberLevelId: { not: null } }],
          },
        ],
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
        await this.adjustPoints(storeId, c.id.toString(), undefined, {
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
