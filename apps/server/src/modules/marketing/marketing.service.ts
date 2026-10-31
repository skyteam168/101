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

  listTemplates(storeId: string) {
    return this.prisma.couponTemplate
      .findMany({
        where: { storeId: BigInt(storeId) },
        orderBy: { id: 'desc' },
      })
      .then((rows) => rows.map((r) => this.mapTemplate(r)));
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

  async listCoupons(storeId: string, customerId?: string) {
    const rows = await this.prisma.coupon.findMany({
      where: {
        template: { storeId: BigInt(storeId) },
        ...(customerId ? { customerId: BigInt(customerId) } : {}),
      },
      include: { template: true, customer: { select: { id: true, name: true, email: true } } },
      orderBy: { id: 'desc' },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id.toString(),
      code: r.code,
      status: r.status,
      expiresAt: r.expiresAt.toISOString(),
      customerId: r.customerId.toString(),
      customerName: r.customer.name,
      customerEmail: r.customer.email,
      template: this.mapTemplate(r.template),
    }));
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
