import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CouponStatus, CustomerStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { BusinessError } from '../../common/errors/business.error';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CUSTOMER_INBOX_MESSAGE } from '../chat/customer-inbox.event';
import { couponGiftMessage } from './coupon-message';
import {
  CreateCouponTemplateDto,
  CreatePromoRuleDto,
  IssueCouponDto,
  UpdateCouponTemplateDto,
  UpdatePromoRuleDto,
} from './dto/marketing.dto';
import { DiscountSpec } from './pricing.util';

@Injectable()
export class MarketingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly audit: AuditService,
  ) {}

  private dishIds(v: unknown): string[] | null {
    if (!v) return null;
    if (Array.isArray(v)) return v.map(String);
    return null;
  }

  private mapTemplate(r: {
    id: bigint;
    nameZh: string;
    nameVi: string;
    type: string;
    value: bigint;
    minSpend: bigint;
    validDays: number;
    stackable: boolean;
    scope: string;
    dishIds: unknown;
    channel: string;
    isActive: boolean;
  }) {
    return {
      id: r.id.toString(),
      nameZh: r.nameZh,
      nameVi: r.nameVi,
      type: r.type,
      value: Number(r.value),
      minSpend: Number(r.minSpend),
      validDays: r.validDays,
      stackable: r.stackable,
      scope: r.scope,
      dishIds: this.dishIds(r.dishIds),
      channel: r.channel,
      isActive: r.isActive,
    };
  }

  private mapRule(r: {
    id: bigint;
    nameZh: string;
    nameVi: string;
    type: string;
    value: bigint;
    minSpend: bigint;
    scope: string;
    dishIds: unknown;
    channel: string;
    isActive: boolean;
  }) {
    return {
      id: r.id.toString(),
      nameZh: r.nameZh,
      nameVi: r.nameVi,
      type: r.type,
      value: Number(r.value),
      minSpend: Number(r.minSpend),
      scope: r.scope,
      dishIds: this.dishIds(r.dishIds),
      channel: r.channel,
      isActive: r.isActive,
    };
  }

  /** 将已过期未用券标为 expired，保证统计口径准确 */
  private async expireOverdue(storeId: string) {
    await this.prisma.coupon.updateMany({
      where: {
        template: { storeId: BigInt(storeId) },
        status: CouponStatus.unused,
        expiresAt: { lt: new Date() },
      },
      data: { status: CouponStatus.expired },
    });
  }

  private emptyStats() {
    return { issued: 0, unused: 0, used: 0, expired: 0, useRate: 0 };
  }

  private attachStats(
    templateId: bigint,
    groups: { templateId: bigint; status: CouponStatus; _count: number }[],
  ) {
    const stats = this.emptyStats();
    for (const g of groups) {
      if (g.templateId !== templateId) continue;
      stats.issued += g._count;
      if (g.status === CouponStatus.unused) stats.unused = g._count;
      else if (g.status === CouponStatus.used) stats.used = g._count;
      else if (g.status === CouponStatus.expired) stats.expired = g._count;
    }
    stats.useRate = stats.issued > 0 ? Math.round((stats.used / stats.issued) * 1000) / 10 : 0;
    return stats;
  }

  async listTemplates(storeId: string) {
    await this.expireOverdue(storeId);
    const [rows, groups] = await Promise.all([
      this.prisma.couponTemplate.findMany({
        where: { storeId: BigInt(storeId) },
        orderBy: { id: 'desc' },
      }),
      this.prisma.coupon.groupBy({
        by: ['templateId', 'status'],
        where: { template: { storeId: BigInt(storeId) } },
        _count: true,
      }),
    ]);
    const countRows = groups.map((g) => ({
      templateId: g.templateId,
      status: g.status,
      _count: g._count,
    }));
    return rows.map((r) => ({
      ...this.mapTemplate(r),
      stats: this.attachStats(r.id, countRows),
    }));
  }

  /** H5 可领取：启用中的模板 */
  listPublicTemplates(storeId: string) {
    return this.prisma.couponTemplate
      .findMany({
        where: { storeId: BigInt(storeId), isActive: true },
        orderBy: { id: 'desc' },
      })
      .then((rows) => rows.map((r) => this.mapTemplate(r)));
  }

  /** 顾客自助领取：每客每模板最多一张未使用券 */
  async claimTemplate(storeId: string, customerId: string, templateId: string) {
    const tpl = await this.prisma.couponTemplate.findFirst({
      where: {
        id: BigInt(templateId),
        storeId: BigInt(storeId),
        isActive: true,
      },
    });
    if (!tpl) throw new BusinessError('COUPON_TEMPLATE_NOT_FOUND');

    const existing = await this.prisma.coupon.findFirst({
      where: {
        templateId: tpl.id,
        customerId: BigInt(customerId),
        status: CouponStatus.unused,
      },
    });
    if (existing) throw new BusinessError('COUPON_ALREADY_CLAIMED');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + tpl.validDays);
    const code = `C${Date.now().toString(36).toUpperCase()}${randomBytes(2).toString('hex').toUpperCase()}`;
    const row = await this.prisma.coupon.create({
      data: {
        templateId: tpl.id,
        customerId: BigInt(customerId),
        code,
        expiresAt,
      },
      include: { template: true },
    });
    return {
      id: row.id.toString(),
      code: row.code,
      status: row.status,
      expiresAt: row.expiresAt.toISOString(),
      template: this.mapTemplate(row.template),
    };
  }

  async createTemplate(storeId: string, dto: CreateCouponTemplateDto) {
    const row = await this.prisma.couponTemplate.create({
      data: {
        storeId: BigInt(storeId),
        nameZh: dto.nameZh,
        nameVi: dto.nameVi,
        type: dto.type,
        value: BigInt(dto.value),
        minSpend: BigInt(dto.minSpend ?? 0),
        validDays: dto.validDays ?? 30,
        stackable: dto.stackable ?? false,
        scope: dto.scope ?? 'order',
        dishIds: dto.dishIds ?? Prisma.JsonNull,
        channel: dto.channel ?? 'all',
      },
    });
    return this.mapTemplate(row);
  }

  async updateTemplate(storeId: string, id: string, dto: UpdateCouponTemplateDto) {
    const existing = await this.prisma.couponTemplate.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('COUPON_TEMPLATE_NOT_FOUND');
    const row = await this.prisma.couponTemplate.update({
      where: { id: existing.id },
      data: {
        nameZh: dto.nameZh,
        nameVi: dto.nameVi,
        type: dto.type,
        value: dto.value != null ? BigInt(dto.value) : undefined,
        minSpend: dto.minSpend != null ? BigInt(dto.minSpend) : undefined,
        validDays: dto.validDays,
        stackable: dto.stackable,
        scope: dto.scope,
        dishIds: dto.dishIds === undefined ? undefined : dto.dishIds ?? Prisma.JsonNull,
        channel: dto.channel,
        isActive: dto.isActive,
      },
    });
    return this.mapTemplate(row);
  }

  /**
   * 删除优惠券模板（安全策略）：
   * - 已有核销：禁止（历史订单仍可能引用券记录）
   * - 仍有未使用领取：禁止（避免顾客结账时券突然消失、订单 SET NULL 后按原价结算）
   * - 仅过期或无人领取：清理过期券后删模板
   * 停发新券请用「停用」，已领未用券可继续用到过期。
   */
  async deleteTemplate(storeId: string, id: string, operatorId?: string) {
    await this.expireOverdue(storeId);
    const existing = await this.prisma.couponTemplate.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('COUPON_TEMPLATE_NOT_FOUND');

    const usedCount = await this.prisma.coupon.count({
      where: { templateId: existing.id, status: CouponStatus.used },
    });
    if (usedCount > 0) throw new BusinessError('COUPON_TEMPLATE_HAS_USED');

    const unusedCount = await this.prisma.coupon.count({
      where: { templateId: existing.id, status: CouponStatus.unused },
    });
    if (unusedCount > 0) throw new BusinessError('COUPON_TEMPLATE_HAS_CLAIMS');

    await this.prisma.$transaction(async (tx) => {
      // 过期券可清；orders.coupon_id 为 ON DELETE SET NULL，不会卡死
      await tx.coupon.deleteMany({
        where: { templateId: existing.id, status: CouponStatus.expired },
      });
      await tx.couponTemplate.delete({ where: { id: existing.id } });
    });

    await this.audit.log({
      userId: operatorId,
      storeId,
      module: 'marketing',
      action: 'coupon_template.delete',
      targetType: 'coupon_template',
      targetId: id,
      before: { nameZh: existing.nameZh, nameVi: existing.nameVi },
    });
    return { ok: true };
  }

  async issueCoupons(storeId: string, issuerId: string | undefined, dto: IssueCouponDto) {
    const tpl = await this.prisma.couponTemplate.findFirst({
      where: { id: BigInt(dto.templateId), storeId: BigInt(storeId), isActive: true },
    });
    if (!tpl) throw new BusinessError('COUPON_TEMPLATE_NOT_FOUND');
    const customers = await this.prisma.customer.findMany({
      where: {
        id: { in: dto.customerIds.map((id) => BigInt(id)) },
        status: CustomerStatus.active,
      },
    });
    if (!customers.length) throw new BusinessError('CUSTOMER_NOT_FOUND');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + tpl.validDays);

    const created = [];
    for (const c of customers) {
      const code = `C${Date.now().toString(36).toUpperCase()}${randomBytes(2).toString('hex').toUpperCase()}`;
      const row = await this.prisma.coupon.create({
        data: {
          templateId: tpl.id,
          customerId: c.id,
          code,
          expiresAt,
          issuedBy: issuerId ? BigInt(issuerId) : null,
        },
        include: { template: true, customer: true },
      });
      created.push({
        id: row.id.toString(),
        code: row.code,
        status: row.status,
        expiresAt: row.expiresAt.toISOString(),
        customerId: row.customerId.toString(),
        customerName: row.customer.name,
        template: this.mapTemplate(row.template),
      });
      this.events.emit(CUSTOMER_INBOX_MESSAGE, {
        storeId,
        customerId: c.id.toString(),
        content: couponGiftMessage({
          lang: c.lang,
          nameZh: tpl.nameZh,
          nameVi: tpl.nameVi,
          type: tpl.type,
          value: Number(tpl.value),
          minSpend: Number(tpl.minSpend),
          channel: tpl.channel,
          expiresAt: expiresAt.toISOString(),
        }),
      });
    }
    await this.audit.log({
      userId: issuerId,
      storeId,
      module: 'marketing',
      action: 'coupon.issue',
      targetType: 'coupon_template',
      targetId: dto.templateId,
      after: {
        count: created.length,
        customerIds: dto.customerIds,
        codes: created.map((c) => c.code),
      },
    });
    return { count: created.length, list: created };
  }

  async listCoupons(
    storeId: string,
    query: { customerId?: string; templateId?: string; status?: string; take?: number } = {},
  ) {
    await this.expireOverdue(storeId);
    const take = Math.min(Math.max(query.take ?? 200, 1), 500);
    const status =
      query.status === 'unused' || query.status === 'used' || query.status === 'expired'
        ? (query.status as CouponStatus)
        : undefined;
    const rows = await this.prisma.coupon.findMany({
      where: {
        template: { storeId: BigInt(storeId) },
        ...(query.customerId ? { customerId: BigInt(query.customerId) } : {}),
        ...(query.templateId ? { templateId: BigInt(query.templateId) } : {}),
        ...(status ? { status } : {}),
      },
      include: { template: true, customer: { select: { id: true, name: true, email: true, phone: true } } },
      orderBy: { id: 'desc' },
      take,
    });
    return rows.map((r) => ({
      id: r.id.toString(),
      code: r.code,
      status: r.status,
      expiresAt: r.expiresAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      usedOrderId: r.usedOrderId ? r.usedOrderId.toString() : null,
      customerId: r.customerId.toString(),
      customerName: r.customer.name,
      customerEmail: r.customer.email,
      customerPhone: r.customer.phone,
      template: this.mapTemplate(r.template),
    }));
  }

  /** 领取/核销数据分析：汇总 + 分模板 + 近 N 日趋势 */
  async couponAnalytics(storeId: string, days = 30) {
    await this.expireOverdue(storeId);
    const sid = BigInt(storeId);
    const dayCount = Math.min(Math.max(days, 1), 90);
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (dayCount - 1));

    const [templates, groups, claimers, recentClaims, usedCoupons] = await Promise.all([
      this.prisma.couponTemplate.findMany({
        where: { storeId: sid },
        orderBy: { id: 'desc' },
      }),
      this.prisma.coupon.groupBy({
        by: ['templateId', 'status'],
        where: { template: { storeId: sid } },
        _count: true,
      }),
      this.prisma.coupon.findMany({
        where: { template: { storeId: sid } },
        select: { customerId: true },
        distinct: ['customerId'],
      }),
      this.prisma.coupon.findMany({
        where: { template: { storeId: sid }, createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      this.prisma.coupon.findMany({
        where: {
          template: { storeId: sid },
          status: CouponStatus.used,
          updatedAt: { gte: since },
        },
        select: { updatedAt: true },
      }),
    ]);

    const countRows = groups.map((g) => ({
      templateId: g.templateId,
      status: g.status,
      _count: g._count,
    }));

    const byTemplate = templates.map((r) => {
      const stats = this.attachStats(r.id, countRows);
      return {
        id: r.id.toString(),
        nameZh: r.nameZh,
        nameVi: r.nameVi,
        isActive: r.isActive,
        ...stats,
      };
    });

    const summary = byTemplate.reduce(
      (acc, row) => {
        acc.issued += row.issued;
        acc.unused += row.unused;
        acc.used += row.used;
        acc.expired += row.expired;
        return acc;
      },
      { issued: 0, unused: 0, used: 0, expired: 0 },
    );

    const dayKey = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    const dailyMap = new Map<string, { date: string; claimed: number; used: number }>();
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      const key = dayKey(d);
      dailyMap.set(key, { date: key, claimed: 0, used: 0 });
    }
    for (const c of recentClaims) {
      const key = dayKey(c.createdAt);
      const row = dailyMap.get(key);
      if (row) row.claimed += 1;
    }
    for (const c of usedCoupons) {
      const key = dayKey(c.updatedAt);
      const row = dailyMap.get(key);
      if (row) row.used += 1;
    }

    return {
      summary: {
        templateCount: templates.length,
        activeTemplates: templates.filter((t) => t.isActive).length,
        ...summary,
        useRate: summary.issued > 0 ? Math.round((summary.used / summary.issued) * 1000) / 10 : 0,
        uniqueClaimers: claimers.length,
      },
      byTemplate,
      daily: [...dailyMap.values()],
    };
  }

  async myCoupons(customerId: string) {
    const now = new Date();
    await this.prisma.coupon.updateMany({
      where: {
        customerId: BigInt(customerId),
        status: CouponStatus.unused,
        expiresAt: { lt: now },
      },
      data: { status: CouponStatus.expired },
    });
    const rows = await this.prisma.coupon.findMany({
      where: { customerId: BigInt(customerId) },
      include: { template: true },
      orderBy: { id: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id.toString(),
      code: r.code,
      status: r.status,
      expiresAt: r.expiresAt.toISOString(),
      template: this.mapTemplate(r.template),
    }));
  }

  listRules(storeId: string) {
    return this.prisma.promoRule
      .findMany({
        where: { storeId: BigInt(storeId) },
        orderBy: { id: 'desc' },
      })
      .then((rows) => rows.map((r) => this.mapRule(r)));
  }

  async createRule(storeId: string, dto: CreatePromoRuleDto) {
    const row = await this.prisma.promoRule.create({
      data: {
        storeId: BigInt(storeId),
        nameZh: dto.nameZh,
        nameVi: dto.nameVi,
        type: dto.type,
        value: BigInt(dto.value),
        minSpend: BigInt(dto.minSpend ?? 0),
        scope: dto.scope ?? 'order',
        dishIds: dto.dishIds ?? Prisma.JsonNull,
        channel: dto.channel ?? 'all',
      },
    });
    return this.mapRule(row);
  }

  async updateRule(storeId: string, id: string, dto: UpdatePromoRuleDto) {
    const existing = await this.prisma.promoRule.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('PROMO_RULE_NOT_FOUND');
    const row = await this.prisma.promoRule.update({
      where: { id: existing.id },
      data: {
        nameZh: dto.nameZh,
        nameVi: dto.nameVi,
        type: dto.type,
        value: dto.value != null ? BigInt(dto.value) : undefined,
        minSpend: dto.minSpend != null ? BigInt(dto.minSpend) : undefined,
        scope: dto.scope,
        dishIds: dto.dishIds === undefined ? undefined : dto.dishIds ?? Prisma.JsonNull,
        channel: dto.channel,
        isActive: dto.isActive,
      },
    });
    return this.mapRule(row);
  }

  async deleteRule(storeId: string, id: string, operatorId?: string) {
    const existing = await this.prisma.promoRule.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('PROMO_RULE_NOT_FOUND');
    await this.prisma.promoRule.delete({ where: { id: existing.id } });
    await this.audit.log({
      userId: operatorId,
      storeId,
      module: 'marketing',
      action: 'promo_rule.delete',
      targetType: 'promo_rule',
      targetId: id,
      before: { nameZh: existing.nameZh, nameVi: existing.nameVi },
    });
    return { ok: true };
  }

  async activeRulesAsSpecs(storeId: string): Promise<DiscountSpec[]> {
    const rows = await this.prisma.promoRule.findMany({
      where: { storeId: BigInt(storeId), isActive: true },
    });
    return rows.map((r) => ({
      id: r.id.toString(),
      nameZh: r.nameZh,
      nameVi: r.nameVi,
      type: r.type,
      value: Number(r.value),
      minSpend: Number(r.minSpend),
      scope: r.scope,
      dishIds: this.dishIds(r.dishIds),
      channel: r.channel,
    }));
  }

  async couponAsSpec(couponId: string, customerId?: string): Promise<DiscountSpec | null> {
    const row = await this.prisma.coupon.findUnique({
      where: { id: BigInt(couponId) },
      include: { template: true },
    });
    if (!row) return null;
    if (customerId && row.customerId.toString() !== customerId) return null;
    if (row.status !== CouponStatus.unused) return null;
    if (row.expiresAt < new Date()) {
      await this.prisma.coupon.update({
        where: { id: row.id },
        data: { status: CouponStatus.expired },
      });
      return null;
    }
    const t = row.template;
    return {
      id: row.id.toString(),
      nameZh: t.nameZh,
      nameVi: t.nameVi,
      type: t.type,
      value: Number(t.value),
      minSpend: Number(t.minSpend),
      scope: t.scope,
      dishIds: this.dishIds(t.dishIds),
      channel: t.channel,
    };
  }

  async markCouponUsed(tx: Prisma.TransactionClient, couponId: string, orderId: bigint) {
    await tx.coupon.update({
      where: { id: BigInt(couponId) },
      data: {
        status: CouponStatus.used,
        usedOrderId: orderId,
      },
    });
  }
}
