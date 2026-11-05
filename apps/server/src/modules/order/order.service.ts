import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BatchPrintStatus,
  CustomerStatus,
  OrderItemStatus,
  OrderSource,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  SessionStatus,
  TableStatus,
} from '@prisma/client';
import { Events } from '@restaurant/shared';
import { BusinessError } from '../../common/errors/business.error';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ComboService } from '../combo/combo.service';
import { InventoryService } from '../inventory/inventory.service';
import { MarketingService } from '../marketing/marketing.service';
import { computePricing } from '../marketing/pricing.util';
import { AddComboItemDto } from '../combo/dto/combo.dto';
import {
  AddItemsDto,
  BindCustomerDto,
  CancelOrderDto,
  CheckoutDto,
  DiscountDto,
  LineDiscountDto,
  OrderQueryDto,
  RefundDto,
  SubmitOrderDto,
  TempItemDto,
  UpdateItemStatusDto,
  VoidItemDto,
} from './dto/order.dto';

type Tx = Prisma.TransactionClient;

export type AmountInput = {
  items: { amount: bigint | number; status: string; isGift?: boolean }[];
  discount: bigint | number;
  serviceCharge: bigint | number;
  deliveryFee?: bigint | number;
  roundOff?: bigint | number;
};

type PromoSnap = {
  rules?: { id: string; nameZh: string; amount: number }[];
  coupon?: { id: string; nameZh: string; amount: number } | null;
  memberPercent?: number;
  manualDiscount?: number;
};

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly audit: AuditService,
    private readonly marketing: MarketingService,
    private readonly comboService: ComboService,
    private readonly inventory: InventoryService,
  ) {}

  /** 后端金额重算：不信任前端（兼容旧调用） */
  calculateAmounts(input: AmountInput) {
    const subtotal = input.items
      .filter((i) => i.status !== OrderItemStatus.voided && i.status !== 'voided')
      .reduce((sum, i) => sum + (i.isGift ? 0n : BigInt(i.amount)), 0n);
    const discount = BigInt(input.discount ?? 0);
    const roundOff = BigInt(input.roundOff ?? 0);
    const serviceCharge = BigInt(input.serviceCharge ?? 0);
    const deliveryFee = BigInt(input.deliveryFee ?? 0);
    const clampedDiscount = discount > subtotal ? subtotal : discount;
    const afterDisc = subtotal - clampedDiscount;
    const clampedRound = roundOff > afterDisc ? afterDisc : roundOff;
    const total = afterDisc - clampedRound + serviceCharge + deliveryFee;
    return {
      subtotal,
      discount: clampedDiscount,
      roundOff: clampedRound,
      serviceCharge,
      deliveryFee,
      total: total < 0n ? 0n : total,
    };
  }

  private orderNo() {
    const d = new Date();
    const pad = (n: number, l = 2) => String(n).padStart(l, '0');
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const rnd = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
    return `D${stamp}${rnd}`;
  }

  private mapMoney(n: bigint) {
    return Number(n);
  }

  private mapItem(it: {
    id: bigint;
    batchId?: bigint;
    dishId: bigint | null;
    nameZh: string;
    nameVi: string;
    originUnitPrice?: bigint;
    unitPrice: bigint;
    qty: number;
    lineDiscount?: bigint;
    isGift?: boolean;
    amount: bigint;
    status: string;
    voidReason: string | null;
    optionsSnapshot?: unknown;
    guestNickname?: string | null;
  }) {
    return {
      id: it.id.toString(),
      batchId: it.batchId?.toString(),
      dishId: it.dishId?.toString() ?? null,
      nameZh: it.nameZh,
      nameVi: it.nameVi,
      originUnitPrice: this.mapMoney(it.originUnitPrice ?? it.unitPrice),
      unitPrice: this.mapMoney(it.unitPrice),
      qty: it.qty,
      lineDiscount: this.mapMoney(it.lineDiscount ?? 0n),
      isGift: !!it.isGift,
      amount: this.mapMoney(it.amount),
      status: it.status,
      voidReason: it.voidReason,
      optionsSnapshot: it.optionsSnapshot,
      guestNickname: it.guestNickname,
    };
  }

  private mapOrder(
    o: Prisma.OrderGetPayload<{
      include: {
        batches: { include: { items: true } };
        items: true;
        payments: true;
        refunds: true;
        tableSession: { include: { table: true } };
      };
    }>,
  ) {
    const batches = [...o.batches].sort((a, b) => a.roundNo - b.roundNo);
    const refunds = [...(o.refunds ?? [])].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const refundedAmount = refunds.reduce((s, r) => s + Number(r.amount), 0);
    return {
      id: o.id.toString(),
      orderNo: o.orderNo,
      type: o.type,
      source: o.source,
      status: o.status,
      paymentStatus: o.paymentStatus,
      tableSessionId: o.tableSessionId?.toString() ?? null,
      tableCode: o.tableSession?.table?.code ?? null,
      tableId: o.tableSession?.table?.id?.toString() ?? null,
      guestCount: o.tableSession?.guestCount ?? null,
      remark: o.remark,
      cancelReason: o.cancelReason,
      customerId: o.customerId?.toString() ?? null,
      couponId: o.couponId?.toString() ?? null,
      subtotal: this.mapMoney(o.subtotal),
      discount: this.mapMoney(o.discount),
      roundOff: this.mapMoney(o.roundOff),
      serviceCharge: this.mapMoney(o.serviceCharge),
      deliveryFee: this.mapMoney(o.deliveryFee),
      total: this.mapMoney(o.total),
      paidAmount: this.mapMoney(o.paidAmount),
      refundedAmount,
      promoSnapshot: o.promoSnapshot,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      batches: batches.map((b) => ({
        id: b.id.toString(),
        roundNo: b.roundNo,
        source: b.source,
        guestNickname: b.guestNickname,
        printStatus: b.printStatus,
        createdAt: b.createdAt,
        items: b.items.map((it) => this.mapItem(it)),
      })),
      items: o.items.map((it) => this.mapItem(it)),
      payments: o.payments.map((p) => ({
        id: p.id.toString(),
        method: p.method,
        amount: this.mapMoney(p.amount),
        received: this.mapMoney(p.received),
        change: this.mapMoney(p.change),
        createdAt: p.createdAt,
      })),
      refunds: refunds.map((r) => ({
        id: r.id.toString(),
        method: r.method,
        amount: this.mapMoney(r.amount),
        reason: r.reason,
        operatorId: r.operatorId?.toString() ?? null,
        createdAt: r.createdAt,
      })),
    };
  }

  private orderFullInclude() {
    return {
      batches: { include: { items: true } },
      items: true,
      payments: true,
      refunds: true,
      tableSession: { include: { table: true } },
    } as const;
  }

  private async getOrderFull(orderId: bigint) {
    return this.prisma.order.findUnique({
      where: { id: orderId },
      include: this.orderFullInclude(),
    });
  }

  private readManualDiscount(snap: unknown): number {
    const s = (snap || {}) as PromoSnap;
    return Math.max(0, Number(s.manualDiscount ?? 0));
  }

  private readCouponSnap(snap: unknown): PromoSnap['coupon'] {
    const s = (snap || {}) as PromoSnap;
    return s.coupon ?? null;
  }

  async recalculateOrder(tx: Tx, orderId: bigint) {
    const items = await tx.orderItem.findMany({ where: { orderId } });
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { customer: { include: { memberLevel: true } } },
    });
    const rules = await this.marketing.activeRulesAsSpecs(order.storeId.toString());
    const couponSpec = order.couponId
      ? await this.marketing.couponAsSpec(
          order.couponId.toString(),
          order.customerId?.toString(),
        )
      : null;
    const channel =
      order.type === OrderType.delivery
        ? 'delivery'
        : order.type === OrderType.takeaway
          ? 'takeaway'
          : 'dine_in';
    const n = (v: unknown) => {
      const x = Number(v ?? 0);
      return Number.isFinite(x) ? x : 0;
    };
    const priced = computePricing({
      lines: items.map((i) => ({
        dishId: i.dishId?.toString() ?? null,
        amount: n(i.amount),
        status: i.status,
        isGift: i.isGift,
      })),
      channel,
      rules,
      coupon: couponSpec,
      manualDiscount: this.readManualDiscount(order.promoSnapshot),
      roundOff: n(order.roundOff),
      serviceCharge: n(order.serviceCharge),
      deliveryFee: n(order.deliveryFee),
      memberPercent: order.customer?.memberLevel?.discountPercent ?? 0,
    });
    return tx.order.update({
      where: { id: orderId },
      data: {
        subtotal: BigInt(priced.subtotal),
        discount: BigInt(priced.discount),
        roundOff: BigInt(priced.roundOff),
        total: BigInt(priced.total),
        promoSnapshot: {
          ...priced.snapshot,
          manualDiscount: this.readManualDiscount(order.promoSnapshot),
        },
      },
    });
  }

  /**
   * 事务内条件扣库存。stock 为 null 表示不限；dailyStock 通过 soldToday 限制。
   * 不足抛出 DISH_SOLD_OUT。
   */
  async deductStock(tx: Tx, dishId: bigint, qty: number) {
    const dish = await tx.dish.findUnique({ where: { id: dishId } });
    if (!dish || dish.status !== 'on' || !dish.isDineIn) {
      throw new BusinessError('DISH_NOT_AVAILABLE');
    }

    if (dish.dailyStock != null) {
      const remainDaily = dish.dailyStock - dish.soldToday;
      if (remainDaily < qty) throw new BusinessError('DISH_SOLD_OUT');
    }

    if (dish.stock != null) {
      const updated = await tx.dish.updateMany({
        where: { id: dishId, stock: { gte: qty } },
        data: {
          stock: { decrement: qty },
          soldToday: { increment: qty },
        },
      });
      if (updated.count === 0) throw new BusinessError('DISH_SOLD_OUT');
      return;
    }

    await tx.dish.update({
      where: { id: dishId },
      data: { soldToday: { increment: qty } },
    });
  }

  async restoreStock(tx: Tx, dishId: bigint | null, qty: number) {
    if (dishId == null) return;
    const dish = await tx.dish.findUnique({ where: { id: dishId } });
    if (!dish) return;
    await tx.dish.update({
      where: { id: dishId },
      data: {
        ...(dish.stock != null ? { stock: { increment: qty } } : {}),
        soldToday: { decrement: Math.min(qty, dish.soldToday) },
      },
    });
  }

  private async resolveLines(
    tx: Tx,
    storeId: bigint,
    items: SubmitOrderDto['items'],
  ) {
    const lines: Array<{
      dishId: bigint;
      nameZh: string;
      nameVi: string;
      unitPrice: bigint;
      qty: number;
      amount: bigint;
      optionsSnapshot: Prisma.InputJsonValue | typeof Prisma.JsonNull;
      guestNickname?: string;
    }> = [];

    for (const raw of items) {
      const dish = await tx.dish.findFirst({
        where: { id: BigInt(raw.dishId), storeId },
      });
      if (!dish || dish.status !== 'on' || !dish.isDineIn) {
        throw new BusinessError('DISH_NOT_AVAILABLE');
      }
      let extra = 0n;
      if (Array.isArray(raw.optionsSnapshot)) {
        for (const opt of raw.optionsSnapshot as Array<{ extraPrice?: number }>) {
          extra += BigInt(opt.extraPrice ?? 0);
        }
      }
      const unitPrice = dish.price + extra;
      const qty = raw.qty;
      lines.push({
        dishId: dish.id,
        nameZh: dish.nameZh,
        nameVi: dish.nameVi,
        unitPrice,
        qty,
        amount: unitPrice * BigInt(qty),
        optionsSnapshot:
          raw.optionsSnapshot === undefined
            ? Prisma.JsonNull
            : (raw.optionsSnapshot as Prisma.InputJsonValue),
        guestNickname: raw.guestNickname,
      });
    }
    return lines;
  }

  /** 开台后首次下单，或会话已有 open 单则转为加菜 */
  async submit(storeId: string, dto: SubmitOrderDto, userId: string) {
    const sid = BigInt(storeId);
    const table = await this.prisma.table.findFirst({
      where: { id: BigInt(dto.tableId), storeId: sid },
      include: {
        currentSession: {
          include: { orders: { where: { status: OrderStatus.open } } },
        },
      },
    });
    if (!table) throw new BusinessError('TABLE_NOT_FOUND');
    if (table.status !== TableStatus.dining || !table.currentSessionId || !table.currentSession) {
      throw new BusinessError('TABLE_NOT_DINING');
    }

    const existing = table.currentSession.orders[0];
    if (existing) {
      return this.addItems(storeId, existing.id.toString(), { items: dto.items }, userId);
    }

    const orderId = await this.prisma.$transaction(async (tx) => {
      const lines = await this.resolveLines(tx, sid, dto.items);
      for (const line of lines) {
        await this.deductStock(tx, line.dishId, line.qty);
      }

      const amounts = this.calculateAmounts({
        items: lines.map((l) => ({ amount: l.amount, status: 'pending' })),
        discount: 0,
        serviceCharge: 0,
      });

      const order = await tx.order.create({
        data: {
          storeId: sid,
          orderNo: this.orderNo(),
          type: OrderType.dine_in,
          source: OrderSource.waiter,
          tableSessionId: table.currentSessionId,
          status: OrderStatus.open,
          subtotal: amounts.subtotal,
          discount: 0n,
          serviceCharge: 0n,
          total: amounts.total,
          remark: dto.remark,
          createdBy: BigInt(userId),
        },
      });

      const batch = await tx.orderBatch.create({
        data: {
          orderId: order.id,
          roundNo: 1,
          source: OrderSource.waiter,
          createdBy: BigInt(userId),
        },
      });

      for (const line of lines) {
        await tx.orderItem.create({
          data: {
            orderId: order.id,
            batchId: batch.id,
            dishId: line.dishId,
            nameZh: line.nameZh,
            nameVi: line.nameVi,
            originUnitPrice: line.unitPrice,
            unitPrice: line.unitPrice,
            qty: line.qty,
            amount: line.amount,
            optionsSnapshot: line.optionsSnapshot,
            guestNickname: line.guestNickname,
            status: OrderItemStatus.pending,
          },
        });
        await this.inventory.consumeRecipe(tx, sid, line.dishId, line.qty, {
          refType: 'order',
          refId: order.id.toString(),
        });
      }

      return order.id;
    });

    const full = await this.getOrderFull(orderId);
    const mapped = this.mapOrder(full!);
    this.events.emit(Events.ORDER_CREATED, {
      storeId,
      order: mapped,
      sessionId: mapped.tableSessionId,
    });
    this.events.emit(Events.ORDER_BATCH_ADDED, {
      storeId,
      orderId: mapped.id,
      sessionId: mapped.tableSessionId,
      roundNo: 1,
      batch: mapped.batches[0],
      order: mapped,
    });
    this.events.emit(Events.TABLE_STATUS_CHANGED, { storeId, tableId: mapped.tableId });
    return mapped;
  }

  async addItems(storeId: string, orderId: string, dto: AddItemsDto, userId: string) {
    const sid = BigInt(storeId);
    const oid = BigInt(orderId);

    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: oid, storeId: sid },
        include: { batches: { orderBy: { roundNo: 'desc' }, take: 1 } },
      });
      if (!order) throw new BusinessError('ORDER_NOT_FOUND');
      if (order.status !== OrderStatus.open) throw new BusinessError('ORDER_NOT_OPEN');

      const lines = await this.resolveLines(tx, sid, dto.items);
      for (const line of lines) {
        await this.deductStock(tx, line.dishId, line.qty);
      }

      const nextRound = (order.batches[0]?.roundNo ?? 0) + 1;
      const batch = await tx.orderBatch.create({
        data: {
          orderId: oid,
          roundNo: nextRound,
          source: OrderSource.waiter,
          createdBy: BigInt(userId),
        },
      });

      for (const line of lines) {
        await this.inventory.consumeRecipe(tx, sid, line.dishId, line.qty, {
          refType: 'order',
          refId: oid.toString(),
        });
        await tx.orderItem.create({
          data: {
            orderId: oid,
            batchId: batch.id,
            dishId: line.dishId,
            nameZh: line.nameZh,
            nameVi: line.nameVi,
            originUnitPrice: line.unitPrice,
            unitPrice: line.unitPrice,
            qty: line.qty,
            amount: line.amount,
            optionsSnapshot: line.optionsSnapshot,
            guestNickname: line.guestNickname,
            status: OrderItemStatus.pending,
          },
        });
      }

      await this.recalculateOrder(tx, oid);
    });

    const full = await this.getOrderFull(oid);
    const mapped = this.mapOrder(full!);
    const lastBatch = mapped.batches[mapped.batches.length - 1];
    this.events.emit(Events.ORDER_BATCH_ADDED, {
      storeId,
      orderId: mapped.id,
      sessionId: mapped.tableSessionId,
      roundNo: lastBatch?.roundNo,
      batch: lastBatch,
      tableCode: mapped.tableCode,
      order: mapped,
    });
    this.events.emit(Events.TABLE_STATUS_CHANGED, { storeId, tableId: mapped.tableId });
    return mapped;
  }

  async voidItem(storeId: string, itemId: string, dto: VoidItemDto, userId: string) {
    const iid = BigInt(itemId);
    const orderId = await this.prisma.$transaction(async (tx) => {
      const item = await tx.orderItem.findUnique({
        where: { id: iid },
        include: { order: true },
      });
      if (!item || item.order.storeId !== BigInt(storeId)) {
        throw new BusinessError('ORDER_ITEM_NOT_FOUND');
      }
      if (item.order.status !== OrderStatus.open) throw new BusinessError('ORDER_NOT_OPEN');
      if (item.status === OrderItemStatus.voided) throw new BusinessError('ORDER_ITEM_VOIDED');

      await tx.orderItem.update({
        where: { id: iid },
        data: { status: OrderItemStatus.voided, voidReason: dto.reason },
      });
      await this.restoreStock(tx, item.dishId, item.qty);
      await this.inventory.restoreRecipe(tx, item.order.storeId, item.dishId, item.qty, {
        refType: 'order_item',
        refId: itemId,
      });
      await this.recalculateOrder(tx, item.orderId);
      return item.orderId;
    });

    const full = await this.getOrderFull(orderId);
    const mapped = this.mapOrder(full!);
    const voided = mapped.items.find((i) => i.id === itemId) || mapped.batches.flatMap((b) => b.items).find((i) => i.id === itemId);
    await this.audit.log({
      userId,
      action: 'order.void_item',
      targetType: 'order_item',
      targetId: itemId,
      after: { amount: voided?.amount ?? 0, reason: dto.reason, orderId: mapped.id },
    });
    this.events.emit(Events.ORDER_ITEM_VOIDED, {
      storeId,
      orderId: mapped.id,
      itemId,
      reason: dto.reason,
      userId,
      order: mapped,
      item: voided,
    });
    return mapped;
  }

  async cancel(storeId: string, orderId: string, dto: CancelOrderDto, userId: string) {
    const oid = BigInt(orderId);
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: oid, storeId: BigInt(storeId) },
        include: { items: true, tableSession: { include: { table: true } } },
      });
      if (!order) throw new BusinessError('ORDER_NOT_FOUND');
      if (order.status !== OrderStatus.open) throw new BusinessError('ORDER_NOT_OPEN');

      for (const item of order.items) {
        if (item.status !== OrderItemStatus.voided) {
          await this.restoreStock(tx, item.dishId, item.qty);
          await this.inventory.restoreRecipe(tx, order.storeId, item.dishId, item.qty, {
            refType: 'order_item',
            refId: item.id.toString(),
          });
          await tx.orderItem.update({
            where: { id: item.id },
            data: { status: OrderItemStatus.voided, voidReason: dto.reason },
          });
        }
      }

      await tx.order.update({
        where: { id: oid },
        data: {
          status: OrderStatus.cancelled,
          cancelReason: dto.reason,
          paymentStatus: PaymentStatus.unpaid,
          subtotal: 0n,
          total: 0n,
        },
      });

      // 取消后关闭会话并进入待清台，避免仍显示「用餐中」
      if (order.tableSessionId) {
        await this.markTableCleaningAfterSettle(tx, order.tableSessionId);
      }
    });

    const full = await this.getOrderFull(oid);
    const mapped = this.mapOrder(full!);
    await this.audit.log({
      userId,
      action: 'order.cancel',
      targetType: 'order',
      targetId: orderId,
      after: { reason: dto.reason },
    });
    this.events.emit(Events.ORDER_CANCELLED, { storeId, order: mapped, userId });
    this.events.emit(Events.TABLE_STATUS_CHANGED, {
      storeId,
      orderId,
      tableId: mapped.tableId,
    });
    return mapped;
  }

  async setDiscount(storeId: string, orderId: string, dto: DiscountDto, userId?: string) {
    const oid = BigInt(orderId);
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: oid, storeId: BigInt(storeId) },
      });
      if (!order) throw new BusinessError('ORDER_NOT_FOUND');
      if (order.status !== OrderStatus.open) throw new BusinessError('ORDER_NOT_OPEN');

      const prev = (order.promoSnapshot || {}) as PromoSnap;
      await tx.order.update({
        where: { id: oid },
        data: {
          serviceCharge:
            dto.serviceCharge != null ? BigInt(dto.serviceCharge) : order.serviceCharge,
          roundOff: dto.roundOff != null ? BigInt(dto.roundOff) : order.roundOff,
          promoSnapshot: { ...prev, manualDiscount: dto.discount },
        },
      });
      await this.recalculateOrder(tx, oid);
    });

    if (userId) {
      await this.audit.log({
        userId,
        action: 'order.discount',
        targetType: 'order',
        targetId: orderId,
        after: { discount: dto.discount, roundOff: dto.roundOff },
      });
    }

    const full = await this.getOrderFull(oid);
    return this.mapOrder(full!);
  }

  async addTempItem(storeId: string, orderId: string, dto: TempItemDto, userId: string) {
    const oid = BigInt(orderId);
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: oid, storeId: BigInt(storeId) },
        include: { batches: { orderBy: { roundNo: 'desc' }, take: 1 } },
      });
      if (!order) throw new BusinessError('ORDER_NOT_FOUND');
      if (order.status !== OrderStatus.open) throw new BusinessError('ORDER_NOT_OPEN');
      const qty = dto.qty ?? 1;
      const unitPrice = BigInt(dto.unitPrice);
      const nextRound = (order.batches[0]?.roundNo ?? 0) + 1;
      const batch = await tx.orderBatch.create({
        data: {
          orderId: oid,
          roundNo: nextRound,
          source: OrderSource.pos,
          createdBy: BigInt(userId),
        },
      });
      await tx.orderItem.create({
        data: {
          orderId: oid,
          batchId: batch.id,
          dishId: null,
          nameZh: dto.nameZh,
          nameVi: dto.nameVi,
          originUnitPrice: unitPrice,
          unitPrice,
          qty,
          amount: unitPrice * BigInt(qty),
          status: OrderItemStatus.pending,
        },
      });
      await this.recalculateOrder(tx, oid);
    });
    const full = await this.getOrderFull(oid);
    return this.mapOrder(full!);
  }

  async updateLineItem(
    storeId: string,
    itemId: string,
    dto: LineDiscountDto,
    userId: string,
  ) {
    const iid = BigInt(itemId);
    const orderId = await this.prisma.$transaction(async (tx) => {
      const item = await tx.orderItem.findUnique({
        where: { id: iid },
        include: { order: true },
      });
      if (!item || item.order.storeId !== BigInt(storeId)) {
        throw new BusinessError('ORDER_ITEM_NOT_FOUND');
      }
      if (item.order.status !== OrderStatus.open) throw new BusinessError('ORDER_NOT_OPEN');
      if (item.status === OrderItemStatus.voided) throw new BusinessError('ORDER_ITEM_VOIDED');

      const origin = item.originUnitPrice || item.unitPrice;
      let unitPrice = origin;
      let lineDiscount = 0n;
      let isGift = dto.isGift ?? item.isGift;
      if (isGift) {
        unitPrice = 0n;
        lineDiscount = origin * BigInt(item.qty);
      } else if (dto.percent != null) {
        lineDiscount = BigInt(Math.floor((Number(origin) * item.qty * dto.percent) / 100));
        unitPrice = BigInt(Math.floor((Number(origin) * (100 - dto.percent)) / 100));
      } else if (dto.lineDiscount != null) {
        lineDiscount = BigInt(dto.lineDiscount);
        const gross = origin * BigInt(item.qty);
        const net = gross - lineDiscount;
        unitPrice = BigInt(Math.floor(Number(net < 0n ? 0n : net) / item.qty));
      }
      const amount = isGift ? 0n : unitPrice * BigInt(item.qty);
      await tx.orderItem.update({
        where: { id: iid },
        data: { unitPrice, lineDiscount, isGift, amount, originUnitPrice: origin },
      });
      await this.recalculateOrder(tx, item.orderId);
      return item.orderId;
    });
    await this.audit.log({
      userId,
      action: 'order.line_discount',
      targetType: 'order_item',
      targetId: itemId,
      after: dto as unknown as Record<string, unknown>,
    });
    const full = await this.getOrderFull(orderId);
    return this.mapOrder(full!);
  }

  async bindCustomer(storeId: string, orderId: string, dto: BindCustomerDto, userId: string) {
    const oid = BigInt(orderId);
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: oid, storeId: BigInt(storeId) },
      });
      if (!order) throw new BusinessError('ORDER_NOT_FOUND');
      if (order.status !== OrderStatus.open) throw new BusinessError('ORDER_NOT_OPEN');

      let customerId: bigint | null = null;
      if (dto.customerId) {
        const c = await tx.customer.findFirst({
          where: { id: BigInt(dto.customerId), status: CustomerStatus.active },
        });
        if (!c) throw new BusinessError('CUSTOMER_NOT_FOUND');
        customerId = c.id;
      }
      let couponId: bigint | null = order.couponId;
      if (dto.couponId === null || dto.couponId === '') couponId = null;
      else if (dto.couponId) {
        const spec = await this.marketing.couponAsSpec(dto.couponId, customerId?.toString());
        if (!spec) throw new BusinessError('COUPON_INVALID');
        couponId = BigInt(dto.couponId);
      }

      await tx.order.update({
        where: { id: oid },
        data: { customerId, couponId },
      });
      const priced = await this.recalculateOrder(tx, oid);
      if (couponId && !this.readCouponSnap(priced.promoSnapshot)) {
        throw new BusinessError('COUPON_NOT_APPLICABLE');
      }
    });
    await this.audit.log({
      userId,
      action: 'order.bind_customer',
      targetType: 'order',
      targetId: orderId,
      after: dto as unknown as Record<string, unknown>,
    });
    const full = await this.getOrderFull(oid);
    return this.mapOrder(full!);
  }

  async freeOrder(storeId: string, orderId: string, userId: string) {
    return this.setDiscount(
      storeId,
      orderId,
      { discount: 999999999, serviceCharge: 0, roundOff: 0 },
      userId,
    );
  }

  async checkout(storeId: string, orderId: string, dto: CheckoutDto, userId: string) {
    const oid = BigInt(orderId);
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: oid, storeId: BigInt(storeId) },
        include: {
          items: true,
          tableSession: { include: { table: true } },
        },
      });
      if (!order) throw new BusinessError('ORDER_NOT_FOUND');
      if (order.status !== OrderStatus.open) throw new BusinessError('ORDER_NOT_OPEN');

      await this.recalculateOrder(tx, oid);
      const fresh = await tx.order.findUniqueOrThrow({ where: { id: oid } });
      const amounts = {
        subtotal: fresh.subtotal,
        discount: fresh.discount,
        total: fresh.total,
      };

      /**
       * 现金单笔：以订单应付为准计入 amount，received 为顾客实付（可大于应付，差额为找零）。
       * 避免前端把「实收」误当成「支付金额」或订单重算后 total 漂移导致 PAYMENT_AMOUNT_MISMATCH。
       */
      const lines = dto.payments.map((p) => {
        if (p.method === PaymentMethod.cash && dto.payments.length === 1) {
          const received = BigInt(p.received ?? p.amount);
          return { ...p, amount: Number(amounts.total), received: Number(received) };
        }
        return p;
      });

      const paySum = lines.reduce((s, p) => s + BigInt(p.amount), 0n);
      if (paySum !== amounts.total) {
        throw new BusinessError('PAYMENT_AMOUNT_MISMATCH');
      }
      // 仅当计价实际吃到优惠券时才核销，避免渠道/门槛不符空核销
      if (fresh.couponId && this.readCouponSnap(fresh.promoSnapshot)) {
        await this.marketing.markCouponUsed(tx, fresh.couponId.toString(), oid);
      }

      for (const p of lines) {
        let received = BigInt(p.received ?? p.amount);
        let change = 0n;
        if (p.method === PaymentMethod.cash) {
          if (received < BigInt(p.amount)) throw new BusinessError('CASH_RECEIVED_INSUFFICIENT');
          change = received - BigInt(p.amount);
        } else {
          received = BigInt(p.amount);
          change = 0n;
        }
        await tx.payment.create({
          data: {
            orderId: oid,
            method: p.method,
            amount: BigInt(p.amount),
            received,
            change,
            operatorId: BigInt(userId),
          },
        });
      }

      await tx.order.update({
        where: { id: oid },
        data: {
          status: OrderStatus.paid,
          paymentStatus: PaymentStatus.paid,
          paidAmount: paySum,
          subtotal: amounts.subtotal,
          discount: amounts.discount,
          total: amounts.total,
        },
      });

      // 结账后关闭本会话并进入待清台（避免桌台仍显示用餐中 / 顾客继续加菜）
      if (order.tableSessionId) {
        await this.markTableCleaningAfterSettle(tx, order.tableSessionId);
      }
    });

    const full = await this.getOrderFull(oid);
    const mapped = this.mapOrder(full!);
    await this.audit.log({
      userId,
      storeId,
      module: 'order',
      action: 'order.checkout',
      targetType: 'order',
      targetId: orderId,
      after: {
        paidAmount: mapped.paidAmount,
        total: mapped.total,
        payments: dto.payments,
      },
    });
    this.events.emit(Events.ORDER_PAID, { storeId, order: mapped, userId });
    this.events.emit(Events.TABLE_STATUS_CHANGED, {
      storeId,
      orderId: mapped.id,
      tableId: mapped.tableId,
    });
    return mapped;
  }

  /**
   * 堂食结账/取消后：关闭订单所属会话；若桌台当前无其它 open 单则标为待清台。
   * 用 tableId 更新，不依赖 include 出来的 table 对象。
   */
  private async markTableCleaningAfterSettle(tx: Tx, tableSessionId: bigint) {
    const session = await tx.tableSession.findUnique({
      where: { id: tableSessionId },
      select: { id: true, tableId: true, status: true },
    });
    if (!session) return;

    if (session.status === SessionStatus.open) {
      await tx.tableSession.update({
        where: { id: session.id },
        data: { status: SessionStatus.closed, closeAt: new Date() },
      });
    }

    const table = await tx.table.findUnique({
      where: { id: session.tableId },
      include: {
        currentSession: {
          include: {
            orders: { where: { status: OrderStatus.open }, select: { id: true } },
          },
        },
      },
    });
    if (!table) return;

    const openOnCurrent = table.currentSession?.orders?.length ?? 0;
    if (openOnCurrent > 0) return;

    // 当前挂着的空会话（扫码重开、未点单）一并关掉，避免清台前又显示用餐中
    if (
      table.currentSessionId &&
      table.currentSessionId !== session.id &&
      table.currentSession &&
      !(table.currentSession.orders?.length)
    ) {
      if (table.currentSession.status === SessionStatus.open) {
        await tx.tableSession.update({
          where: { id: table.currentSessionId },
          data: { status: SessionStatus.closed, closeAt: new Date() },
        });
      }
    }

    await tx.table.update({
      where: { id: table.id },
      data: { status: TableStatus.cleaning },
    });
  }

  /** 反结账：需 order:checkout，写审计；已有退款记录不可反结账 */
  async reverseCheckout(
    storeId: string,
    orderId: string,
    userId: string,
    ip?: string | null,
  ) {
    const oid = BigInt(orderId);
    const before = await this.getOrderFull(oid);
    if (!before || before.storeId !== BigInt(storeId)) {
      throw new BusinessError('ORDER_NOT_FOUND');
    }
    if (before.status !== OrderStatus.paid) throw new BusinessError('ORDER_NOT_PAID');
    if (before.refunds.length > 0) throw new BusinessError('ORDER_HAS_REFUNDS');

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.deleteMany({ where: { orderId: oid } });
      await tx.order.update({
        where: { id: oid },
        data: {
          status: OrderStatus.open,
          paymentStatus: PaymentStatus.unpaid,
          paidAmount: 0n,
        },
      });

      if (before.tableSession?.table) {
        await tx.table.update({
          where: { id: before.tableSession.table.id },
          data: {
            status: TableStatus.dining,
            currentSessionId: before.tableSessionId,
          },
        });
        if (before.tableSession.status === 'closed') {
          await tx.tableSession.update({
            where: { id: before.tableSession.id },
            data: { status: 'open', closeAt: null },
          });
        }
      }
    });

    const after = await this.getOrderFull(oid);
    await this.audit.log({
      userId,
      action: 'order.reverse_checkout',
      targetType: 'order',
      targetId: orderId,
      before: {
        status: before.status,
        paidAmount: Number(before.paidAmount),
        payments: before.payments.map((p) => ({
          method: p.method,
          amount: Number(p.amount),
        })),
      },
      after: { status: after?.status, paidAmount: 0 },
      ip,
    });

    const mapped = this.mapOrder(after!);
    this.events.emit(Events.ORDER_STATUS_CHANGED, { storeId, order: mapped, userId });
    this.events.emit(Events.TABLE_STATUS_CHANGED, { storeId, orderId });
    return mapped;
  }

  /**
   * 正式退款：堂食已结账 / 外卖已完成。
   * 不改订单 status，扣减 paidAmount；全额退完 paymentStatus=refunded。
   */
  async refund(
    storeId: string,
    orderId: string,
    dto: RefundDto,
    userId: string,
    ip?: string | null,
  ) {
    const oid = BigInt(orderId);
    const amount = BigInt(dto.amount);
    if (amount <= 0n) throw new BusinessError('REFUND_AMOUNT_INVALID');

    let refundId = '';
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: oid, storeId: BigInt(storeId) },
      });
      if (!order) throw new BusinessError('ORDER_NOT_FOUND');

      const statusOk =
        order.status === OrderStatus.paid || order.status === OrderStatus.completed;
      const payOk =
        order.paymentStatus === PaymentStatus.paid ||
        order.paymentStatus === PaymentStatus.partial;
      if (!statusOk || !payOk) throw new BusinessError('ORDER_NOT_REFUNDABLE');
      if (order.paidAmount <= 0n) throw new BusinessError('ORDER_NOT_REFUNDABLE');
      if (amount > order.paidAmount) throw new BusinessError('REFUND_EXCEEDS_PAID');

      const created = await tx.orderRefund.create({
        data: {
          orderId: oid,
          amount,
          method: dto.method,
          reason: dto.reason.trim(),
          operatorId: BigInt(userId),
        },
      });
      refundId = created.id.toString();

      const newPaid = order.paidAmount - amount;
      await tx.order.update({
        where: { id: oid },
        data: {
          paidAmount: newPaid,
          paymentStatus:
            newPaid === 0n ? PaymentStatus.refunded : PaymentStatus.partial,
        },
      });
    });

    const after = await this.getOrderFull(oid);
    const mapped = this.mapOrder(after!);
    await this.audit.log({
      userId,
      storeId,
      module: 'order',
      action: 'order.refund',
      targetType: 'order',
      targetId: orderId,
      after: {
        refundId,
        amount: Number(amount),
        method: dto.method,
        reason: dto.reason.trim(),
        paidAmount: mapped.paidAmount,
        paymentStatus: mapped.paymentStatus,
      },
      ip,
    });
    this.events.emit(Events.ORDER_STATUS_CHANGED, { storeId, order: mapped, userId });
    const refundRow = mapped.refunds.find((r) => r.id === refundId) ?? mapped.refunds.at(-1);
    if (refundRow) {
      this.events.emit(Events.ORDER_REFUNDED, {
        storeId,
        order: mapped,
        userId,
        refund: {
          id: refundRow.id,
          amount: refundRow.amount,
          method: refundRow.method,
          reason: refundRow.reason,
          createdAt: refundRow.createdAt,
        },
      });
    }
    return mapped;
  }

  async detail(storeId: string, orderId: string) {
    const full = await this.prisma.order.findFirst({
      where: { id: BigInt(orderId), storeId: BigInt(storeId) },
      include: this.orderFullInclude(),
    });
    if (!full) throw new BusinessError('ORDER_NOT_FOUND');
    return this.mapOrder(full);
  }

  async bySession(storeId: string, sessionId: string) {
    const full = await this.prisma.order.findFirst({
      where: {
        storeId: BigInt(storeId),
        tableSessionId: BigInt(sessionId),
        status: OrderStatus.open,
      },
      include: this.orderFullInclude(),
    });
    return full ? this.mapOrder(full) : null;
  }

  async byTable(storeId: string, tableId: string) {
    const table = await this.prisma.table.findFirst({
      where: { id: BigInt(tableId), storeId: BigInt(storeId) },
    });
    if (!table?.currentSessionId) return null;
    return this.bySession(storeId, table.currentSessionId.toString());
  }

  /** 当前门店未确认的扫码轮次数量（用于角标） */
  async countNeedConfirm(storeId: string): Promise<number> {
    return this.prisma.orderBatch.count({
      where: {
        printStatus: BatchPrintStatus.need_confirm,
        order: {
          storeId: BigInt(storeId),
          status: OrderStatus.open,
          type: OrderType.dine_in,
        },
      },
    });
  }

  private async emitQrPending(storeId: string) {
    const count = await this.countNeedConfirm(storeId);
    this.events.emit(Events.QR_PENDING_CHANGED, { storeId, count });
    return count;
  }

  /** 确认扫码待确认轮次 → 放行后厨打印 */
  async confirmBatch(storeId: string, batchId: string, userId: string) {
    const batch = await this.prisma.orderBatch.findUnique({
      where: { id: BigInt(batchId) },
      include: { order: true },
    });
    if (!batch || batch.order.storeId !== BigInt(storeId)) {
      throw new BusinessError('ORDER_BATCH_NOT_FOUND');
    }
    if (batch.printStatus !== BatchPrintStatus.need_confirm) {
      throw new BusinessError('ORDER_BATCH_NOT_NEED_CONFIRM');
    }
    const updated = await this.prisma.orderBatch.update({
      where: { id: batch.id },
      data: { printStatus: BatchPrintStatus.pending },
    });
    const full = await this.getOrderFull(batch.orderId);
    const mapped = this.mapOrder(full!);
    const pendingConfirmCount = await this.emitQrPending(storeId);
    this.events.emit(Events.ORDER_BATCH_ADDED, {
      storeId,
      orderId: mapped.id,
      sessionId: mapped.tableSessionId,
      roundNo: updated.roundNo,
      batch: mapped.batches.find((b) => b.id === batchId),
      confirmed: true,
      needConfirm: false,
      pendingConfirmCount,
      userId,
      order: mapped,
    });
    this.events.emit(Events.TABLE_STATUS_CHANGED, { storeId, orderId: mapped.id });
    return mapped;
  }

  /**
   * 向订单添加套餐：
   * 1. 校验套餐存在且启用
   * 2. 校验各分组 min/max 选择规则
   * 3. 按选中菜品扣减库存
   * 4. 写入一条 OrderItem（dishId=null，comboId 填写，optionsSnapshot 存选中明细）
   * 5. 重算订单金额
   */
  async addComboItem(storeId: string, orderId: string, dto: AddComboItemDto, userId: string) {
    const sid = BigInt(storeId);
    const oid = BigInt(orderId);

    // 查套餐（含分组/子项）
    const combo = await this.comboService.getComboForOrder(BigInt(dto.comboId), sid);
    const qty = dto.qty ?? 1;

    // 校验各分组选择规则
    const groupMap = new Map(combo.groups.map((g) => [g.id.toString(), g]));
    for (const sel of dto.selections) {
      const group = groupMap.get(sel.groupId);
      if (!group) throw new BusinessError('COMBO_GROUP_NOT_FOUND');
      const count = sel.dishIds.length;
      if (count < group.minSelect) throw new BusinessError('COMBO_SELECT_TOO_FEW');
      if (count > group.maxSelect) throw new BusinessError('COMBO_SELECT_TOO_MANY');
      // 校验选中菜品均在该分组内
      const validIds = new Set(group.items.map((i) => i.dishId.toString()));
      for (const did of sel.dishIds) {
        if (!validIds.has(did)) throw new BusinessError('COMBO_DISH_NOT_IN_GROUP');
      }
    }

    // 计算套餐总价 = 套餐基础价 + Σ(选中项加价) * qty
    let extraTotal = 0n;
    const optionsSnapshot: Array<{
      groupId: string;
      groupNameZh: string;
      groupNameVi: string;
      dishId: string;
      dishNameZh: string;
      dishNameVi: string;
      extraPrice: number;
    }> = [];

    for (const sel of dto.selections) {
      const group = groupMap.get(sel.groupId)!;
      for (const did of sel.dishIds) {
        const item = group.items.find((i) => i.dishId.toString() === did);
        if (!item) throw new BusinessError('COMBO_DISH_NOT_IN_GROUP');
        // item.extraPrice 来自 Prisma 原始类型（BigInt）
        extraTotal += item.extraPrice;
        optionsSnapshot.push({
          groupId: sel.groupId,
          groupNameZh: group.nameZh,
          groupNameVi: group.nameVi,
          dishId: did,
          dishNameZh: item.dish?.nameZh ?? '',
          dishNameVi: item.dish?.nameVi ?? '',
          extraPrice: Number(item.extraPrice),
        });
      }
    }

    // combo.price 为 Prisma BigInt
    const unitPrice = combo.price + extraTotal;
    const lineAmount = unitPrice * BigInt(qty);

    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: oid, storeId: sid },
        include: { batches: { orderBy: { roundNo: 'desc' }, take: 1 } },
      });
      if (!order) throw new BusinessError('ORDER_NOT_FOUND');
      if (order.status !== OrderStatus.open) throw new BusinessError('ORDER_NOT_OPEN');

      // 按选中菜品扣减库存（复用现有 deductStock 逻辑）+ 原料配方
      for (const sel of dto.selections) {
        for (const did of sel.dishIds) {
          const dishId = BigInt(did);
          await this.deductStock(tx, dishId, qty);
          await this.inventory.consumeRecipe(tx, sid, dishId, qty, {
            refType: 'order',
            refId: oid.toString(),
          });
        }
      }

      const nextRound = (order.batches[0]?.roundNo ?? 0) + 1;
      const batch = await tx.orderBatch.create({
        data: {
          orderId: oid,
          roundNo: nextRound,
          source: OrderSource.waiter,
          createdBy: BigInt(userId),
        },
      });

      await tx.orderItem.create({
        data: {
          orderId: oid,
          batchId: batch.id,
          dishId: null,
          comboId: BigInt(dto.comboId),
          nameZh: combo.nameZh,
          nameVi: combo.nameVi,
          originUnitPrice: unitPrice,
          unitPrice: unitPrice,
          qty,
          amount: lineAmount,
          optionsSnapshot: optionsSnapshot as unknown as Prisma.InputJsonValue,
          guestNickname: dto.guestNickname,
          status: OrderItemStatus.pending,
        },
      });

      await this.recalculateOrder(tx, oid);
    });

    const full = await this.getOrderFull(oid);
    const mapped = this.mapOrder(full!);
    const lastBatch = mapped.batches[mapped.batches.length - 1];
    this.events.emit(Events.ORDER_BATCH_ADDED, {
      storeId,
      orderId: mapped.id,
      sessionId: mapped.tableSessionId,
      roundNo: lastBatch?.roundNo,
      batch: lastBatch,
      order: mapped,
    });
    this.events.emit(Events.TABLE_STATUS_CHANGED, { storeId, tableId: mapped.tableId });
    return mapped;
  }

  async list(storeId: string, query: OrderQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where: Prisma.OrderWhereInput = { storeId: BigInt(storeId) };

    if (query.type) where.type = query.type as OrderType;
    if (query.status) where.status = query.status as OrderStatus;
    if (query.date) {
      const start = new Date(`${query.date}T00:00:00`);
      const end = new Date(`${query.date}T23:59:59.999`);
      where.createdAt = { gte: start, lte: end };
    }
    if (query.tableCode) {
      where.tableSession = { table: { code: { contains: query.tableCode } } };
    }

    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: this.orderFullInclude(),
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      total,
      page,
      pageSize,
      list: rows.map((r) => this.mapOrder(r)),
    };
  }

  /** 厨房看板：未结堂食 / 制作中外卖的待做与制作中菜品 */
  async kitchenBoard(storeId: string, stationId?: string) {
    const items = await this.prisma.orderItem.findMany({
      where: {
        status: { in: [OrderItemStatus.pending, OrderItemStatus.cooking] },
        order: {
          storeId: BigInt(storeId),
          status: {
            in: [
              OrderStatus.open,
              OrderStatus.accepted,
              OrderStatus.cooking,
              OrderStatus.pending,
            ],
          },
        },
        ...(stationId
          ? {
              dish: {
                category: { kitchenStationId: BigInt(stationId) },
              },
            }
          : {}),
      },
      include: {
        order: {
          include: {
            tableSession: { include: { table: true } },
          },
        },
        batch: true,
        dish: {
          include: { category: { include: { kitchenStation: true } } },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 200,
    });

    return items.map((it) => ({
      id: it.id.toString(),
      orderId: it.orderId.toString(),
      orderNo: it.order.orderNo,
      orderType: it.order.type,
      orderStatus: it.order.status,
      tableCode: it.order.tableSession?.table?.code ?? null,
      batchId: it.batchId?.toString() ?? null,
      roundNo: it.batch?.roundNo ?? null,
      dishId: it.dishId?.toString() ?? null,
      nameZh: it.nameZh,
      nameVi: it.nameVi,
      qty: it.qty,
      status: it.status,
      guestNickname: it.guestNickname,
      stationId: it.dish?.category?.kitchenStationId?.toString() ?? null,
      stationNameZh: it.dish?.category?.kitchenStation?.nameZh ?? null,
      stationNameVi: it.dish?.category?.kitchenStation?.nameVi ?? null,
      createdAt: it.createdAt.toISOString(),
    }));
  }

  async updateItemStatus(
    storeId: string,
    itemId: string,
    dto: UpdateItemStatusDto,
    operatorId?: string,
  ) {
    const item = await this.prisma.orderItem.findFirst({
      where: { id: BigInt(itemId), order: { storeId: BigInt(storeId) } },
      include: { order: true },
    });
    if (!item) throw new BusinessError('ORDER_ITEM_NOT_FOUND');
    if (item.status === OrderItemStatus.voided) throw new BusinessError('ORDER_ITEM_VOIDED');

    const next =
      dto.status === 'cooking' ? OrderItemStatus.cooking : OrderItemStatus.served;
    const allowed: Record<string, OrderItemStatus[]> = {
      [OrderItemStatus.cooking]: [OrderItemStatus.pending],
      [OrderItemStatus.served]: [OrderItemStatus.pending, OrderItemStatus.cooking],
    };
    if (!allowed[next]?.includes(item.status)) {
      throw new BusinessError('ORDER_ITEM_STATUS_INVALID');
    }

    await this.prisma.orderItem.update({
      where: { id: item.id },
      data: { status: next },
    });

    const payload = {
      storeId,
      orderId: item.orderId.toString(),
      itemId: item.id.toString(),
      from: item.status,
      to: next,
      operatorId,
    };
    this.events.emit(Events.ORDER_ITEM_STATUS_CHANGED, payload);
    this.events.emit(Events.ORDER_STATUS_CHANGED, {
      storeId,
      orderId: item.orderId.toString(),
      status: item.order.status,
      itemStatus: next,
    });
    return payload;
  }
}
