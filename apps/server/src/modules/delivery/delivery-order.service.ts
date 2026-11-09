import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  OrderItemStatus,
  OrderSource,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { Events } from '@restaurant/shared';
import { BusinessError } from '../../common/errors/business.error';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ComboService } from '../combo/combo.service';
import { PlaceGroupMealOrderDto } from '../group-meal/dto/group-meal.dto';
import { InventoryService } from '../inventory/inventory.service';
import { MarketingService } from '../marketing/marketing.service';
import { MemberService } from '../member/member.service';
import { computePricing } from '../marketing/pricing.util';
import {
  BusinessHours,
  DeliveryFeeRule,
  calcDeliveryFee,
  getStoreOpenStatus,
  haversineKm,
} from './geo.util';
import { CancelOrderDto, PlaceOrderDto, QuoteDto } from './dto/delivery.dto';

type TimelineEntry = { status: string; at: string; by?: string; reason?: string };

@Injectable()
export class DeliveryOrderService {
  private readonly logger = new Logger(DeliveryOrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly marketing: MarketingService,
    private readonly comboService: ComboService,
    private readonly members: MemberService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
  ) {}

  private money(n: bigint | number) {
    return Number(n);
  }

  private orderNo() {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    return `H${stamp}${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
  }

  private appendTimeline(raw: unknown, entry: TimelineEntry): TimelineEntry[] {
    const list = Array.isArray(raw) ? ([...raw] as TimelineEntry[]) : [];
    list.push(entry);
    return list;
  }

  async getPublicStore(storeId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: BigInt(storeId) } });
    if (!store) throw new BusinessError('STORE_REQUIRED');
    const envGallery = Array.isArray(store.envGallery)
      ? (store.envGallery as { image?: string; captionZh?: string; captionVi?: string }[])
          .filter((x) => x && typeof x.image === 'string')
          .map((x) => ({
            image: x.image as string,
            captionZh: x.captionZh,
            captionVi: x.captionVi,
          }))
      : [];
    return {
      id: store.id.toString(),
      nameZh: store.nameZh,
      nameVi: store.nameVi,
      address: store.address,
      phone: store.phone,
      lat: store.lat != null ? Number(store.lat) : null,
      lng: store.lng != null ? Number(store.lng) : null,
      deliveryRadiusKm: Number(store.deliveryRadiusKm),
      deliveryFeeRules: (store.deliveryFeeRules as DeliveryFeeRule[]) || [],
      minOrderAmount: this.money(store.minOrderAmount),
      businessHours: store.businessHours as BusinessHours | null,
      bankTransferQr: store.bankTransferQr,
      storefrontImage: store.storefrontImage,
      envGallery,
      ...getStoreOpenStatus(new Date(), store.businessHours as BusinessHours | null),
    };
  }

  async quote(storeId: string, dto: QuoteDto, customerId?: string) {
    const store = await this.prisma.store.findUnique({ where: { id: BigInt(storeId) } });
    if (!store) throw new BusinessError('STORE_REQUIRED');
    if (store.lat == null || store.lng == null) {
      throw new BusinessError('STORE_LOCATION_MISSING');
    }
    if (!getStoreOpenStatus(new Date(), store.businessHours as BusinessHours | null).openNow) {
      throw new BusinessError('STORE_CLOSED');
    }
    const distanceKm = haversineKm(Number(store.lat), Number(store.lng), dto.lat, dto.lng);
    const radius = Number(store.deliveryRadiusKm);
    if (distanceKm > radius) throw new BusinessError('OUT_OF_DELIVERY_RANGE');
    const rules = (store.deliveryFeeRules as DeliveryFeeRule[]) || [];
    const rawFee = calcDeliveryFee(distanceKm, rules);
    const perk = customerId
      ? await this.members.deliveryPerk(customerId, rawFee)
      : { fee: rawFee, off: 0, priority: false };
    const deliveryFee = perk.fee;
    const subtotal = Math.round(dto.subtotal || 0);
    const minOrder = this.money(store.minOrderAmount);

    let discount = 0;
    let total = subtotal + deliveryFee;
    let coupon: { id: string; nameZh: string; amount: number } | null = null;
    if (subtotal > 0) {
      const customer = customerId
        ? await this.prisma.customer.findUnique({
            where: { id: BigInt(customerId) },
            include: { memberLevel: true },
          })
        : null;
      const promoRules = await this.marketing.activeRulesAsSpecs(storeId);
      const couponSpec = dto.couponId
        ? await this.marketing.couponAsSpec(dto.couponId, customerId)
        : null;
      if (dto.couponId && !couponSpec) throw new BusinessError('COUPON_INVALID');
      const priced = computePricing({
        lines: [{ dishId: null, amount: subtotal, status: 'pending' }],
        channel: 'delivery',
        rules: promoRules,
        coupon: couponSpec,
        deliveryFee: Number(deliveryFee),
        memberPercent: customer?.memberLevel?.discountPercent ?? 0,
      });
      if (dto.couponId && !priced.snapshot.coupon) {
        throw new BusinessError('COUPON_NOT_APPLICABLE');
      }
      discount = priced.discount;
      total = priced.total;
      coupon = priced.snapshot.coupon;
    }

    return {
      distanceKm: Math.round(distanceKm * 100) / 100,
      deliveryFee,
      deliveryFeeOff: perk.off,
      memberPriority: perk.priority,
      minOrderAmount: minOrder,
      subtotalOk: subtotal <= 0 || subtotal >= minOrder,
      subtotal,
      discount,
      coupon,
      total,
    };
  }

  mapOrder(
    o: Prisma.OrderGetPayload<{
      include: {
        batches: { include: { items: true } };
        items: true;
        payments: true;
        customer: true;
        courier: true;
      };
    }>,
  ) {
    const snap =
      o.addressSnapshot && typeof o.addressSnapshot === 'object'
        ? (o.addressSnapshot as Record<string, unknown>)
        : null;
    /** H5 分类：团餐仍存 delivery，用 snapshot.groupMeal 区分 */
    const channel =
      snap?.groupMeal === true ? 'group_meal' : o.type;

    return {
      id: o.id.toString(),
      orderNo: o.orderNo,
      type: o.type,
      channel,
      source: o.source,
      status: o.status,
      paymentStatus: o.paymentStatus,
      payMethod: o.payMethod,
      customerId: o.customerId?.toString() ?? null,
      customer: o.customer
        ? { id: o.customer.id.toString(), name: o.customer.name, phone: o.customer.phone, email: o.customer.email }
        : null,
      addressSnapshot: o.addressSnapshot,
      remark: o.remark,
      memberPriority: o.memberPriority,
      cancelReason: o.cancelReason,
      subtotal: this.money(o.subtotal),
      discount: this.money(o.discount),
      serviceCharge: this.money(o.serviceCharge),
      deliveryFee: this.money(o.deliveryFee),
      total: this.money(o.total),
      paidAmount: this.money(o.paidAmount),
      tableCode:
        (o as { tableSession?: { table?: { code?: string } | null } | null }).tableSession?.table
          ?.code ?? null,
      courierId: o.courierId?.toString() ?? null,
      courierName: o.courier?.displayName ?? null,
      statusTimeline: o.statusTimeline || [],
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      items: o.items.map((it) => ({
        id: it.id.toString(),
        dishId: it.dishId?.toString() ?? null,
        nameZh: it.nameZh,
        nameVi: it.nameVi,
        unitPrice: this.money(it.unitPrice),
        qty: it.qty,
        amount: this.money(it.amount),
        status: it.status,
        optionsSnapshot: it.optionsSnapshot,
      })),
      payments: o.payments.map((p) => ({
        method: p.method,
        amount: this.money(p.amount),
      })),
      batches: o.batches.map((b) => ({
        id: b.id.toString(),
        roundNo: b.roundNo,
        printStatus: b.printStatus,
        items: b.items.map((it) => ({
          id: it.id.toString(),
          dishId: it.dishId?.toString() ?? null,
          nameZh: it.nameZh,
          nameVi: it.nameVi,
          unitPrice: this.money(it.unitPrice),
          qty: it.qty,
          amount: this.money(it.amount),
          status: it.status,
        })),
      })),
    };
  }

  private async getFull(id: bigint) {
    return this.prisma.order.findUnique({
      where: { id },
      include: {
        batches: { include: { items: true }, orderBy: { roundNo: 'asc' } },
        items: true,
        payments: true,
        customer: true,
        courier: true,
        tableSession: { include: { table: { select: { code: true } } } },
      },
    });
  }

  async placeOrder(storeId: string, customerId: string, dto: PlaceOrderDto) {
    if (dto.payMethod === 'momo' || dto.payMethod === 'vnpay') {
      throw new BusinessError('PAYMENT_METHOD_NOT_READY');
    }
    const store = await this.prisma.store.findUnique({ where: { id: BigInt(storeId) } });
    if (!store) throw new BusinessError('STORE_REQUIRED');
    if (!getStoreOpenStatus(new Date(), store.businessHours as BusinessHours | null).openNow) {
      throw new BusinessError('STORE_CLOSED');
    }
    if (store.lat == null || store.lng == null) throw new BusinessError('STORE_LOCATION_MISSING');

    const address = await this.prisma.customerAddress.findFirst({
      where: { id: BigInt(dto.addressId), customerId: BigInt(customerId) },
    });
    if (!address || address.lat == null || address.lng == null) {
      throw new BusinessError('ADDRESS_NOT_FOUND');
    }

    const distanceKm = haversineKm(
      Number(store.lat),
      Number(store.lng),
      Number(address.lat),
      Number(address.lng),
    );
    if (distanceKm > Number(store.deliveryRadiusKm)) {
      throw new BusinessError('OUT_OF_DELIVERY_RANGE');
    }
    const rawFee = calcDeliveryFee(distanceKm, (store.deliveryFeeRules as DeliveryFeeRule[]) || []);
    const perk = await this.members.deliveryPerk(customerId, rawFee);
    const deliveryFee = BigInt(perk.fee);

    const dishIds = dto.items.map((i) => BigInt(i.dishId));
    const dishes = await this.prisma.dish.findMany({
      where: { id: { in: dishIds }, storeId: store.id, status: 'on', isDelivery: true },
    });
    if (dishes.length !== new Set(dishIds.map(String)).size) {
      throw new BusinessError('DISH_NOT_AVAILABLE');
    }
    const dishMap = new Map(dishes.map((d) => [d.id.toString(), d]));

    type Line = {
      dishId: bigint;
      nameZh: string;
      nameVi: string;
      unitPrice: bigint;
      qty: number;
      amount: bigint;
      optionsSnapshot: Prisma.InputJsonValue | undefined;
    };
    const lines: Line[] = [];
    for (const it of dto.items) {
      const dish = dishMap.get(it.dishId)!;
      const unitPrice = dish.takeawayPrice ?? dish.price;
      const amount = unitPrice * BigInt(it.qty);
      lines.push({
        dishId: dish.id,
        nameZh: dish.nameZh,
        nameVi: dish.nameVi,
        unitPrice,
        qty: it.qty,
        amount,
        optionsSnapshot: it.optionsSnapshot as Prisma.InputJsonValue | undefined,
      });
    }
    const subtotal = lines.reduce((s, l) => s + l.amount, 0n);
    if (subtotal < store.minOrderAmount) throw new BusinessError('BELOW_MIN_ORDER');

    const customer = await this.prisma.customer.findUnique({
      where: { id: BigInt(customerId) },
      include: { memberLevel: true },
    });
    const rules = await this.marketing.activeRulesAsSpecs(storeId);
    const couponSpec = dto.couponId
      ? await this.marketing.couponAsSpec(dto.couponId, customerId)
      : null;
    if (dto.couponId && !couponSpec) throw new BusinessError('COUPON_INVALID');
    const priced = computePricing({
      lines: lines.map((l) => ({
        dishId: l.dishId.toString(),
        amount: Number(l.amount),
        status: 'pending',
      })),
      channel: 'delivery',
      rules,
      coupon: couponSpec,
      deliveryFee: Number(deliveryFee),
      memberPercent: customer?.memberLevel?.discountPercent ?? 0,
    });
    // 渠道不符 / 未满门槛时不算优惠，禁止核销废券
    if (dto.couponId && !priced.snapshot.coupon) {
      throw new BusinessError('COUPON_NOT_APPLICABLE');
    }
    const total = BigInt(priced.total);

    const timeline: TimelineEntry[] = [
      { status: OrderStatus.pending, at: new Date().toISOString(), by: customerId },
    ];
    const snapshot = {
      contactName: address.contactName,
      phone: address.phone,
      addressText: address.addressText,
      detail: address.detail,
      landmarkPhoto: address.landmarkPhoto ?? null,
      lat: Number(address.lat),
      lng: Number(address.lng),
      distanceKm: Math.round(distanceKm * 100) / 100,
    };

    const orderId = await this.prisma.$transaction(async (tx) => {
      for (const line of lines) {
        const dish = await tx.dish.findUnique({ where: { id: line.dishId } });
        if (!dish || dish.status !== 'on') throw new BusinessError('DISH_NOT_AVAILABLE');
        if (dish.dailyStock != null && dish.dailyStock - dish.soldToday < line.qty) {
          throw new BusinessError('DISH_SOLD_OUT');
        }
        if (dish.stock != null) {
          const updated = await tx.dish.updateMany({
            where: { id: line.dishId, stock: { gte: line.qty } },
            data: { stock: { decrement: line.qty }, soldToday: { increment: line.qty } },
          });
          if (updated.count === 0) throw new BusinessError('DISH_SOLD_OUT');
        } else {
          await tx.dish.update({
            where: { id: line.dishId },
            data: { soldToday: { increment: line.qty } },
          });
        }
      }

      const order = await tx.order.create({
        data: {
          storeId: store.id,
          orderNo: this.orderNo(),
          type: OrderType.delivery,
          source: OrderSource.h5,
          customerId: BigInt(customerId),
          couponId: dto.couponId ? BigInt(dto.couponId) : null,
          addressSnapshot: snapshot,
          status: OrderStatus.pending,
          subtotal: BigInt(priced.subtotal),
          discount: BigInt(priced.discount),
          deliveryFee,
          total,
          memberPriority: perk.priority,
          promoSnapshot: { ...priced.snapshot, manualDiscount: 0, deliveryFeeOff: perk.off },
          payMethod: dto.payMethod as PaymentMethod,
          remark: dto.remark,
          statusTimeline: timeline,
          paymentStatus: PaymentStatus.unpaid,
        },
      });
      const batch = await tx.orderBatch.create({
        data: { orderId: order.id, roundNo: 1, source: OrderSource.h5 },
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
            status: OrderItemStatus.pending,
          },
        });
        await this.inventory.consumeRecipe(tx, store.id, line.dishId, line.qty, {
          refType: 'order',
          refId: order.id.toString(),
        });
      }
      if (dto.couponId) {
        await this.marketing.markCouponUsed(tx, dto.couponId, order.id);
      }
      await tx.payment.create({
        data: {
          orderId: order.id,
          method: dto.payMethod as PaymentMethod,
          amount: total,
          received: 0,
          change: 0,
        },
      });
      return order.id;
    });

    const full = await this.getFull(orderId);
    const mapped = this.mapOrder(full!);
    this.events.emit(Events.DELIVERY_NEW, { storeId, order: mapped });
    this.events.emit(Events.ORDER_CREATED, { storeId, order: mapped });
    this.events.emit(Events.ORDER_BATCH_ADDED, {
      storeId,
      orderId: mapped.id,
      roundNo: 1,
      batch: mapped.batches[0],
      order: mapped,
      // 待接单前不打印，接单后再打
      needConfirm: true,
    });
    this.events.emit(Events.ORDER_STATUS_CHANGED, { storeId, order: mapped });
    return mapped;
  }

  /** H5 团餐：按套餐直接下外卖单 */
  async placeGroupComboOrder(storeId: string, customerId: string, dto: PlaceGroupMealOrderDto) {
    const store = await this.prisma.store.findUnique({ where: { id: BigInt(storeId) } });
    if (!store) throw new BusinessError('STORE_REQUIRED');
    if (store.lat == null || store.lng == null) throw new BusinessError('STORE_LOCATION_MISSING');
    if (!getStoreOpenStatus(new Date(), store.businessHours as BusinessHours | null).openNow) {
      throw new BusinessError('STORE_CLOSED');
    }

    const address = await this.prisma.customerAddress.findFirst({
      where: { id: BigInt(dto.addressId), customerId: BigInt(customerId) },
    });
    if (!address || address.lat == null || address.lng == null) {
      throw new BusinessError('ADDRESS_REQUIRED');
    }
    const distanceKm = haversineKm(
      Number(store.lat),
      Number(store.lng),
      Number(address.lat),
      Number(address.lng),
    );
    if (distanceKm > Number(store.deliveryRadiusKm)) throw new BusinessError('OUT_OF_DELIVERY_RANGE');
    const rawFee = calcDeliveryFee(distanceKm, (store.deliveryFeeRules as DeliveryFeeRule[]) || []);
    const perk = await this.members.deliveryPerk(customerId, rawFee);
    const deliveryFee = BigInt(perk.fee);

    const combo = await this.comboService.getComboForOrder(BigInt(dto.comboId), store.id);
    if (!combo.isGroupMeal || !combo.isDelivery) throw new BusinessError('COMBO_NOT_FOUND');
    const qty = dto.qty ?? 1;
    if (combo.servingSize && dto.guestCount < combo.servingSize) {
      throw new BusinessError('GROUP_MEAL_GUEST_TOO_FEW');
    }

    const groupMap = new Map(combo.groups.map((g) => [g.id.toString(), g]));
    for (const sel of dto.selections) {
      const group = groupMap.get(sel.groupId);
      if (!group) throw new BusinessError('COMBO_GROUP_NOT_FOUND');
      const count = sel.dishIds.length;
      if (count < group.minSelect) throw new BusinessError('COMBO_SELECT_TOO_FEW');
      if (count > group.maxSelect) throw new BusinessError('COMBO_SELECT_TOO_MANY');
      const validIds = new Set(group.items.map((i) => i.dishId.toString()));
      for (const did of sel.dishIds) {
        if (!validIds.has(did)) throw new BusinessError('COMBO_DISH_NOT_IN_GROUP');
      }
    }

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
        const item = group.items.find((i) => i.dishId.toString() === did)!;
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

    const unitPrice = combo.takeawayPrice + extraTotal;
    const lineAmount = unitPrice * BigInt(qty);
    const subtotal = lineAmount;
    if (subtotal < store.minOrderAmount) throw new BusinessError('BELOW_MIN_ORDER');

    const customer = await this.prisma.customer.findUnique({
      where: { id: BigInt(customerId) },
      include: { memberLevel: true },
    });
    const rules = await this.marketing.activeRulesAsSpecs(storeId);
    const priced = computePricing({
      lines: [{ dishId: `combo:${combo.id}`, amount: Number(subtotal), status: 'pending' }],
      channel: 'delivery',
      rules,
      coupon: null,
      deliveryFee: Number(deliveryFee),
      memberPercent: customer?.memberLevel?.discountPercent ?? 0,
    });
    const total = BigInt(priced.total);
    const timeline: TimelineEntry[] = [
      { status: OrderStatus.pending, at: new Date().toISOString(), by: customerId },
    ];
    const snapshot = {
      contactName: address.contactName,
      phone: address.phone,
      addressText: address.addressText,
      detail: address.detail,
      landmarkPhoto: address.landmarkPhoto ?? null,
      lat: Number(address.lat),
      lng: Number(address.lng),
      distanceKm: Math.round(distanceKm * 100) / 100,
      guestCount: dto.guestCount,
      groupMeal: true,
    };

    const orderId = await this.prisma.$transaction(async (tx) => {
      for (const sel of dto.selections) {
        for (const did of sel.dishIds) {
          const dishId = BigInt(did);
          const dish = await tx.dish.findUnique({ where: { id: dishId } });
          if (!dish || dish.status !== 'on') throw new BusinessError('DISH_NOT_AVAILABLE');
          if (dish.dailyStock != null && dish.dailyStock - dish.soldToday < qty) {
            throw new BusinessError('DISH_SOLD_OUT');
          }
          if (dish.stock != null) {
            const updated = await tx.dish.updateMany({
              where: { id: dishId, stock: { gte: qty } },
              data: { stock: { decrement: qty }, soldToday: { increment: qty } },
            });
            if (updated.count === 0) throw new BusinessError('DISH_SOLD_OUT');
          } else {
            await tx.dish.update({
              where: { id: dishId },
              data: { soldToday: { increment: qty } },
            });
          }
        }
      }

      const order = await tx.order.create({
        data: {
          storeId: store.id,
          orderNo: this.orderNo(),
          type: OrderType.delivery,
          source: OrderSource.h5,
          customerId: BigInt(customerId),
          addressSnapshot: snapshot,
          status: OrderStatus.pending,
          subtotal: BigInt(priced.subtotal),
          discount: BigInt(priced.discount),
          deliveryFee,
          total,
          memberPriority: perk.priority,
          promoSnapshot: {
            ...priced.snapshot,
            manualDiscount: 0,
            guestCount: dto.guestCount,
            deliveryFeeOff: perk.off,
          },
          payMethod: dto.payMethod as PaymentMethod,
          remark: dto.remark,
          statusTimeline: timeline,
          paymentStatus: PaymentStatus.unpaid,
        },
      });
      const batch = await tx.orderBatch.create({
        data: { orderId: order.id, roundNo: 1, source: OrderSource.h5 },
      });
      await tx.orderItem.create({
        data: {
          orderId: order.id,
          batchId: batch.id,
          dishId: null,
          comboId: combo.id,
          nameZh: combo.nameZh,
          nameVi: combo.nameVi,
          originUnitPrice: unitPrice,
          unitPrice,
          qty,
          amount: lineAmount,
          optionsSnapshot: optionsSnapshot as unknown as Prisma.InputJsonValue,
          status: OrderItemStatus.pending,
        },
      });
      for (const sel of dto.selections) {
        for (const did of sel.dishIds) {
          await this.inventory.consumeRecipe(tx, store.id, BigInt(did), qty, {
            refType: 'order',
            refId: order.id.toString(),
          });
        }
      }
      await tx.payment.create({
        data: {
          orderId: order.id,
          method: dto.payMethod as PaymentMethod,
          amount: total,
          received: 0,
          change: 0,
        },
      });
      return order.id;
    });

    const full = await this.getFull(orderId);
    const mapped = this.mapOrder(full!);
    this.events.emit(Events.DELIVERY_NEW, { storeId, order: mapped });
    this.events.emit(Events.ORDER_CREATED, { storeId, order: mapped });
    this.events.emit(Events.ORDER_BATCH_ADDED, {
      storeId,
      orderId: mapped.id,
      roundNo: 1,
      batch: mapped.batches[0],
      order: mapped,
      needConfirm: true,
    });
    this.events.emit(Events.ORDER_STATUS_CHANGED, { storeId, order: mapped });
    return mapped;
  }

  async listMine(customerId: string) {
    // 含堂食/外卖/自取；团餐落在 delivery + addressSnapshot.groupMeal
    const rows = await this.prisma.order.findMany({
      where: { customerId: BigInt(customerId) },
      include: {
        batches: { include: { items: true } },
        items: true,
        payments: true,
        customer: true,
        courier: true,
        tableSession: { include: { table: { select: { code: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => this.mapOrder(r));
  }

  async detailForCustomer(customerId: string, orderId: string) {
    const full = await this.getFull(BigInt(orderId));
    if (!full || full.customerId?.toString() !== customerId) {
      throw new BusinessError('ORDER_NOT_FOUND');
    }
    return this.mapOrder(full);
  }

  async cancelByCustomer(customerId: string, orderId: string, dto: CancelOrderDto) {
    const order = await this.prisma.order.findFirst({
      where: { id: BigInt(orderId), customerId: BigInt(customerId), type: OrderType.delivery },
      include: { items: true },
    });
    if (!order) throw new BusinessError('ORDER_NOT_FOUND');
    if (order.status !== OrderStatus.pending) throw new BusinessError('ORDER_CANNOT_CANCEL');

    await this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        if (item.status === OrderItemStatus.voided) continue;
        if (item.dishId != null) {
          const dish = await tx.dish.findUnique({ where: { id: item.dishId } });
          if (dish?.stock != null) {
            await tx.dish.update({
              where: { id: item.dishId },
              data: { stock: { increment: item.qty }, soldToday: { decrement: item.qty } },
            });
          } else if (dish) {
            await tx.dish.update({
              where: { id: item.dishId },
              data: { soldToday: { decrement: item.qty } },
            });
          }
          await this.inventory.restoreRecipe(tx, order.storeId, item.dishId, item.qty, {
            refType: 'order_item',
            refId: item.id.toString(),
          });
        }
        await tx.orderItem.update({
          where: { id: item.id },
          data: { status: OrderItemStatus.voided, voidReason: dto.reason || 'customer cancel' },
        });
      }
      const timeline = this.appendTimeline(order.statusTimeline, {
        status: OrderStatus.cancelled,
        at: new Date().toISOString(),
        by: customerId,
        reason: dto.reason,
      });
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.cancelled,
          cancelReason: dto.reason || 'customer cancel',
          statusTimeline: timeline,
        },
      });
    });

    const full = await this.getFull(order.id);
    const mapped = this.mapOrder(full!);
    this.events.emit(Events.ORDER_CANCELLED, {
      storeId: order.storeId.toString(),
      order: mapped,
    });
    this.events.emit(Events.DELIVERY_STATUS_CHANGED, {
      storeId: order.storeId.toString(),
      order: mapped,
    });
    this.events.emit(Events.ORDER_STATUS_CHANGED, {
      storeId: order.storeId.toString(),
      order: mapped,
    });
    return mapped;
  }

  /** 管理端状态流转 */
  async transition(
    storeId: string,
    orderId: string,
    next: OrderStatus,
    opts: { userId: string; reason?: string; courierId?: string },
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id: BigInt(orderId), storeId: BigInt(storeId), type: OrderType.delivery },
      include: { items: true },
    });
    if (!order) throw new BusinessError('ORDER_NOT_FOUND');

    const allowed: Record<string, OrderStatus[]> = {
      [OrderStatus.pending]: [OrderStatus.accepted, OrderStatus.rejected],
      [OrderStatus.accepted]: [OrderStatus.cooking, OrderStatus.cancelled],
      [OrderStatus.cooking]: [OrderStatus.delivering, OrderStatus.cancelled],
      [OrderStatus.delivering]: [OrderStatus.completed, OrderStatus.cancelled],
    };
    if (!(allowed[order.status] || []).includes(next)) {
      throw new BusinessError('ORDER_STATUS_INVALID');
    }
    if (next === OrderStatus.rejected && !opts.reason) {
      throw new BusinessError('REJECT_REASON_REQUIRED');
    }

    await this.prisma.$transaction(async (tx) => {
      if (next === OrderStatus.rejected || next === OrderStatus.cancelled) {
        for (const item of order.items) {
          if (item.status === OrderItemStatus.voided) continue;
          if (item.dishId != null) {
            const dish = await tx.dish.findUnique({ where: { id: item.dishId } });
            if (dish?.stock != null) {
              await tx.dish.update({
                where: { id: item.dishId },
                data: { stock: { increment: item.qty }, soldToday: { decrement: item.qty } },
              });
            } else if (dish) {
              await tx.dish.update({
                where: { id: item.dishId },
                data: { soldToday: { decrement: item.qty } },
              });
            }
            await this.inventory.restoreRecipe(tx, order.storeId, item.dishId, item.qty, {
              refType: 'order_item',
              refId: item.id.toString(),
            });
          }
          await tx.orderItem.update({
            where: { id: item.id },
            data: { status: OrderItemStatus.voided, voidReason: opts.reason || next },
          });
        }
      }

      const timeline = this.appendTimeline(order.statusTimeline, {
        status: next,
        at: new Date().toISOString(),
        by: opts.userId,
        reason: opts.reason,
      });

      const data: Prisma.OrderUpdateInput = {
        status: next,
        statusTimeline: timeline,
        cancelReason: opts.reason,
      };
      if (opts.courierId) {
        data.courier = { connect: { id: BigInt(opts.courierId) } };
      }
      if (next === OrderStatus.completed) {
        data.paymentStatus = PaymentStatus.paid;
        data.paidAmount = order.total;
      }
      await tx.order.update({ where: { id: order.id }, data });
    });

    const full = await this.getFull(order.id);
    const mapped = this.mapOrder(full!);

    this.events.emit(Events.DELIVERY_STATUS_CHANGED, { storeId, order: mapped });
    this.events.emit(Events.ORDER_STATUS_CHANGED, { storeId, order: mapped });

    if (next === OrderStatus.accepted) {
      // 接单触发打印
      this.events.emit(Events.ORDER_BATCH_ADDED, {
        storeId,
        orderId: mapped.id,
        roundNo: 1,
        batch: mapped.batches[0],
        order: mapped,
        confirmed: true,
      });
    }
    if (next === OrderStatus.rejected || next === OrderStatus.cancelled) {
      this.events.emit(Events.ORDER_CANCELLED, { storeId, order: mapped, userId: opts.userId });
    }
    if (next === OrderStatus.completed) {
      this.events.emit(Events.ORDER_PAID, { storeId, order: mapped, userId: opts.userId });
    }

    const auditAction =
      next === OrderStatus.accepted
        ? 'delivery.accept'
        : next === OrderStatus.rejected
          ? 'delivery.reject'
          : next === OrderStatus.cancelled
            ? 'delivery.cancel'
            : null;
    if (auditAction) {
      await this.audit.log({
        userId: opts.userId,
        storeId,
        module: 'delivery',
        action: auditAction,
        targetType: 'order',
        targetId: orderId,
        after: { status: next, reason: opts.reason, courierId: opts.courierId },
      });
    }

    return mapped;
  }

  async assignCourier(storeId: string, orderId: string, courierId: string, userId: string) {
    const courier = await this.prisma.user.findFirst({
      where: { id: BigInt(courierId), storeId: BigInt(storeId), status: 'active' },
    });
    if (!courier) throw new BusinessError('COURIER_NOT_FOUND');
    const order = await this.prisma.order.findFirst({
      where: { id: BigInt(orderId), storeId: BigInt(storeId), type: OrderType.delivery },
    });
    if (!order) throw new BusinessError('ORDER_NOT_FOUND');
    await this.prisma.order.update({
      where: { id: order.id },
      data: { courierId: courier.id },
    });
    const full = await this.getFull(order.id);
    const mapped = this.mapOrder(full!);
    this.events.emit(Events.DELIVERY_STATUS_CHANGED, { storeId, order: mapped, userId });
    return mapped;
  }

  /** 待接单外卖数量（菜单角标） */
  async countPendingAccept(storeId: string): Promise<number> {
    return this.prisma.order.count({
      where: {
        storeId: BigInt(storeId),
        type: OrderType.delivery,
        status: OrderStatus.pending,
      },
    });
  }

  async adminList(
    storeId: string,
    query?: {
      status?: string;
      keyword?: string;
      from?: string;
      to?: string;
      paymentStatus?: string;
    },
  ) {
    const where: Prisma.OrderWhereInput = {
      storeId: BigInt(storeId),
      type: OrderType.delivery,
    };
    if (query?.status) where.status = query.status as OrderStatus;
    if (query?.paymentStatus && Object.values(PaymentStatus).includes(query.paymentStatus as PaymentStatus)) {
      where.paymentStatus = query.paymentStatus as PaymentStatus;
    }
    if (query?.from || query?.to) {
      where.createdAt = {};
      if (query.from) {
        const d = new Date(query.from);
        if (!Number.isNaN(d.getTime())) where.createdAt.gte = d;
      }
      if (query.to) {
        const d = new Date(query.to);
        if (!Number.isNaN(d.getTime())) where.createdAt.lte = d;
      }
    }
    const kw = query?.keyword?.trim();
    if (kw) {
      where.OR = [
        { orderNo: { contains: kw } },
        { customer: { is: { name: { contains: kw } } } },
        { customer: { is: { phone: { contains: kw } } } },
        { customer: { is: { email: { contains: kw } } } },
      ];
    }
    const rows = await this.prisma.order.findMany({
      where,
      include: {
        batches: { include: { items: true } },
        items: true,
        payments: true,
        customer: true,
        courier: true,
      },
      orderBy: [{ memberPriority: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    // 地址在 JSON 快照里，关键词再做一次内存过滤（含门牌/地址）
    const mapped = rows.map((r) => this.mapOrder(r));
    if (!kw) return mapped;
    const lower = kw.toLowerCase();
    return mapped.filter((o) => {
      const addr =
        o.addressSnapshot && typeof o.addressSnapshot === 'object' && !Array.isArray(o.addressSnapshot)
          ? (o.addressSnapshot as Record<string, unknown>)
          : null;
      const hay = [
        o.orderNo,
        o.customer?.name,
        o.customer?.phone,
        o.customer?.email,
        o.courierName,
        addr?.addressText,
        addr?.contactName,
        addr?.phone,
        addr?.detail,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(lower);
    });
  }

  async listCustomers(storeId: string) {
    // 有本店外卖单的顾客
    const rows = await this.prisma.customer.findMany({
      where: { orders: { some: { storeId: BigInt(storeId), type: OrderType.delivery } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { _count: { select: { orders: true } } },
    });
    return rows.map((c) => ({
      id: c.id.toString(),
      email: c.email,
      name: c.name,
      phone: c.phone,
      lang: c.lang,
      orderCount: c._count.orders,
      createdAt: c.createdAt,
    }));
  }
}
