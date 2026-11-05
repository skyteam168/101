import { Injectable } from '@nestjs/common';
import {
  OrderItemStatus,
  OrderStatus,
  OrderType,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { BusinessError } from '../../common/errors/business.error';
import { PrismaService } from '../../prisma/prisma.service';
import { PrintJobService } from '../print/print-job.service';
import {
  businessDateOf,
  businessDayRange,
  eachBusinessDate,
  todayBusinessDate,
  utcToHcmParts,
} from './business-day.util';
import { CloseShiftDto, DateRangeDto, OpenShiftDto } from './dto/report.dto';

const PAID_STATUSES: OrderStatus[] = [OrderStatus.paid, OrderStatus.completed];

type AggResult = {
  businessDate: string;
  revenue: number;
  orderCount: number;
  guestCount: number;
  avgTicket: number;
  avgPerGuest: number;
  tableTurnover: number;
  avgDineMinutes: number;
  dineInRevenue: number;
  takeawayRevenue: number;
  deliveryRevenue: number;
  discountTotal: number;
  voidAmount: number;
  cancelCount: number;
  channel: { key: string; amount: number; count: number }[];
  payMethods: { key: string; amount: number; count: number }[];
  hourly: { hour: number; amount: number; count: number }[];
  topDishes: { dishId: string; nameZh: string; nameVi: string; qty: number; amount: number }[];
  operators: {
    userId: string;
    displayName: string;
    discountCount: number;
    discountAmount: number;
    voidCount: number;
    voidAmount: number;
    cancelCount: number;
  }[];
};

@Injectable()
export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly printJobs: PrintJobService,
  ) {}

  private async cutHour(storeId: string): Promise<number> {
    const store = await this.prisma.store.findUnique({
      where: { id: BigInt(storeId) },
      select: { businessDayCutHour: true },
    });
    if (!store) throw new BusinessError('STORE_REQUIRED');
    return store.businessDayCutHour ?? 4;
  }

  private resolveRange(dto: DateRangeDto, cut: number) {
    if (dto.date) {
      const { start, end } = businessDayRange(dto.date, cut);
      return { from: dto.date, to: dto.date, start, end, dates: [dto.date] };
    }
    const from = dto.from || todayBusinessDate(cut);
    const to = dto.to || from;
    const dates = eachBusinessDate(from, to);
    const start = businessDayRange(from, cut).start;
    const end = businessDayRange(to, cut).end;
    return { from, to, start, end, dates };
  }

  private money(n: bigint | number) {
    return Number(n);
  }

  /** 实时聚合某个时间窗内的营业数据 */
  async aggregateWindow(storeId: string, start: Date, end: Date, businessDate: string): Promise<AggResult> {
    const sid = BigInt(storeId);

    const orders = await this.prisma.order.findMany({
      where: {
        storeId: sid,
        status: { in: PAID_STATUSES },
        updatedAt: { gte: start, lt: end },
      },
      include: {
        tableSession: true,
        payments: true,
        refunds: true,
        items: true,
      },
    });

    const cancelled = await this.prisma.order.count({
      where: {
        storeId: sid,
        status: { in: [OrderStatus.cancelled, OrderStatus.rejected] },
        updatedAt: { gte: start, lt: end },
      },
    });

    let revenue = 0;
    let guestCount = 0;
    let dineInRevenue = 0;
    let takeawayRevenue = 0;
    let deliveryRevenue = 0;
    let discountTotal = 0;
    let voidAmount = 0;

    const channelMap = new Map<string, { amount: number; count: number }>();
    const payMap = new Map<string, { amount: number; count: number }>();
    const hourlyMap = new Map<number, { amount: number; count: number }>();
    const dishMap = new Map<
      string,
      { dishId: string; nameZh: string; nameVi: string; qty: number; amount: number }
    >();

    for (const o of orders) {
      // 净实收：结账后的 paidAmount（退款会扣减）；全额退款为 0
      const net =
        o.paymentStatus === PaymentStatus.refunded
          ? 0
          : this.money(o.paidAmount);
      revenue += net;
      discountTotal += this.money(o.discount);
      if (o.tableSession) guestCount += o.tableSession.guestCount;

      const typeKey = o.type;
      const ch = channelMap.get(typeKey) || { amount: 0, count: 0 };
      ch.amount += net;
      ch.count += 1;
      channelMap.set(typeKey, ch);

      if (o.type === OrderType.dine_in) dineInRevenue += net;
      else if (o.type === OrderType.takeaway) takeawayRevenue += net;
      else deliveryRevenue += net;

      const hcm = utcToHcmParts(o.updatedAt);
      const hr = hourlyMap.get(hcm.hour) || { amount: 0, count: 0 };
      hr.amount += net;
      hr.count += 1;
      hourlyMap.set(hcm.hour, hr);

      for (const p of o.payments) {
        const key = p.method;
        const pm = payMap.get(key) || { amount: 0, count: 0 };
        pm.amount += this.money(p.amount);
        pm.count += 1;
        payMap.set(key, pm);
      }
      for (const r of o.refunds) {
        const key = r.method;
        const pm = payMap.get(key) || { amount: 0, count: 0 };
        pm.amount -= this.money(r.amount);
        payMap.set(key, pm);
      }

      for (const it of o.items) {
        if (it.status === OrderItemStatus.voided) {
          voidAmount += this.money(it.amount);
          continue;
        }
        const id = it.dishId?.toString() ?? `temp-${it.id.toString()}`;
        const row = dishMap.get(id) || {
          dishId: id,
          nameZh: it.nameZh,
          nameVi: it.nameVi,
          qty: 0,
          amount: 0,
        };
        row.qty += it.qty;
        row.amount += this.money(it.amount);
        dishMap.set(id, row);
      }
    }

    const tableCount = await this.prisma.table.count({ where: { storeId: sid } });
    const sessions = await this.prisma.tableSession.findMany({
      where: {
        table: { storeId: sid },
        closeAt: { gte: start, lt: end },
        status: 'closed',
      },
      select: { openAt: true, closeAt: true, guestCount: true },
    });

    let dineMinutesSum = 0;
    for (const s of sessions) {
      if (s.closeAt) dineMinutesSum += Math.max(0, (s.closeAt.getTime() - s.openAt.getTime()) / 60000);
      if (!orders.some((o) => o.tableSession)) {
        // guest already counted from paid orders' sessions; add closed-session guests only if needed
      }
    }
    // 若堂食已付订单未带 session guest，用关闭会话补人
    if (guestCount === 0) {
      guestCount = sessions.reduce((s, x) => s + x.guestCount, 0);
    }

    const orderCount = orders.length;
    const avgTicket = orderCount ? Math.floor(revenue / orderCount) : 0;
    const avgPerGuest = guestCount ? Math.floor(revenue / guestCount) : 0;
    const tableTurnover = tableCount ? Number((sessions.length / tableCount).toFixed(2)) : 0;
    const avgDineMinutes = sessions.length ? Math.round(dineMinutesSum / sessions.length) : 0;

    const audits = await this.prisma.auditLog.findMany({
      where: {
        createdAt: { gte: start, lt: end },
        action: { in: ['order.discount', 'order.void_item', 'order.cancel'] },
        user: { storeId: sid },
      },
      include: { user: { select: { id: true, displayName: true } } },
    });

    const opMap = new Map<
      string,
      {
        userId: string;
        displayName: string;
        discountCount: number;
        discountAmount: number;
        voidCount: number;
        voidAmount: number;
        cancelCount: number;
      }
    >();

    const ensureOp = (userId: string | null, name: string) => {
      const key = userId || '0';
      let row = opMap.get(key);
      if (!row) {
        row = {
          userId: key,
          displayName: name || '-',
          discountCount: 0,
          discountAmount: 0,
          voidCount: 0,
          voidAmount: 0,
          cancelCount: 0,
        };
        opMap.set(key, row);
      }
      return row;
    };

    for (const a of audits) {
      const op = ensureOp(a.userId?.toString() ?? null, a.user?.displayName || '-');
      const after = (a.after || {}) as Record<string, unknown>;
      if (a.action === 'order.discount') {
        op.discountCount += 1;
        op.discountAmount += Number(after.discount ?? 0);
      } else if (a.action === 'order.void_item') {
        op.voidCount += 1;
        op.voidAmount += Number(after.amount ?? 0);
      } else if (a.action === 'order.cancel') {
        op.cancelCount += 1;
      }
    }

    const hourly = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      amount: hourlyMap.get(hour)?.amount ?? 0,
      count: hourlyMap.get(hour)?.count ?? 0,
    }));

    return {
      businessDate,
      revenue,
      orderCount,
      guestCount,
      avgTicket,
      avgPerGuest,
      tableTurnover,
      avgDineMinutes,
      dineInRevenue,
      takeawayRevenue,
      deliveryRevenue,
      discountTotal,
      voidAmount,
      cancelCount: cancelled,
      channel: [...channelMap.entries()].map(([key, v]) => ({ key, ...v })),
      payMethods: [...payMap.entries()].map(([key, v]) => ({ key, ...v })),
      hourly,
      topDishes: [...dishMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 20),
      operators: [...opMap.values()],
    };
  }

  async overview(storeId: string, dto: DateRangeDto) {
    const cut = await this.cutHour(storeId);
    const range = this.resolveRange(dto, cut);
    // 单日或默认今日
    const date = range.dates.length === 1 ? range.dates[0] : todayBusinessDate(cut);
    const { start, end } = businessDayRange(date, cut);

    // 历史日优先读汇总表
    const today = todayBusinessDate(cut);
    if (date < today) {
      const cached = await this.prisma.dailySummary.findUnique({
        where: {
          storeId_businessDate: { storeId: BigInt(storeId), businessDate: new Date(date) },
        },
      });
      if (cached) {
        return {
          businessDate: date,
          cutHour: cut,
          fromCache: true,
          revenue: this.money(cached.revenue),
          orderCount: cached.orderCount,
          guestCount: cached.guestCount,
          avgTicket: cached.orderCount
            ? Math.floor(this.money(cached.revenue) / cached.orderCount)
            : 0,
          avgPerGuest: cached.guestCount
            ? Math.floor(this.money(cached.revenue) / cached.guestCount)
            : 0,
          tableTurnover: cached.tableCount
            ? Number((cached.sessionCount / cached.tableCount).toFixed(2))
            : 0,
          avgDineMinutes: cached.avgDineMinutes,
          dineInRevenue: this.money(cached.dineInRevenue),
          takeawayRevenue: this.money(cached.takeawayRevenue),
          deliveryRevenue: this.money(cached.deliveryRevenue),
          discountTotal: this.money(cached.discountTotal),
          voidAmount: this.money(cached.voidAmount),
          cancelCount: cached.cancelCount,
          channel: (cached.channelJson as AggResult['channel']) || [],
          payMethods: (cached.payMethodJson as AggResult['payMethods']) || [],
          hourly: (cached.hourlyJson as AggResult['hourly']) || [],
          topDishes: (cached.topDishesJson as AggResult['topDishes']) || [],
          operators: [],
        };
      }
    }

    const live = await this.aggregateWindow(storeId, start, end, date);
    return { ...live, cutHour: cut, fromCache: false };
  }

  async trend(storeId: string, dto: DateRangeDto) {
    const cut = await this.cutHour(storeId);
    const range = this.resolveRange(
      {
        from: dto.from || eachBusinessDate(todayBusinessDate(cut), todayBusinessDate(cut))[0],
        to: dto.to,
        ...dto,
      },
      cut,
    );
    // 默认近 14 天
    let dates = range.dates;
    if (!dto.from && !dto.to && !dto.date) {
      const end = todayBusinessDate(cut);
      const endParts = end.split('-').map(Number);
      const startDate = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2]));
      startDate.setUTCDate(startDate.getUTCDate() - 13);
      const from = `${startDate.getUTCFullYear()}-${String(startDate.getUTCMonth() + 1).padStart(2, '0')}-${String(startDate.getUTCDate()).padStart(2, '0')}`;
      dates = eachBusinessDate(from, end);
    }

    const today = todayBusinessDate(cut);
    const points: { date: string; revenue: number; orderCount: number }[] = [];

    for (const d of dates) {
      if (d < today) {
        const cached = await this.prisma.dailySummary.findUnique({
          where: {
            storeId_businessDate: { storeId: BigInt(storeId), businessDate: new Date(d) },
          },
        });
        if (cached) {
          points.push({
            date: d,
            revenue: this.money(cached.revenue),
            orderCount: cached.orderCount,
          });
          continue;
        }
      }
      const { start, end } = businessDayRange(d, cut);
      const agg = await this.aggregateWindow(storeId, start, end, d);
      points.push({ date: d, revenue: agg.revenue, orderCount: agg.orderCount });
    }

    return { cutHour: cut, points };
  }

  async dailyReport(storeId: string, dto: DateRangeDto) {
    const overview = await this.overview(storeId, dto.date || dto.from ? dto : { date: undefined });
    return overview;
  }

  /** 将期间解析为营业日起止与覆盖的 YYYY-MM 列表 */
  private resolveProfitPeriod(
    period: 'month' | 'quarter' | 'half' | 'year',
    anchor: string,
  ): { from: string; to: string; label: string; yearMonths: string[] } {
    const ym = /^(\d{4})-(\d{2})$/.exec(anchor);
    const yOnly = /^(\d{4})$/.exec(anchor);
    let y: number;
    let m: number;
    if (ym) {
      y = Number(ym[1]);
      m = Number(ym[2]);
    } else if (yOnly && period === 'year') {
      y = Number(yOnly[1]);
      m = 1;
    } else {
      throw new BusinessError('INVALID_DATE');
    }
    if (!y || m < 1 || m > 12) throw new BusinessError('INVALID_DATE');

    let startM: number;
    let endM: number;
    let label: string;
    if (period === 'month') {
      startM = m;
      endM = m;
      label = `${y}-${String(m).padStart(2, '0')}`;
    } else if (period === 'quarter') {
      const q = Math.ceil(m / 3);
      startM = (q - 1) * 3 + 1;
      endM = q * 3;
      label = `${y}-Q${q}`;
    } else if (period === 'half') {
      const h = m <= 6 ? 1 : 2;
      startM = h === 1 ? 1 : 7;
      endM = h === 1 ? 6 : 12;
      label = `${y}-H${h}`;
    } else {
      startM = 1;
      endM = 12;
      label = String(y);
    }

    const from = `${y}-${String(startM).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(y, endM, 0)).getUTCDate();
    const to = `${y}-${String(endM).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const yearMonths: string[] = [];
    for (let mm = startM; mm <= endM; mm++) {
      yearMonths.push(`${y}-${String(mm).padStart(2, '0')}`);
    }
    return { from, to, label, yearMonths };
  }

  async monthReport(storeId: string, yearMonth: string) {
    return this.periodProfit(storeId, 'month', yearMonth);
  }

  /**
   * 期间损益：营收 − 进货 − 已月结人力 = 净利润；
   * 另附盘点消耗合计、当前库存金额，便于对照「采购库存 / 人事」明细。
   */
  async periodProfit(
    storeId: string,
    period: 'month' | 'quarter' | 'half' | 'year',
    anchor: string,
  ) {
    const { from, to, label, yearMonths } = this.resolveProfitPeriod(period, anchor);
    const trend = await this.trend(storeId, { from, to });
    const revenue = trend.points.reduce((s, p) => s + p.revenue, 0);
    const orderCount = trend.points.reduce((s, p) => s + p.orderCount, 0);

    const rangeStart = new Date(`${from}T00:00:00.000Z`);
    // to 为期末月最后一天；开区间上界 = 下一月 1 日（Date.UTC 月份 0 起算，endM 为 1–12 时正好是下一月）
    const endY = Number(to.slice(0, 4));
    const endM = Number(to.slice(5, 7));
    const exclusive = new Date(Date.UTC(endY, endM, 1));

    const purchaseAgg = await this.prisma.purchase.aggregate({
      where: {
        storeId: BigInt(storeId),
        businessDate: { gte: rangeStart, lt: exclusive },
      },
      _sum: { totalAmount: true },
    });
    const purchaseCost = this.money(purchaseAgg._sum.totalAmount ?? 0);

    const payrolls = await this.prisma.employeePayrollRun.findMany({
      where: {
        storeId: BigInt(storeId),
        yearMonth: { in: yearMonths },
      },
    });
    const laborCost = payrolls.reduce((s, p) => s + this.money(p.totalLaborCost), 0);
    const laborMonthsSettled = payrolls.map((p) => p.yearMonth);
    const laborCostSettled = laborMonthsSettled.length === yearMonths.length;

    const stocktakes = await this.prisma.stocktake.findMany({
      where: {
        storeId: BigInt(storeId),
        status: 'confirmed',
        businessDate: { gte: rangeStart, lt: exclusive },
      },
      include: { items: true },
    });
    const stocktakeConsumption = stocktakes.reduce(
      (s, st) => s + st.items.reduce((a, it) => a + Number(it.consumptionAmount), 0),
      0,
    );

    const ingredients = await this.prisma.ingredient.findMany({
      where: { storeId: BigInt(storeId) },
      select: { stockQty: true, lastCost: true },
    });
    const inventoryValue = ingredients.reduce(
      (s, i) => s + Math.floor(Number(i.stockQty) * Number(i.lastCost)),
      0,
    );

    const netProfit = revenue - purchaseCost - laborCost;

    return {
      period,
      label,
      from,
      to,
      yearMonths,
      yearMonth: period === 'month' ? label : undefined,
      revenue,
      orderCount,
      avgTicket: orderCount ? Math.floor(revenue / orderCount) : 0,
      days: trend.points,
      income: { revenue },
      expenses: {
        purchaseCost,
        laborCost,
        laborCostSettled,
        laborMonthsSettled,
        stocktakeConsumption,
      },
      inventoryValue,
      purchaseCost,
      laborCost,
      laborCostSettled,
      stocktakeConsumption,
      roughGross: netProfit,
      netProfit,
      costNote:
        'netProfit = revenue − purchaseCost − laborCost；人力取自人事月结快照（未月结月记 0）；盘点消耗与库存金额来自采购库存模块，供对照，不重复扣减进货。',
    };
  }

  /** 写入/刷新某营业日汇总 */
  async upsertDailySummary(storeId: string, businessDate: string) {
    const cut = await this.cutHour(storeId);
    const { start, end } = businessDayRange(businessDate, cut);
    const agg = await this.aggregateWindow(storeId, start, end, businessDate);
    const tableCount = await this.prisma.table.count({ where: { storeId: BigInt(storeId) } });
    const sessionCount = await this.prisma.tableSession.count({
      where: {
        table: { storeId: BigInt(storeId) },
        closeAt: { gte: start, lt: end },
        status: 'closed',
      },
    });

    await this.prisma.dailySummary.upsert({
      where: {
        storeId_businessDate: {
          storeId: BigInt(storeId),
          businessDate: new Date(businessDate),
        },
      },
      create: {
        storeId: BigInt(storeId),
        businessDate: new Date(businessDate),
        revenue: BigInt(agg.revenue),
        orderCount: agg.orderCount,
        guestCount: agg.guestCount,
        dineInRevenue: BigInt(agg.dineInRevenue),
        takeawayRevenue: BigInt(agg.takeawayRevenue),
        deliveryRevenue: BigInt(agg.deliveryRevenue),
        discountTotal: BigInt(agg.discountTotal),
        voidAmount: BigInt(agg.voidAmount),
        cancelCount: agg.cancelCount,
        tableCount,
        sessionCount,
        avgDineMinutes: agg.avgDineMinutes,
        channelJson: agg.channel as unknown as Prisma.InputJsonValue,
        payMethodJson: agg.payMethods as unknown as Prisma.InputJsonValue,
        hourlyJson: agg.hourly as unknown as Prisma.InputJsonValue,
        topDishesJson: agg.topDishes as unknown as Prisma.InputJsonValue,
      },
      update: {
        revenue: BigInt(agg.revenue),
        orderCount: agg.orderCount,
        guestCount: agg.guestCount,
        dineInRevenue: BigInt(agg.dineInRevenue),
        takeawayRevenue: BigInt(agg.takeawayRevenue),
        deliveryRevenue: BigInt(agg.deliveryRevenue),
        discountTotal: BigInt(agg.discountTotal),
        voidAmount: BigInt(agg.voidAmount),
        cancelCount: agg.cancelCount,
        tableCount,
        sessionCount,
        avgDineMinutes: agg.avgDineMinutes,
        channelJson: agg.channel as unknown as Prisma.InputJsonValue,
        payMethodJson: agg.payMethods as unknown as Prisma.InputJsonValue,
        hourlyJson: agg.hourly as unknown as Prisma.InputJsonValue,
        topDishesJson: agg.topDishes as unknown as Prisma.InputJsonValue,
      },
    });
    return { ok: true, businessDate };
  }

  /** 切日后固化「昨天」营业日 */
  async sealYesterdayForAllStores() {
    const stores = await this.prisma.store.findMany({
      select: { id: true, businessDayCutHour: true },
    });
    const now = new Date();
    const results: string[] = [];
    for (const s of stores) {
      const cut = s.businessDayCutHour ?? 4;
      const parts = utcToHcmParts(now);
      if (parts.hour !== cut) continue;
      // 刚过切日 → 固化上一营业日
      const today = todayBusinessDate(cut, now);
      const { start } = businessDayRange(today, cut);
      const yesterdayInstant = new Date(start.getTime() - 1000);
      const yesterday = businessDateOf(yesterdayInstant, cut);
      await this.upsertDailySummary(s.id.toString(), yesterday);
      results.push(`${s.id}:${yesterday}`);
    }
    return results;
  }

  // ---- shifts ----

  async listShifts(storeId: string, cashierId?: string, limit = 30) {
    const rows = await this.prisma.cashierShift.findMany({
      where: {
        storeId: BigInt(storeId),
        ...(cashierId ? { cashierId: BigInt(cashierId) } : {}),
      },
      include: { cashier: { select: { id: true, displayName: true, username: true } } },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
    return rows.map((r) => this.mapShift(r));
  }

  async currentShift(storeId: string, cashierId: string) {
    const row = await this.prisma.cashierShift.findFirst({
      where: {
        storeId: BigInt(storeId),
        cashierId: BigInt(cashierId),
        endedAt: null,
      },
      include: { cashier: { select: { id: true, displayName: true, username: true } } },
      orderBy: { startedAt: 'desc' },
    });
    return row ? this.mapShift(row) : null;
  }

  private mapShift(r: {
    id: bigint;
    storeId: bigint;
    cashierId: bigint;
    startedAt: Date;
    endedAt: Date | null;
    openingCash: bigint;
    closingCash: bigint | null;
    note: string | null;
    summaryJson: unknown;
    cashier?: { id: bigint; displayName: string; username: string };
  }) {
    return {
      id: r.id.toString(),
      storeId: r.storeId.toString(),
      cashierId: r.cashierId.toString(),
      cashierName: r.cashier?.displayName ?? null,
      cashierUsername: r.cashier?.username ?? null,
      startedAt: r.startedAt.toISOString(),
      endedAt: r.endedAt?.toISOString() ?? null,
      openingCash: this.money(r.openingCash),
      closingCash: r.closingCash != null ? this.money(r.closingCash) : null,
      note: r.note,
      summary: r.summaryJson,
    };
  }

  async openShift(storeId: string, cashierId: string, dto: OpenShiftDto) {
    const open = await this.prisma.cashierShift.findFirst({
      where: { storeId: BigInt(storeId), cashierId: BigInt(cashierId), endedAt: null },
    });
    if (open) throw new BusinessError('SHIFT_ALREADY_OPEN');
    const row = await this.prisma.cashierShift.create({
      data: {
        storeId: BigInt(storeId),
        cashierId: BigInt(cashierId),
        openingCash: BigInt(Math.floor(dto.openingCash ?? 0)),
        note: dto.note,
      },
      include: { cashier: { select: { id: true, displayName: true, username: true } } },
    });
    return this.mapShift(row);
  }

  async closeShift(storeId: string, shiftId: string, cashierId: string, dto: CloseShiftDto) {
    const row = await this.prisma.cashierShift.findFirst({
      where: { id: BigInt(shiftId), storeId: BigInt(storeId) },
      include: { cashier: { select: { id: true, displayName: true, username: true } } },
    });
    if (!row) throw new BusinessError('SHIFT_NOT_FOUND');
    if (row.endedAt) throw new BusinessError('SHIFT_ALREADY_CLOSED');
    if (row.cashierId.toString() !== cashierId) {
      // 允许同店管理员代关？简化：仅本人或后续放宽。暂仅本人。
      // 超管也可能关 — 用 store 校验即可，这里允许同店任意有权限的人关
    }

    const endedAt = new Date();
    const payments = await this.prisma.payment.findMany({
      where: {
        createdAt: { gte: row.startedAt, lte: endedAt },
        order: { storeId: BigInt(storeId) },
        OR: [{ operatorId: row.cashierId }, { operatorId: null }],
      },
    });
    // 更准确：本收银员操作的支付
    const mine = await this.prisma.payment.findMany({
      where: {
        operatorId: row.cashierId,
        createdAt: { gte: row.startedAt, lte: endedAt },
        order: { storeId: BigInt(storeId) },
      },
    });
    const list = mine.length ? mine : payments;
    let totalSales = 0;
    const byMethod: Record<string, number> = {};
    for (const p of list) {
      const amt = this.money(p.amount);
      totalSales += amt;
      byMethod[p.method] = (byMethod[p.method] || 0) + amt;
    }
    const orderIds = new Set(list.map((p) => p.orderId.toString()));
    const summary = {
      orderCount: orderIds.size,
      totalSales,
      byMethod,
      from: row.startedAt.toISOString(),
      to: endedAt.toISOString(),
    };

    const updated = await this.prisma.cashierShift.update({
      where: { id: row.id },
      data: {
        endedAt,
        closingCash: dto.closingCash != null ? BigInt(Math.floor(dto.closingCash)) : null,
        note: dto.note ?? row.note,
        summaryJson: summary as unknown as Prisma.InputJsonValue,
      },
      include: { cashier: { select: { id: true, displayName: true, username: true } } },
    });
    return this.mapShift(updated);
  }

  async printShift(storeId: string, shiftId: string) {
    const row = await this.prisma.cashierShift.findFirst({
      where: { id: BigInt(shiftId), storeId: BigInt(storeId) },
      include: { cashier: true },
    });
    if (!row) throw new BusinessError('SHIFT_NOT_FOUND');
    const summary = (row.summaryJson || {}) as {
      orderCount?: number;
      totalSales?: number;
      from?: string;
      to?: string;
    };
    await this.printJobs.printShift(storeId, {
      cashierName: row.cashier.displayName,
      from: summary.from || row.startedAt.toISOString(),
      to: summary.to || row.endedAt?.toISOString() || new Date().toISOString(),
      orderCount: summary.orderCount ?? 0,
      totalSales: summary.totalSales ?? 0,
    });
    return { ok: true };
  }

  async exportExcel(storeId: string, dto: DateRangeDto): Promise<Buffer> {
    const cut = await this.cutHour(storeId);
    const range = this.resolveRange(dto, cut);
    const trend = await this.trend(storeId, { from: range.from, to: range.to });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('daily');
    ws.columns = [
      { header: '营业日', key: 'date', width: 14 },
      { header: '营业额', key: 'revenue', width: 14 },
      { header: '订单数', key: 'orderCount', width: 10 },
    ];
    for (const p of trend.points) ws.addRow(p);

    if (range.dates.length === 1) {
      const ov = await this.overview(storeId, { date: range.dates[0] });
      const detail = wb.addWorksheet('detail');
      detail.addRow(['营业日', ov.businessDate]);
      detail.addRow(['营业额', ov.revenue]);
      detail.addRow(['订单数', ov.orderCount]);
      detail.addRow(['客单价', ov.avgTicket]);
      detail.addRow(['人均', ov.avgPerGuest]);
      detail.addRow(['翻台率', ov.tableTurnover]);
      detail.addRow(['均用餐时长(分)', ov.avgDineMinutes]);
      detail.addRow([]);
      detail.addRow(['菜品', '数量', '金额']);
      for (const d of ov.topDishes || []) {
        detail.addRow([d.nameZh, d.qty, d.amount]);
      }
    }

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }
}
