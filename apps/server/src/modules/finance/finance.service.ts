import { Injectable } from '@nestjs/common';
import {
  OpsExpenseType,
  PartnerCapitalCategory,
  PartnerCapitalEntryType,
  PartnerCapitalRefType,
  PartnerStatus,
  Prisma,
} from '@prisma/client';
import { BusinessError } from '../../common/errors/business.error';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CapitalEntryQueryDto,
  CreateCapitalEntryDto,
  CreateOpsExpenseDto,
  CreatePartnerDto,
  CreateSettlementDto,
  OpsExpenseQueryDto,
  PartnerQueryDto,
  SettlementQueryDto,
  UpdateCapitalEntryDto,
  UpdateOpsExpenseDto,
  UpdatePartnerDto,
  UpdateSettlementDto,
} from './dto/finance.dto';

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  private money(n: bigint | number) {
    return Number(n);
  }

  private mapExpense(r: {
    id: bigint;
    storeId: bigint;
    yearMonth: string;
    type: OpsExpenseType;
    quantity: Prisma.Decimal | null;
    unit: string | null;
    amount: bigint;
    remark: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: r.id.toString(),
      storeId: r.storeId.toString(),
      yearMonth: r.yearMonth,
      type: r.type,
      quantity: r.quantity != null ? Number(r.quantity) : null,
      unit: r.unit,
      amount: this.money(r.amount),
      remark: r.remark,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  private mapPartner(r: {
    id: bigint;
    storeId: bigint;
    name: string;
    idNumber: string | null;
    address: string | null;
    sharePercent: number;
    investedTotal: bigint;
    status: PartnerStatus;
    remark: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: r.id.toString(),
      storeId: r.storeId.toString(),
      name: r.name,
      idNumber: r.idNumber,
      address: r.address,
      sharePercent: r.sharePercent,
      investedTotal: this.money(r.investedTotal),
      status: r.status,
      remark: r.remark,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  private mapCapitalEntry(r: {
    id: bigint;
    storeId: bigint;
    partnerId: bigint;
    entryDate: Date;
    type: PartnerCapitalEntryType;
    amount: bigint;
    category: PartnerCapitalCategory;
    refType: PartnerCapitalRefType | null;
    refId: bigint | null;
    note: string | null;
    createdBy: bigint | null;
    createdAt: Date;
    updatedAt: Date;
    partner?: { id: bigint; name: string } | null;
  }) {
    return {
      id: r.id.toString(),
      storeId: r.storeId.toString(),
      partnerId: r.partnerId.toString(),
      partnerName: r.partner?.name ?? null,
      entryDate: r.entryDate.toISOString().slice(0, 10),
      type: r.type,
      amount: this.money(r.amount),
      category: r.category,
      refType: r.refType,
      refId: r.refId != null ? r.refId.toString() : null,
      note: r.note,
      createdBy: r.createdBy != null ? r.createdBy.toString() : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  /** 按流水重算并写回 invested_total */
  private async recalcInvestedTotal(
    tx: Prisma.TransactionClient,
    partnerId: bigint,
  ) {
    const rows = await tx.partnerCapitalEntry.findMany({
      where: { partnerId },
      select: { type: true, amount: true },
    });
    let total = 0n;
    for (const r of rows) {
      if (r.type === PartnerCapitalEntryType.decrease) total -= r.amount;
      else total += r.amount;
    }
    if (total < 0n) total = 0n;
    await tx.partner.update({
      where: { id: partnerId },
      data: { investedTotal: total },
    });
    return total;
  }

  private async assertCapitalRef(
    storeId: string,
    refType?: PartnerCapitalRefType,
    refId?: string,
  ) {
    if (!refType && !refId) return;
    if (!refType || !refId) throw new BusinessError('INVALID_CAPITAL_REF');
    const sid = BigInt(storeId);
    const rid = BigInt(refId);
    if (refType === PartnerCapitalRefType.asset) {
      const a = await this.prisma.asset.findFirst({
        where: { id: rid, storeId: sid },
      });
      if (!a) throw new BusinessError('ASSET_NOT_FOUND');
    } else if (refType === PartnerCapitalRefType.asset_event) {
      const e = await this.prisma.assetEvent.findFirst({
        where: { id: rid, asset: { storeId: sid } },
      });
      if (!e) throw new BusinessError('ASSET_EVENT_NOT_FOUND');
    } else if (refType === PartnerCapitalRefType.ops_expense) {
      const o = await this.prisma.opsExpense.findFirst({
        where: { id: rid, storeId: sid },
      });
      if (!o) throw new BusinessError('OPS_EXPENSE_NOT_FOUND');
    }
  }

  private mapSettlement(r: {
    id: bigint;
    storeId: bigint;
    partnerId: bigint;
    settleDate: Date;
    yearMonth: string;
    amount: bigint;
    note: string | null;
    createdAt: Date;
    updatedAt: Date;
    partner?: { id: bigint; name: string } | null;
  }) {
    return {
      id: r.id.toString(),
      storeId: r.storeId.toString(),
      partnerId: r.partnerId.toString(),
      partnerName: r.partner?.name ?? null,
      settleDate: r.settleDate.toISOString().slice(0, 10),
      yearMonth: r.yearMonth,
      amount: this.money(r.amount),
      note: r.note,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  // ---- ops expenses ----

  async listExpenses(storeId: string, query: OpsExpenseQueryDto) {
    const rows = await this.prisma.opsExpense.findMany({
      where: {
        storeId: BigInt(storeId),
        ...(query.yearMonth ? { yearMonth: query.yearMonth } : {}),
        ...(query.type ? { type: query.type } : {}),
      },
      orderBy: [{ yearMonth: 'desc' }, { id: 'desc' }],
      take: 500,
    });
    return rows.map((r) => this.mapExpense(r));
  }

  async createExpense(storeId: string, dto: CreateOpsExpenseDto) {
    if (!/^\d{4}-\d{2}$/.test(dto.yearMonth)) throw new BusinessError('INVALID_DATE');
    const row = await this.prisma.opsExpense.create({
      data: {
        storeId: BigInt(storeId),
        yearMonth: dto.yearMonth,
        type: dto.type,
        quantity: dto.quantity != null ? new Prisma.Decimal(dto.quantity) : null,
        unit: dto.unit,
        amount: BigInt(dto.amount),
        remark: dto.remark,
      },
    });
    return this.mapExpense(row);
  }

  async updateExpense(storeId: string, id: string, dto: UpdateOpsExpenseDto) {
    const existing = await this.prisma.opsExpense.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('OPS_EXPENSE_NOT_FOUND');
    if (dto.yearMonth && !/^\d{4}-\d{2}$/.test(dto.yearMonth)) {
      throw new BusinessError('INVALID_DATE');
    }
    const row = await this.prisma.opsExpense.update({
      where: { id: existing.id },
      data: {
        yearMonth: dto.yearMonth,
        type: dto.type,
        quantity:
          dto.quantity === undefined
            ? undefined
            : dto.quantity == null
              ? null
              : new Prisma.Decimal(dto.quantity),
        unit: dto.unit,
        amount: dto.amount != null ? BigInt(dto.amount) : undefined,
        remark: dto.remark,
      },
    });
    return this.mapExpense(row);
  }

  async deleteExpense(storeId: string, id: string) {
    const existing = await this.prisma.opsExpense.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('OPS_EXPENSE_NOT_FOUND');
    await this.prisma.opsExpense.delete({ where: { id: existing.id } });
    return { ok: true };
  }

  /** 期间运营费用合计（按 yearMonth 列表） */
  async sumExpensesByMonths(storeId: string, yearMonths: string[]) {
    if (!yearMonths.length) return 0;
    const agg = await this.prisma.opsExpense.aggregate({
      where: { storeId: BigInt(storeId), yearMonth: { in: yearMonths } },
      _sum: { amount: true },
    });
    return this.money(agg._sum.amount ?? 0);
  }

  // ---- partners ----

  async listPartners(storeId: string, query: PartnerQueryDto) {
    const rows = await this.prisma.partner.findMany({
      where: {
        storeId: BigInt(storeId),
        ...(query.status ? { status: query.status } : {}),
        ...(query.keyword
          ? {
              OR: [
                { name: { contains: query.keyword } },
                { idNumber: { contains: query.keyword } },
              ],
            }
          : {}),
      },
      orderBy: { id: 'desc' },
      take: 200,
    });
    return rows.map((r) => this.mapPartner(r));
  }

  async createPartner(storeId: string, dto: CreatePartnerDto, operatorId?: string) {
    const row = await this.prisma.$transaction(async (tx) => {
      const partner = await tx.partner.create({
        data: {
          storeId: BigInt(storeId),
          name: dto.name,
          idNumber: dto.idNumber,
          address: dto.address,
          sharePercent: dto.sharePercent ?? 0,
          status: dto.status ?? PartnerStatus.active,
          remark: dto.remark,
          investedTotal: 0,
        },
      });
      if (dto.initialCapital != null && dto.initialCapital > 0) {
        const entryDate = dto.initialCapitalDate
          ? new Date(dto.initialCapitalDate)
          : new Date();
        await tx.partnerCapitalEntry.create({
          data: {
            storeId: BigInt(storeId),
            partnerId: partner.id,
            entryDate,
            type: PartnerCapitalEntryType.initial,
            amount: BigInt(dto.initialCapital),
            category: dto.initialCapitalCategory ?? PartnerCapitalCategory.working_capital,
            note: dto.initialCapitalNote,
            createdBy: operatorId ? BigInt(operatorId) : null,
          },
        });
        await this.recalcInvestedTotal(tx, partner.id);
      }
      return tx.partner.findUniqueOrThrow({ where: { id: partner.id } });
    });
    return this.mapPartner(row);
  }

  async updatePartner(storeId: string, id: string, dto: UpdatePartnerDto) {
    const existing = await this.prisma.partner.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('PARTNER_NOT_FOUND');
    const row = await this.prisma.partner.update({
      where: { id: existing.id },
      data: {
        name: dto.name,
        idNumber: dto.idNumber,
        address: dto.address,
        sharePercent: dto.sharePercent,
        status: dto.status,
        remark: dto.remark,
      },
    });
    return this.mapPartner(row);
  }

  async deletePartner(storeId: string, id: string) {
    const existing = await this.prisma.partner.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('PARTNER_NOT_FOUND');
    await this.prisma.partner.delete({ where: { id: existing.id } });
    return { ok: true };
  }

  // ---- settlements ----

  async listSettlements(storeId: string, query: SettlementQueryDto) {
    const rows = await this.prisma.partnerSettlement.findMany({
      where: {
        storeId: BigInt(storeId),
        ...(query.yearMonth ? { yearMonth: query.yearMonth } : {}),
        ...(query.partnerId ? { partnerId: BigInt(query.partnerId) } : {}),
      },
      include: { partner: { select: { id: true, name: true } } },
      orderBy: [{ settleDate: 'desc' }, { id: 'desc' }],
      take: 500,
    });
    return rows.map((r) => this.mapSettlement(r));
  }

  async createSettlement(storeId: string, dto: CreateSettlementDto) {
    const partner = await this.prisma.partner.findFirst({
      where: { id: BigInt(dto.partnerId), storeId: BigInt(storeId) },
    });
    if (!partner) throw new BusinessError('PARTNER_NOT_FOUND');
    const yearMonth = dto.yearMonth || dto.settleDate.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) throw new BusinessError('INVALID_DATE');
    const row = await this.prisma.partnerSettlement.create({
      data: {
        storeId: BigInt(storeId),
        partnerId: partner.id,
        settleDate: new Date(dto.settleDate),
        yearMonth,
        amount: BigInt(dto.amount),
        note: dto.note,
      },
      include: { partner: { select: { id: true, name: true } } },
    });
    return this.mapSettlement(row);
  }

  async updateSettlement(storeId: string, id: string, dto: UpdateSettlementDto) {
    const existing = await this.prisma.partnerSettlement.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('PARTNER_SETTLEMENT_NOT_FOUND');
    if (dto.partnerId) {
      const partner = await this.prisma.partner.findFirst({
        where: { id: BigInt(dto.partnerId), storeId: BigInt(storeId) },
      });
      if (!partner) throw new BusinessError('PARTNER_NOT_FOUND');
    }
    const yearMonth =
      dto.yearMonth ||
      (dto.settleDate ? dto.settleDate.slice(0, 7) : undefined);
    if (yearMonth && !/^\d{4}-\d{2}$/.test(yearMonth)) {
      throw new BusinessError('INVALID_DATE');
    }
    const row = await this.prisma.partnerSettlement.update({
      where: { id: existing.id },
      data: {
        partnerId: dto.partnerId ? BigInt(dto.partnerId) : undefined,
        settleDate: dto.settleDate ? new Date(dto.settleDate) : undefined,
        yearMonth,
        amount: dto.amount != null ? BigInt(dto.amount) : undefined,
        note: dto.note,
      },
      include: { partner: { select: { id: true, name: true } } },
    });
    return this.mapSettlement(row);
  }

  async deleteSettlement(storeId: string, id: string) {
    const existing = await this.prisma.partnerSettlement.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('PARTNER_SETTLEMENT_NOT_FOUND');
    await this.prisma.partnerSettlement.delete({ where: { id: existing.id } });
    return { ok: true };
  }

  async sumSettlementsByMonths(storeId: string, yearMonths: string[]) {
    if (!yearMonths.length) return 0;
    const agg = await this.prisma.partnerSettlement.aggregate({
      where: { storeId: BigInt(storeId), yearMonth: { in: yearMonths } },
      _sum: { amount: true },
    });
    return this.money(agg._sum.amount ?? 0);
  }

  /**
   * 月度合伙人汇总：营收 − 成本 − 结算 = 剩余
   * costs = 进货 + 人力 + 运营费用
   */
  async monthlyPartnerSummary(
    storeId: string,
    yearMonth: string,
    revenue: number,
    purchaseCost: number,
    laborCost: number,
  ) {
    const opsExpense = await this.sumExpensesByMonths(storeId, [yearMonth]);
    const settlements = await this.sumSettlementsByMonths(storeId, [yearMonth]);
    const costs = purchaseCost + laborCost + opsExpense;
    const remaining = revenue - costs - settlements;
    const settlementRows = await this.listSettlements(storeId, { yearMonth });
    return {
      yearMonth,
      revenue,
      purchaseCost,
      laborCost,
      opsExpense,
      costs,
      settlements,
      remaining,
      settlementRows,
    };
  }

  // ---- capital entries ----

  async listCapitalEntries(storeId: string, query: CapitalEntryQueryDto) {
    const rows = await this.prisma.partnerCapitalEntry.findMany({
      where: {
        storeId: BigInt(storeId),
        ...(query.partnerId ? { partnerId: BigInt(query.partnerId) } : {}),
      },
      include: { partner: { select: { id: true, name: true } } },
      orderBy: [{ entryDate: 'desc' }, { id: 'desc' }],
      take: 500,
    });
    return rows.map((r) => this.mapCapitalEntry(r));
  }

  async createCapitalEntry(
    storeId: string,
    dto: CreateCapitalEntryDto,
    operatorId?: string,
  ) {
    const partner = await this.prisma.partner.findFirst({
      where: { id: BigInt(dto.partnerId), storeId: BigInt(storeId) },
    });
    if (!partner) throw new BusinessError('PARTNER_NOT_FOUND');
    await this.assertCapitalRef(storeId, dto.refType, dto.refId);

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.partnerCapitalEntry.create({
        data: {
          storeId: BigInt(storeId),
          partnerId: partner.id,
          entryDate: new Date(dto.entryDate),
          type: dto.type,
          amount: BigInt(dto.amount),
          category: dto.category ?? PartnerCapitalCategory.other,
          refType: dto.refType ?? null,
          refId: dto.refId ? BigInt(dto.refId) : null,
          note: dto.note,
          createdBy: operatorId ? BigInt(operatorId) : null,
        },
        include: { partner: { select: { id: true, name: true } } },
      });
      await this.recalcInvestedTotal(tx, partner.id);
      return created;
    });
    return this.mapCapitalEntry(row);
  }

  async updateCapitalEntry(
    storeId: string,
    id: string,
    dto: UpdateCapitalEntryDto,
  ) {
    const existing = await this.prisma.partnerCapitalEntry.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('PARTNER_CAPITAL_NOT_FOUND');

    const partnerId = dto.partnerId ? BigInt(dto.partnerId) : existing.partnerId;
    if (dto.partnerId) {
      const partner = await this.prisma.partner.findFirst({
        where: { id: partnerId, storeId: BigInt(storeId) },
      });
      if (!partner) throw new BusinessError('PARTNER_NOT_FOUND');
    }
    const refType = dto.refType !== undefined ? dto.refType : existing.refType ?? undefined;
    const refId =
      dto.refId !== undefined
        ? dto.refId || undefined
        : existing.refId != null
          ? existing.refId.toString()
          : undefined;
    await this.assertCapitalRef(storeId, refType, refId);

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.partnerCapitalEntry.update({
        where: { id: existing.id },
        data: {
          partnerId: dto.partnerId ? BigInt(dto.partnerId) : undefined,
          entryDate: dto.entryDate ? new Date(dto.entryDate) : undefined,
          type: dto.type,
          amount: dto.amount != null ? BigInt(dto.amount) : undefined,
          category: dto.category,
          refType: dto.refType === undefined ? undefined : dto.refType ?? null,
          refId:
            dto.refId === undefined
              ? undefined
              : dto.refId
                ? BigInt(dto.refId)
                : null,
          note: dto.note,
        },
        include: { partner: { select: { id: true, name: true } } },
      });
      await this.recalcInvestedTotal(tx, updated.partnerId);
      if (existing.partnerId !== updated.partnerId) {
        await this.recalcInvestedTotal(tx, existing.partnerId);
      }
      return updated;
    });
    return this.mapCapitalEntry(row);
  }

  async deleteCapitalEntry(storeId: string, id: string) {
    const existing = await this.prisma.partnerCapitalEntry.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('PARTNER_CAPITAL_NOT_FOUND');
    await this.prisma.$transaction(async (tx) => {
      await tx.partnerCapitalEntry.delete({ where: { id: existing.id } });
      await this.recalcInvestedTotal(tx, existing.partnerId);
    });
    return { ok: true };
  }

  /** 合伙人台账：出资流水 + 分红 + 双口径盈亏 */
  async partnerLedger(storeId: string, partnerId: string) {
    const partner = await this.prisma.partner.findFirst({
      where: { id: BigInt(partnerId), storeId: BigInt(storeId) },
    });
    if (!partner) throw new BusinessError('PARTNER_NOT_FOUND');

    const [entries, settlements, recon] = await Promise.all([
      this.listCapitalEntries(storeId, { partnerId }),
      this.listSettlements(storeId, { partnerId }),
      this.capitalRecon(storeId),
    ]);

    const invested = this.money(partner.investedTotal);
    const dividends = settlements.reduce((s, x) => s + x.amount, 0);
    const cashRoi = dividends - invested;
    const equityShare = Math.floor(
      (recon.storeEquityApprox * partner.sharePercent) / 10000,
    );
    const equityGap = equityShare - invested;

    return {
      partner: this.mapPartner(partner),
      capitalEntries: entries,
      settlements,
      invested,
      dividends,
      cashRoi,
      equityShare,
      equityGap,
      storeEquityApprox: recon.storeEquityApprox,
      note:
        'cashRoi = 累计分红 − 累计出资；equityShare = 门店权益粗算 × 分成比例（仅参考）',
    };
  }

  /**
   * 门店级出资对账：
   * gap = totalCapital − (assetBook + inventoryValue + capitalLinkedOpsExpense)
   */
  async capitalRecon(storeId: string) {
    const sid = BigInt(storeId);
    const partners = await this.prisma.partner.findMany({
      where: { storeId: sid },
      select: { id: true, name: true, investedTotal: true, sharePercent: true },
    });
    const totalCapital = partners.reduce(
      (s, p) => s + this.money(p.investedTotal),
      0,
    );

    const assets = await this.prisma.asset.findMany({
      where: { storeId: sid },
      select: { unitPrice: true, qtyTotal: true, qtyDisposed: true },
    });
    const assetBook = assets.reduce((s, a) => {
      const qty = Math.max(0, a.qtyTotal - a.qtyDisposed);
      return s + this.money(a.unitPrice) * qty;
    }, 0);

    const ingredients = await this.prisma.ingredient.findMany({
      where: { storeId: sid },
      select: { stockQty: true, lastCost: true },
    });
    const inventoryValue = ingredients.reduce(
      (s, i) => s + Math.floor(Number(i.stockQty) * Number(i.lastCost)),
      0,
    );

    const linked = await this.prisma.partnerCapitalEntry.findMany({
      where: {
        storeId: sid,
        refType: PartnerCapitalRefType.ops_expense,
        refId: { not: null },
      },
      select: { refId: true, amount: true, type: true },
    });
    const linkedExpenseIds = [
      ...new Set(
        linked.filter((x) => x.refId != null).map((x) => x.refId!.toString()),
      ),
    ];
    let capitalLinkedOpsExpense = 0;
    if (linkedExpenseIds.length) {
      const expenses = await this.prisma.opsExpense.findMany({
        where: {
          storeId: sid,
          id: { in: linkedExpenseIds.map((id) => BigInt(id)) },
        },
        select: { amount: true },
      });
      capitalLinkedOpsExpense = expenses.reduce(
        (s, e) => s + this.money(e.amount),
        0,
      );
    }

    const settlementAgg = await this.prisma.partnerSettlement.aggregate({
      where: { storeId: sid },
      _sum: { amount: true },
    });
    const totalDividends = this.money(settlementAgg._sum.amount ?? 0);

    // 粗算权益：资产账面 + 库存（不含完整损益累加，避免跨月复杂依赖）
    const storeEquityApprox = assetBook + inventoryValue;
    const covered = assetBook + inventoryValue + capitalLinkedOpsExpense;
    const gap = totalCapital - covered;

    return {
      totalCapital,
      assetBook,
      inventoryValue,
      capitalLinkedOpsExpense,
      covered,
      gap,
      totalDividends,
      storeEquityApprox,
      partners: partners.map((p) => {
        const invested = this.money(p.investedTotal);
        return {
          id: p.id.toString(),
          name: p.name,
          sharePercent: p.sharePercent,
          invested,
          equityShare: Math.floor((storeEquityApprox * p.sharePercent) / 10000),
        };
      }),
      note:
        'gap = 累计出资 − (资产账面 + 原料库存 + 已挂出资的运营费用)；日常采购不强制硬挂，差额需人工解释',
    };
  }

  /** 列表附带累计分红与现金回报，便于合伙人表展示 */
  async listPartnersWithRoi(storeId: string, query: PartnerQueryDto) {
    const partners = await this.listPartners(storeId, query);
    if (!partners.length) return [];
    const ids = partners.map((p) => BigInt(p.id));
    const settlements = await this.prisma.partnerSettlement.groupBy({
      by: ['partnerId'],
      where: { storeId: BigInt(storeId), partnerId: { in: ids } },
      _sum: { amount: true },
    });
    const divMap = new Map(
      settlements.map((s) => [s.partnerId.toString(), this.money(s._sum.amount ?? 0)]),
    );
    const recon = await this.capitalRecon(storeId);
    return partners.map((p) => {
      const dividends = divMap.get(p.id) ?? 0;
      const cashRoi = dividends - p.investedTotal;
      const equityShare = Math.floor(
        (recon.storeEquityApprox * p.sharePercent) / 10000,
      );
      return {
        ...p,
        dividends,
        cashRoi,
        equityShare,
        equityGap: equityShare - p.investedTotal,
      };
    });
  }
}
