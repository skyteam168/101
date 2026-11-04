import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import {
  BatchPrintStatus,
  OrderItemStatus,
  OrderSource,
  OrderStatus,
  OrderType,
  Prisma,
  SessionStatus,
  TableStatus,
} from '@prisma/client';
import { Events } from '@restaurant/shared';
import { randomBytes, randomInt, randomUUID } from 'crypto';
import { BusinessError } from '../../common/errors/business.error';
import { GuestUser } from '../../common/decorators/guest.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { InventoryService } from '../inventory/inventory.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AddCartItemsDto, JoinTableDto, PatchCartItemDto } from './dto/public-table.dto';

export type CartLine = {
  id: string;
  dishId: string;
  nameZh: string;
  nameVi: string;
  unitPrice: number;
  qty: number;
  amount: number;
  optionsSnapshot: unknown;
  nickname: string;
  guestId: string;
};

@Injectable()
export class PublicTableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
    private readonly realtime: RealtimeGateway,
    private readonly inventory: InventoryService,
  ) {}

  private cartKey(sessionId: string) {
    return `cart:${sessionId}`;
  }

  private lockKey(sessionId: string) {
    return `lock:order-submit:${sessionId}`;
  }

  private token() {
    return randomBytes(16).toString('hex');
  }

  private pin() {
    return String(randomInt(0, 10000)).padStart(4, '0');
  }

  async peek(qrToken: string) {
    const table = await this.prisma.table.findUnique({
      where: { qrToken },
      include: {
        store: true,
        area: true,
        currentSession: true,
      },
    });
    if (!table) throw new BusinessError('TABLE_NOT_FOUND');
    return {
      tableId: table.id.toString(),
      code: table.code,
      seats: table.seats,
      status: table.status,
      storeId: table.storeId.toString(),
      storeNameZh: table.store.nameZh,
      storeNameVi: table.store.nameVi,
      areaNameZh: table.area.nameZh,
      areaNameVi: table.area.nameVi,
      qrAutoOpen: table.store.qrAutoOpen,
      qrRequirePin: table.store.qrRequirePin,
      needPin: table.status === TableStatus.dining && table.store.qrRequirePin,
      hasSession: !!table.currentSessionId,
    };
  }

  async join(qrToken: string, dto: JoinTableDto) {
    const table = await this.prisma.table.findUnique({
      where: { qrToken },
      include: { store: true, currentSession: true },
    });
    if (!table) throw new BusinessError('TABLE_NOT_FOUND');
    if (table.status === TableStatus.cleaning) {
      throw new BusinessError('TABLE_IS_CLEANING');
    }

    let session = table.currentSession;
    let sessionId = table.currentSessionId;

    if (table.status === TableStatus.idle || !sessionId || !session) {
      if (!table.store.qrAutoOpen) {
        throw new BusinessError('TABLE_NOT_OPEN');
      }
      const created = await this.prisma.$transaction(async (tx) => {
        const s = await tx.tableSession.create({
          data: {
            tableId: table.id,
            guestCount: dto.guestCount ?? 1,
            pin: this.pin(),
            sessionToken: this.token(),
            status: SessionStatus.open,
          },
        });
        await tx.table.update({
          where: { id: table.id },
          data: { status: TableStatus.dining, currentSessionId: s.id },
        });
        return s;
      });
      session = created;
      sessionId = created.id;
      this.events.emit(Events.TABLE_STATUS_CHANGED, {
        storeId: table.storeId.toString(),
        tableId: table.id.toString(),
        status: TableStatus.dining,
      });
    } else {
      if (table.store.qrRequirePin) {
        if (!dto.pin || dto.pin !== session.pin) {
          throw new BusinessError('TABLE_PIN_INVALID');
        }
      }
      if (session.status !== SessionStatus.open) {
        throw new BusinessError('TABLE_NOT_DINING');
      }
    }

    const guestId = randomUUID();
    const guestToken = await this.jwt.signAsync(
      {
        typ: 'guest',
        sub: guestId,
        nickname: dto.nickname,
        sessionId: sessionId!.toString(),
        tableId: table.id.toString(),
        storeId: table.storeId.toString(),
      },
      {
        secret: this.config.get<string>('JWT_SECRET') ?? 'dev-secret-change-me',
        expiresIn: '12h',
      },
    );

    const cart = await this.getCart(sessionId!.toString());
    return {
      guestToken,
      guestId,
      nickname: dto.nickname,
      tableId: table.id.toString(),
      tableCode: table.code,
      storeId: table.storeId.toString(),
      sessionId: sessionId!.toString(),
      pin: session!.pin,
      sessionToken: session!.sessionToken,
      cart,
    };
  }

  async getCart(sessionId: string): Promise<CartLine[]> {
    const raw = await this.redis.get(this.cartKey(sessionId));
    if (!raw) return [];
    try {
      return JSON.parse(raw) as CartLine[];
    } catch {
      return [];
    }
  }

  private async saveCart(
    sessionId: string,
    storeId: string,
    items: CartLine[],
    actor?: {
      guestId: string;
      nickname: string;
      /** add=加菜；change=改他人/自己数量；remove=删除一行 */
      action: 'add' | 'change' | 'remove';
      dishNameZh: string;
      dishNameVi: string;
      qtyBefore?: number;
      qtyAfter?: number;
      /** 被改动那一行的归属客人（改别人菜时用于提示对方） */
      ownerGuestId?: string;
      ownerNickname?: string;
    },
  ) {
    await this.redis.set(this.cartKey(sessionId), JSON.stringify(items), 24 * 3600);
    const payload = {
      sessionId,
      storeId,
      items,
      total: items.reduce((s, i) => s + i.amount, 0),
      actor: actor ?? null,
    };
    this.events.emit(Events.CART_UPDATED, payload);
    this.realtime.emitCartUpdated(sessionId, payload);
    return items;
  }

  /** 规格快照稳定序列化，用于同人同菜合并判断 */
  private optionsKey(snapshot: unknown): string {
    if (snapshot == null) return '';
    if (!Array.isArray(snapshot)) {
      try {
        return JSON.stringify(snapshot);
      } catch {
        return '';
      }
    }
    const norm = snapshot.map((o) => {
      const x = o as {
        groupNameZh?: string;
        groupNameVi?: string;
        optionNameZh?: string;
        optionNameVi?: string;
        extraPrice?: number;
      };
      return {
        g: x.groupNameZh ?? x.groupNameVi ?? '',
        o: x.optionNameZh ?? x.optionNameVi ?? '',
        p: Number(x.extraPrice ?? 0),
      };
    });
    norm.sort((a, b) => `${a.g}|${a.o}`.localeCompare(`${b.g}|${b.o}`));
    return JSON.stringify(norm);
  }

  async addCartItems(guest: GuestUser, dto: AddCartItemsDto) {
    await this.assertSession(guest);
    const cart = await this.getCart(guest.sessionId);
    let lastDishNameZh = '';
    let lastDishNameVi = '';
    let lastAddedQty = 0;
    for (const raw of dto.items) {
      const dish = await this.prisma.dish.findFirst({
        where: { id: BigInt(raw.dishId), storeId: BigInt(guest.storeId), status: 'on', isDineIn: true },
      });
      if (!dish) throw new BusinessError('DISH_NOT_AVAILABLE');
      let extra = 0n;
      const optionsSnapshot = raw.optionsSnapshot ?? null;
      if (Array.isArray(optionsSnapshot)) {
        for (const opt of optionsSnapshot as Array<{ extraPrice?: number }>) {
          extra += BigInt(opt.extraPrice ?? 0);
        }
      }
      const unitPrice = Number(dish.price + extra);
      const qty = raw.qty;
      const dishId = dish.id.toString();
      const optKey = this.optionsKey(optionsSnapshot);
      // 仅合并：同一人 + 同一菜 + 同一规格
      const existing = cart.find(
        (c) =>
          c.guestId === guest.guestId &&
          c.dishId === dishId &&
          this.optionsKey(c.optionsSnapshot) === optKey,
      );
      if (existing) {
        existing.qty += qty;
        existing.amount = existing.unitPrice * existing.qty;
        existing.nickname = guest.nickname;
      } else {
        cart.push({
          id: randomUUID(),
          dishId,
          nameZh: dish.nameZh,
          nameVi: dish.nameVi,
          unitPrice,
          qty,
          amount: unitPrice * qty,
          optionsSnapshot,
          nickname: guest.nickname,
          guestId: guest.guestId,
        });
      }
      lastDishNameZh = dish.nameZh;
      lastDishNameVi = dish.nameVi;
      lastAddedQty = qty;
    }
    return this.saveCart(guest.sessionId, guest.storeId, cart, {
      guestId: guest.guestId,
      nickname: guest.nickname,
      action: 'add',
      dishNameZh: lastDishNameZh,
      dishNameVi: lastDishNameVi,
      qtyAfter: lastAddedQty,
      ownerGuestId: guest.guestId,
      ownerNickname: guest.nickname,
    });
  }

  async patchCartItem(guest: GuestUser, itemId: string, dto: PatchCartItemDto) {
    await this.assertSession(guest);
    let cart = await this.getCart(guest.sessionId);
    const idx = cart.findIndex((c) => c.id === itemId);
    if (idx < 0) throw new BusinessError('CART_ITEM_NOT_FOUND');
    const line = cart[idx];
    const qtyBefore = line.qty;
    const ownerGuestId = line.guestId;
    const ownerNickname = line.nickname;
    const dishNameZh = line.nameZh;
    const dishNameVi = line.nameVi;
    if (dto.qty <= 0) {
      cart = cart.filter((c) => c.id !== itemId);
      return this.saveCart(guest.sessionId, guest.storeId, cart, {
        guestId: guest.guestId,
        nickname: guest.nickname,
        action: 'remove',
        dishNameZh,
        dishNameVi,
        qtyBefore,
        qtyAfter: 0,
        ownerGuestId,
        ownerNickname,
      });
    }
    cart[idx].qty = dto.qty;
    cart[idx].amount = cart[idx].unitPrice * dto.qty;
    return this.saveCart(guest.sessionId, guest.storeId, cart, {
      guestId: guest.guestId,
      nickname: guest.nickname,
      action: 'change',
      dishNameZh,
      dishNameVi,
      qtyBefore,
      qtyAfter: dto.qty,
      ownerGuestId,
      ownerNickname,
    });
  }

  async removeCartItem(guest: GuestUser, itemId: string) {
    return this.patchCartItem(guest, itemId, { qty: 0 });
  }

  async clearMyCart(guest: GuestUser) {
    await this.assertSession(guest);
    const cart = (await this.getCart(guest.sessionId)).filter((c) => c.guestId !== guest.guestId);
    return this.saveCart(guest.sessionId, guest.storeId, cart, {
      guestId: guest.guestId,
      nickname: guest.nickname,
      action: 'remove',
      dishNameZh: '',
      dishNameVi: '',
      ownerGuestId: guest.guestId,
      ownerNickname: guest.nickname,
    });
  }

  private async assertSession(guest: GuestUser) {
    const session = await this.prisma.tableSession.findUnique({
      where: { id: BigInt(guest.sessionId) },
      include: { table: true },
    });
    if (!session || session.status !== SessionStatus.open) {
      throw new BusinessError('TABLE_NOT_DINING');
    }
    if (session.table.currentSessionId?.toString() !== guest.sessionId) {
      throw new BusinessError('TABLE_NOT_DINING');
    }
  }

  async sessionState(guest: GuestUser) {
    await this.assertSession(guest);
    const cart = await this.getCart(guest.sessionId);
    const order = await this.prisma.order.findFirst({
      where: {
        tableSessionId: BigInt(guest.sessionId),
        status: OrderStatus.open,
      },
      include: {
        batches: { include: { items: true }, orderBy: { roundNo: 'asc' } },
        items: true,
        payments: true,
        tableSession: { include: { table: true } },
      },
    });
    return {
      cart,
      cartTotal: cart.reduce((s, i) => s + i.amount, 0),
      order: order ? this.mapOrder(order) : null,
    };
  }

  private mapOrder(
    o: Prisma.OrderGetPayload<{
      include: {
        batches: { include: { items: true } };
        items: true;
        payments: true;
        tableSession: { include: { table: true } };
      };
    }>,
  ) {
    return {
      id: o.id.toString(),
      orderNo: o.orderNo,
      status: o.status,
      subtotal: Number(o.subtotal),
      discount: Number(o.discount),
      serviceCharge: Number(o.serviceCharge),
      total: Number(o.total),
      tableCode: o.tableSession?.table?.code ?? null,
      tableSessionId: o.tableSessionId?.toString() ?? null,
      batches: o.batches.map((b) => ({
        id: b.id.toString(),
        roundNo: b.roundNo,
        source: b.source,
        guestNickname: b.guestNickname,
        printStatus: b.printStatus,
        createdAt: b.createdAt,
        items: b.items.map((it) => ({
          id: it.id.toString(),
          nameZh: it.nameZh,
          nameVi: it.nameVi,
          unitPrice: Number(it.unitPrice),
          qty: it.qty,
          amount: Number(it.amount),
          status: it.status,
          guestNickname: it.guestNickname,
        })),
      })),
    };
  }

  /** Redis 锁防重复提交共享购物车 */
  async submitCart(guest: GuestUser) {
    await this.assertSession(guest);
    const locked = await this.redis.setNx(this.lockKey(guest.sessionId), guest.guestId, 8);
    if (!locked) throw new BusinessError('ORDER_SUBMIT_BUSY');

    try {
      const cart = await this.getCart(guest.sessionId);
      if (!cart.length) throw new BusinessError('CART_EMPTY');

      const store = await this.prisma.store.findUnique({ where: { id: BigInt(guest.storeId) } });
      if (!store) throw new BusinessError('STORE_REQUIRED');
      const needConfirm = store.qrOrderNeedConfirm;
      const printStatus = needConfirm ? BatchPrintStatus.need_confirm : BatchPrintStatus.pending;

      const orderId = await this.prisma.$transaction(async (tx) => {
        let order = await tx.order.findFirst({
          where: {
            tableSessionId: BigInt(guest.sessionId),
            status: OrderStatus.open,
          },
          include: { batches: { orderBy: { roundNo: 'desc' }, take: 1 } },
        });

        // 聚合扣库存
        for (const line of cart) {
          await this.deductStock(tx, BigInt(line.dishId), line.qty);
        }

        if (!order) {
          const subtotal = cart.reduce((s, i) => s + BigInt(i.amount), 0n);
          order = await tx.order.create({
            data: {
              storeId: BigInt(guest.storeId),
              orderNo: this.orderNo(),
              type: OrderType.dine_in,
              source: OrderSource.qr,
              tableSessionId: BigInt(guest.sessionId),
              status: OrderStatus.open,
              subtotal,
              total: subtotal,
            },
            include: { batches: { orderBy: { roundNo: 'desc' }, take: 1 } },
          });
        }

        const nextRound = (order.batches[0]?.roundNo ?? 0) + 1;
        const batch = await tx.orderBatch.create({
          data: {
            orderId: order.id,
            roundNo: nextRound,
            source: OrderSource.qr,
            guestNickname: guest.nickname,
            printStatus,
          },
        });

        for (const line of cart) {
          await tx.orderItem.create({
            data: {
              orderId: order.id,
              batchId: batch.id,
              dishId: BigInt(line.dishId),
              nameZh: line.nameZh,
              nameVi: line.nameVi,
              unitPrice: BigInt(line.unitPrice),
              qty: line.qty,
              amount: BigInt(line.amount),
              optionsSnapshot:
                line.optionsSnapshot === undefined || line.optionsSnapshot === null
                  ? Prisma.JsonNull
                  : (line.optionsSnapshot as Prisma.InputJsonValue),
              guestNickname: line.nickname,
              status: OrderItemStatus.pending,
            },
          });
          await this.inventory.consumeRecipe(
            tx,
            BigInt(guest.storeId),
            BigInt(line.dishId),
            line.qty,
            { refType: 'order', refId: order.id.toString() },
          );
        }

        const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
        const subtotal = items
          .filter((i) => i.status !== OrderItemStatus.voided)
          .reduce((s, i) => s + i.amount, 0n);
        const discount = order.discount > subtotal ? subtotal : order.discount;
        await tx.order.update({
          where: { id: order.id },
          data: {
            subtotal,
            discount,
            total: subtotal - discount + order.serviceCharge + order.deliveryFee,
            source: order.source === OrderSource.waiter ? order.source : OrderSource.qr,
          },
        });

        return order.id;
      });

      await this.redis.del(this.cartKey(guest.sessionId));
      this.events.emit(Events.CART_UPDATED, {
        sessionId: guest.sessionId,
        storeId: guest.storeId,
        items: [],
        total: 0,
      });

      const full = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          batches: { include: { items: true }, orderBy: { roundNo: 'asc' } },
          items: true,
          payments: true,
          tableSession: { include: { table: true } },
        },
      });
      const mapped = this.mapOrder(full!);
      const lastBatch = mapped.batches[mapped.batches.length - 1];
      const isFirst = mapped.batches.length === 1;
      const pendingConfirmCount = await this.prisma.orderBatch.count({
        where: {
          printStatus: BatchPrintStatus.need_confirm,
          order: {
            storeId: BigInt(guest.storeId),
            status: OrderStatus.open,
            type: OrderType.dine_in,
          },
        },
      });
      if (isFirst) {
        this.events.emit(Events.ORDER_CREATED, {
          storeId: guest.storeId,
          needConfirm,
          pendingConfirmCount,
          order: { ...mapped, tableSessionId: guest.sessionId },
        });
      }
      this.events.emit(Events.ORDER_BATCH_ADDED, {
        storeId: guest.storeId,
        orderId: mapped.id,
        sessionId: guest.sessionId,
        roundNo: lastBatch?.roundNo,
        batch: lastBatch,
        needConfirm,
        pendingConfirmCount,
        tableCode: mapped.tableCode,
        order: mapped,
      });
      this.events.emit(Events.QR_PENDING_CHANGED, {
        storeId: guest.storeId,
        count: pendingConfirmCount,
      });
      this.events.emit(Events.TABLE_STATUS_CHANGED, {
        storeId: guest.storeId,
        tableId: guest.tableId,
      });

      return mapped;
    } finally {
      await this.redis.del(this.lockKey(guest.sessionId));
    }
  }

  private orderNo() {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    return `Q${stamp}${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
  }

  private async deductStock(tx: Prisma.TransactionClient, dishId: bigint, qty: number) {
    const dish = await tx.dish.findUnique({ where: { id: dishId } });
    if (!dish || dish.status !== 'on' || !dish.isDineIn) {
      throw new BusinessError('DISH_NOT_AVAILABLE');
    }
    if (dish.dailyStock != null && dish.dailyStock - dish.soldToday < qty) {
      throw new BusinessError('DISH_SOLD_OUT');
    }
    if (dish.stock != null) {
      const updated = await tx.dish.updateMany({
        where: { id: dishId, stock: { gte: qty } },
        data: { stock: { decrement: qty }, soldToday: { increment: qty } },
      });
      if (updated.count === 0) throw new BusinessError('DISH_SOLD_OUT');
      return;
    }
    await tx.dish.update({
      where: { id: dishId },
      data: { soldToday: { increment: qty } },
    });
  }

  async callWaiter(guest: GuestUser) {
    await this.assertSession(guest);
    const table = await this.prisma.table.findUnique({ where: { id: BigInt(guest.tableId) } });
    const payload = {
      storeId: guest.storeId,
      sessionId: guest.sessionId,
      tableId: guest.tableId,
      tableCode: table?.code,
      nickname: guest.nickname,
      at: new Date().toISOString(),
    };
    this.events.emit(Events.TABLE_CALL_WAITER, payload);
    return { ok: true };
  }

  async requestBill(guest: GuestUser) {
    await this.assertSession(guest);
    const table = await this.prisma.table.findUnique({ where: { id: BigInt(guest.tableId) } });
    const payload = {
      storeId: guest.storeId,
      sessionId: guest.sessionId,
      tableId: guest.tableId,
      tableCode: table?.code,
      nickname: guest.nickname,
      at: new Date().toISOString(),
    };
    this.events.emit(Events.TABLE_REQUEST_BILL, payload);
    return { ok: true };
  }
}
