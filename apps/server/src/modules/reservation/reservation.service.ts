import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ReservationStatus, TableStatus, Prisma, SessionStatus } from '@prisma/client';
import { Events } from '@restaurant/shared';
import { randomBytes, randomInt } from 'crypto';
import { BusinessError } from '../../common/errors/business.error';
import { PrismaService } from '../../prisma/prisma.service';
import { MemberService } from '../member/member.service';
import { OrderService } from '../order/order.service';
import {
  CancelReservationDto,
  CreateReservationDto,
  PublicCancelReservationDto,
  PublicUpdateReservationDto,
  ReservationItemInputDto,
  ReservationQueryDto,
  SeatReservationDto,
  UpdateReservationDto,
} from './dto/reservation.dto';

type ReservationRow = Prisma.ReservationGetPayload<{
  include: {
    table: { select: { id: true; code: true } };
    area: { select: { id: true; nameZh: true; nameVi: true } };
    items: true;
  };
}>;

@Injectable()
export class ReservationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly members: MemberService,
    private readonly orders: OrderService,
  ) {}

  private token() {
    return randomBytes(16).toString('hex');
  }

  private pin() {
    return String(randomInt(0, 10000)).padStart(4, '0');
  }

  /** 手机号归一：去空白，便于自助查询核验 */
  private normalizePhone(phone: string) {
    return (phone || '').replace(/\s+/g, '').trim();
  }

  private assertPhoneMatch(rowPhone: string, inputPhone: string) {
    if (this.normalizePhone(rowPhone) !== this.normalizePhone(inputPhone)) {
      throw new BusinessError('RESERVATION_PHONE_MISMATCH');
    }
  }

  private mapItem(it: Prisma.ReservationItemGetPayload<object>) {
    return {
      id: it.id.toString(),
      dishId: it.dishId?.toString() ?? null,
      nameZh: it.nameZh,
      nameVi: it.nameVi,
      qty: it.qty,
      unitPrice: Number(it.unitPrice),
      optionsSnapshot: it.optionsSnapshot,
      remark: it.remark,
      sort: it.sort,
    };
  }

  private mapReservation(r: ReservationRow) {
    const items = (r.items || []).map((it) => this.mapItem(it));
    return {
      id: r.id.toString(),
      storeId: r.storeId.toString(),
      customerName: r.customerName,
      phone: r.phone,
      guestCount: r.guestCount,
      reserveAt: r.reserveAt,
      tableId: r.tableId?.toString() ?? null,
      tableCode: r.table?.code ?? null,
      areaId: r.areaId?.toString() ?? null,
      area: r.area
        ? { id: r.area.id.toString(), nameZh: r.area.nameZh, nameVi: r.area.nameVi }
        : null,
      customerId: r.customerId?.toString() ?? null,
      memberPriority: r.memberPriority,
      status: r.status,
      deposit: Number(r.deposit),
      remark: r.remark,
      createdBy: r.createdBy?.toString() ?? null,
      seatedSessionId: r.seatedSessionId?.toString() ?? null,
      items,
      preorderCount: items.reduce((s, i) => s + i.qty, 0),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  private get listInclude() {
    return {
      table: { select: { id: true, code: true } },
      area: { select: { id: true, nameZh: true, nameVi: true } },
      items: { orderBy: { sort: 'asc' as const } },
    } as const;
  }

  /** 解析预点菜：有 dishId 则取菜品名价；否则要求手填名+价 */
  private async resolveItemRows(
    storeId: bigint,
    items: ReservationItemInputDto[] | undefined,
  ): Promise<
    Array<{
      dishId: bigint | null;
      nameZh: string;
      nameVi: string;
      qty: number;
      unitPrice: bigint;
      optionsSnapshot: Prisma.InputJsonValue | typeof Prisma.JsonNull;
      remark: string | null;
      sort: number;
    }>
  > {
    if (!items?.length) return [];
    const rows = [];
    let sort = 0;
    for (const raw of items) {
      if (raw.dishId) {
        const dish = await this.prisma.dish.findFirst({
          where: { id: BigInt(raw.dishId), storeId },
        });
        if (!dish || dish.status !== 'on') {
          throw new BusinessError('DISH_NOT_AVAILABLE');
        }
        let extra = 0n;
        if (Array.isArray(raw.optionsSnapshot)) {
          for (const opt of raw.optionsSnapshot as Array<{ extraPrice?: number }>) {
            extra += BigInt(opt.extraPrice ?? 0);
          }
        }
        rows.push({
          dishId: dish.id,
          nameZh: dish.nameZh,
          nameVi: dish.nameVi,
          qty: raw.qty,
          unitPrice: dish.price + extra,
          optionsSnapshot:
            raw.optionsSnapshot === undefined
              ? Prisma.JsonNull
              : (raw.optionsSnapshot as Prisma.InputJsonValue),
          remark: raw.remark?.trim() || null,
          sort: sort++,
        });
      } else {
        const nameZh = raw.nameZh?.trim();
        if (!nameZh) throw new BusinessError('RESERVATION_ITEM_NAME_REQUIRED');
        rows.push({
          dishId: null,
          nameZh,
          nameVi: raw.nameVi?.trim() || nameZh,
          qty: raw.qty,
          unitPrice: BigInt(raw.unitPrice ?? 0),
          optionsSnapshot: Prisma.JsonNull,
          remark: raw.remark?.trim() || null,
          sort: sort++,
        });
      }
    }
    return rows;
  }

  private async replaceItems(
    tx: Prisma.TransactionClient,
    reservationId: bigint,
    rows: Awaited<ReturnType<ReservationService['resolveItemRows']>>,
  ) {
    await tx.reservationItem.deleteMany({ where: { reservationId } });
    if (!rows.length) return;
    await tx.reservationItem.createMany({
      data: rows.map((r) => ({
        reservationId,
        dishId: r.dishId,
        nameZh: r.nameZh,
        nameVi: r.nameVi,
        qty: r.qty,
        unitPrice: r.unitPrice,
        optionsSnapshot: r.optionsSnapshot,
        remark: r.remark,
        sort: r.sort,
      })),
    });
  }

  async countPending(storeId: string): Promise<number> {
    return this.prisma.reservation.count({
      where: { storeId: BigInt(storeId), status: ReservationStatus.pending },
    });
  }

  private async emitPendingCount(storeId: string) {
    const count = await this.countPending(storeId);
    this.events.emit(Events.RESERVATION_PENDING_CHANGED, { storeId, count });
    return count;
  }

  private emitPreorderChanged(storeId: string) {
    this.events.emit(Events.RESERVATION_PREORDER_CHANGED, { storeId });
  }

  async create(storeId: string, dto: CreateReservationDto, userId?: string | null) {
    const sid = BigInt(storeId);

    if (dto.tableId) {
      const table = await this.prisma.table.findFirst({
        where: { id: BigInt(dto.tableId), storeId: sid },
      });
      if (!table) throw new BusinessError('TABLE_NOT_FOUND');
    }

    if (dto.areaId) {
      const area = await this.prisma.area.findFirst({
        where: { id: BigInt(dto.areaId), storeId: sid },
      });
      if (!area) throw new BusinessError('AREA_NOT_FOUND');
    }

    const itemRows = await this.resolveItemRows(sid, dto.items);
    const phone = this.normalizePhone(dto.phone);
    const perk = await this.members.reservationPerk(phone);
    const remark = [
      dto.remark?.trim(),
      perk.birthdayGift ? '生日到店赠菜（门店安排）' : '',
    ]
      .filter(Boolean)
      .join('；');

    const r = await this.prisma.$transaction(async (tx) => {
      const created = await tx.reservation.create({
        data: {
          storeId: sid,
          customerName: dto.customerName,
          phone,
          guestCount: dto.guestCount,
          reserveAt: new Date(dto.reserveAt),
          tableId: dto.tableId ? BigInt(dto.tableId) : null,
          areaId: dto.areaId ? BigInt(dto.areaId) : null,
          customerId: dto.customerId
            ? BigInt(dto.customerId)
            : perk.customerId
              ? BigInt(perk.customerId)
              : null,
          deposit: BigInt(dto.deposit ?? 0),
          remark: remark || null,
          memberPriority: perk.priority,
          status: ReservationStatus.pending,
          createdBy: userId ? BigInt(userId) : null,
        },
      });
      await this.replaceItems(tx, created.id, itemRows);
      return tx.reservation.findUniqueOrThrow({
        where: { id: created.id },
        include: this.listInclude,
      });
    });

    const mapped = this.mapReservation(r);
    const pendingCount = await this.emitPendingCount(storeId);
    this.events.emit(Events.RESERVATION_CREATED, {
      storeId,
      reservation: mapped,
      pendingCount,
    });
    return mapped;
  }

  async update(storeId: string, reservationId: string, dto: UpdateReservationDto) {
    const rid = BigInt(reservationId);
    const sid = BigInt(storeId);

    const existing = await this.prisma.reservation.findFirst({
      where: { id: rid, storeId: sid },
    });
    if (!existing) throw new BusinessError('RESERVATION_NOT_FOUND');
    if (
      existing.status === ReservationStatus.seated ||
      existing.status === ReservationStatus.cancelled ||
      existing.status === ReservationStatus.no_show
    ) {
      throw new BusinessError('RESERVATION_CANNOT_UPDATE');
    }

    if (dto.tableId) {
      const table = await this.prisma.table.findFirst({
        where: { id: BigInt(dto.tableId), storeId: sid },
      });
      if (!table) throw new BusinessError('TABLE_NOT_FOUND');
    }

    const itemRows =
      dto.items !== undefined ? await this.resolveItemRows(sid, dto.items) : null;

    const r = await this.prisma.$transaction(async (tx) => {
      await tx.reservation.update({
        where: { id: rid },
        data: {
          ...(dto.customerName !== undefined && { customerName: dto.customerName }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.guestCount !== undefined && { guestCount: dto.guestCount }),
          ...(dto.reserveAt !== undefined && { reserveAt: new Date(dto.reserveAt) }),
          ...(dto.tableId !== undefined && {
            tableId: dto.tableId ? BigInt(dto.tableId) : null,
          }),
          ...(dto.areaId !== undefined && {
            areaId: dto.areaId ? BigInt(dto.areaId) : null,
          }),
          ...(dto.customerId !== undefined && {
            customerId: dto.customerId ? BigInt(dto.customerId) : null,
          }),
          ...(dto.deposit !== undefined && { deposit: BigInt(dto.deposit) }),
          ...(dto.remark !== undefined && { remark: dto.remark }),
        },
      });
      if (itemRows) await this.replaceItems(tx, rid, itemRows);
      return tx.reservation.findUniqueOrThrow({
        where: { id: rid },
        include: this.listInclude,
      });
    });

    const mapped = this.mapReservation(r);
    if (existing.status === ReservationStatus.confirmed) {
      this.emitPreorderChanged(storeId);
    }
    return mapped;
  }

  async delete(storeId: string, reservationId: string) {
    const rid = BigInt(reservationId);
    const existing = await this.prisma.reservation.findFirst({
      where: { id: rid, storeId: BigInt(storeId) },
      include: { seatedSession: { select: { id: true, status: true } } },
    });
    if (!existing) throw new BusinessError('RESERVATION_NOT_FOUND');
    // 仅拦截「仍在用餐中」的入座预定；会话已结束/无会话的历史测试数据允许清理
    if (
      existing.status === ReservationStatus.seated &&
      existing.seatedSession?.status === SessionStatus.open
    ) {
      throw new BusinessError('RESERVATION_SEATED_CANNOT_DELETE');
    }
    await this.prisma.reservation.delete({ where: { id: rid } });
    await this.emitPendingCount(storeId);
    if (existing.status === ReservationStatus.confirmed) {
      this.emitPreorderChanged(storeId);
    }
    return { success: true };
  }

  async findById(storeId: string, reservationId: string) {
    const r = await this.prisma.reservation.findFirst({
      where: { id: BigInt(reservationId), storeId: BigInt(storeId) },
      include: this.listInclude,
    });
    if (!r) throw new BusinessError('RESERVATION_NOT_FOUND');
    return this.mapReservation(r);
  }

  async list(storeId: string, query: ReservationQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where: Prisma.ReservationWhereInput = { storeId: BigInt(storeId) };

    if (query.status) where.status = query.status;

    if (query.date) {
      const start = new Date(`${query.date}T00:00:00+07:00`);
      const end = new Date(`${query.date}T23:59:59.999+07:00`);
      where.reserveAt = { gte: start, lte: end };
    }

    if (query.keyword) {
      where.OR = [
        { customerName: { contains: query.keyword } },
        { phone: { contains: query.keyword } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.reservation.count({ where }),
      this.prisma.reservation.findMany({
        where,
        include: this.listInclude,
        orderBy: [{ memberPriority: 'desc' }, { reserveAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      total,
      page,
      pageSize,
      list: rows.map((r) => this.mapReservation(r)),
    };
  }

  /** 厨房：已确认且含预点菜的预定 */
  async listKitchenPreorders(storeId: string) {
    const rows = await this.prisma.reservation.findMany({
      where: {
        storeId: BigInt(storeId),
        status: ReservationStatus.confirmed,
        items: { some: {} },
      },
      include: this.listInclude,
      orderBy: [{ reserveAt: 'asc' }],
    });
    return rows.map((r) => this.mapReservation(r));
  }

  async confirm(storeId: string, reservationId: string) {
    const rid = BigInt(reservationId);
    const r = await this.prisma.reservation.findFirst({
      where: { id: rid, storeId: BigInt(storeId) },
    });
    if (!r) throw new BusinessError('RESERVATION_NOT_FOUND');
    if (r.status !== ReservationStatus.pending) throw new BusinessError('RESERVATION_NOT_PENDING');

    const updated = await this.prisma.reservation.update({
      where: { id: rid },
      data: { status: ReservationStatus.confirmed },
      include: this.listInclude,
    });
    await this.emitPendingCount(storeId);
    const mapped = this.mapReservation(updated);
    this.events.emit(Events.RESERVATION_CONFIRMED, { storeId, reservation: mapped });
    if (mapped.preorderCount > 0) this.emitPreorderChanged(storeId);
    return mapped;
  }

  async cancel(storeId: string, reservationId: string, dto: CancelReservationDto) {
    const rid = BigInt(reservationId);
    const r = await this.prisma.reservation.findFirst({
      where: { id: rid, storeId: BigInt(storeId) },
    });
    if (!r) throw new BusinessError('RESERVATION_NOT_FOUND');
    if (
      r.status === ReservationStatus.seated ||
      r.status === ReservationStatus.cancelled
    ) {
      throw new BusinessError('RESERVATION_CANNOT_CANCEL');
    }

    const updated = await this.prisma.reservation.update({
      where: { id: rid },
      data: {
        status: ReservationStatus.cancelled,
        ...(dto.reason && {
          remark: r.remark ? `${r.remark} | 取消: ${dto.reason}` : `取消: ${dto.reason}`,
        }),
      },
      include: this.listInclude,
    });
    await this.emitPendingCount(storeId);
    if (r.status === ReservationStatus.confirmed) this.emitPreorderChanged(storeId);
    return this.mapReservation(updated);
  }

  /** H5：按手机号列出本店预定（近 90 天） */
  async listByPhone(storeId: string, phone: string) {
    const p = this.normalizePhone(phone);
    if (!p) throw new BusinessError('RESERVATION_PHONE_REQUIRED');
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.reservation.findMany({
      where: {
        storeId: BigInt(storeId),
        phone: p,
        createdAt: { gte: since },
      },
      include: this.listInclude,
      orderBy: { reserveAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => this.mapReservation(r));
  }

  /** H5：详情（手机号核验） */
  async findByPhone(storeId: string, reservationId: string, phone: string) {
    const r = await this.prisma.reservation.findFirst({
      where: { id: BigInt(reservationId), storeId: BigInt(storeId) },
      include: this.listInclude,
    });
    if (!r) throw new BusinessError('RESERVATION_NOT_FOUND');
    this.assertPhoneMatch(r.phone, phone);
    return this.mapReservation(r);
  }

  /** H5：自助修改（pending/confirmed） */
  async updateByPhone(
    storeId: string,
    reservationId: string,
    dto: PublicUpdateReservationDto,
  ) {
    const existing = await this.prisma.reservation.findFirst({
      where: { id: BigInt(reservationId), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('RESERVATION_NOT_FOUND');
    this.assertPhoneMatch(existing.phone, dto.phone);
    return this.update(storeId, reservationId, {
      customerName: dto.customerName,
      guestCount: dto.guestCount,
      reserveAt: dto.reserveAt,
      remark: dto.remark,
      items: dto.items,
    });
  }

  /** H5：自助取消 */
  async cancelByPhone(
    storeId: string,
    reservationId: string,
    dto: PublicCancelReservationDto,
  ) {
    const existing = await this.prisma.reservation.findFirst({
      where: { id: BigInt(reservationId), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('RESERVATION_NOT_FOUND');
    this.assertPhoneMatch(existing.phone, dto.phone);
    return this.cancel(storeId, reservationId, { reason: dto.reason });
  }

  async noShow(storeId: string, reservationId: string) {
    const rid = BigInt(reservationId);
    const r = await this.prisma.reservation.findFirst({
      where: { id: rid, storeId: BigInt(storeId) },
    });
    if (!r) throw new BusinessError('RESERVATION_NOT_FOUND');
    if (
      r.status !== ReservationStatus.pending &&
      r.status !== ReservationStatus.confirmed
    ) {
      throw new BusinessError('RESERVATION_CANNOT_NO_SHOW');
    }

    const updated = await this.prisma.reservation.update({
      where: { id: rid },
      data: { status: ReservationStatus.no_show },
      include: this.listInclude,
    });
    await this.emitPendingCount(storeId);
    if (r.status === ReservationStatus.confirmed) this.emitPreorderChanged(storeId);
    return this.mapReservation(updated);
  }

  /**
   * 顾客到店入座：开台 → 预定 seated → 预点菜有 dishId 则提交堂食订单（扣库存）
   */
  async seat(storeId: string, reservationId: string, dto: SeatReservationDto, userId: string) {
    const rid = BigInt(reservationId);
    const sid = BigInt(storeId);

    const r = await this.prisma.reservation.findFirst({
      where: { id: rid, storeId: sid },
      include: { items: { orderBy: { sort: 'asc' } } },
    });
    if (!r) throw new BusinessError('RESERVATION_NOT_FOUND');
    if (
      r.status !== ReservationStatus.pending &&
      r.status !== ReservationStatus.confirmed
    ) {
      throw new BusinessError('RESERVATION_CANNOT_SEAT');
    }

    const tableId = dto.tableId ? BigInt(dto.tableId) : r.tableId;
    const guestCount = dto.guestCount ?? r.guestCount;
    let seatedSessionId: bigint | null = null;
    let tableIdStr: string | null = null;

    if (tableId) {
      const table = await this.prisma.table.findFirst({
        where: { id: tableId, storeId: sid },
      });
      if (!table) throw new BusinessError('TABLE_NOT_FOUND');
      if (table.status !== TableStatus.idle || table.currentSessionId) {
        throw new BusinessError('TABLE_NOT_IDLE');
      }

      const session = await this.prisma.$transaction(async (tx) => {
        const s = await tx.tableSession.create({
          data: {
            tableId,
            guestCount,
            pin: this.pin(),
            sessionToken: this.token(),
            waiterId: BigInt(userId),
            status: SessionStatus.open,
          },
        });
        await tx.table.update({
          where: { id: tableId },
          data: { status: TableStatus.dining, currentSessionId: s.id },
        });
        return s;
      });

      seatedSessionId = session.id;
      tableIdStr = tableId.toString();
      this.events.emit(Events.TABLE_STATUS_CHANGED, {
        storeId,
        tableId: tableIdStr,
        status: TableStatus.dining,
      });
    }

    const updated = await this.prisma.reservation.update({
      where: { id: rid },
      data: {
        status: ReservationStatus.seated,
        ...(seatedSessionId && { seatedSessionId }),
      },
      include: this.listInclude,
    });
    await this.emitPendingCount(storeId);
    if (r.status === ReservationStatus.confirmed) this.emitPreorderChanged(storeId);

    const orderItems = r.items
      .filter((it) => it.dishId != null)
      .map((it) => ({
        dishId: it.dishId!.toString(),
        qty: it.qty,
        optionsSnapshot: it.optionsSnapshot ?? undefined,
      }));

    let orderId: string | null = null;
    if (tableIdStr && orderItems.length) {
      const order = await this.orders.submit(
        storeId,
        { tableId: tableIdStr, items: orderItems, remark: `预定预点 #${reservationId}` },
        userId,
      );
      orderId = order.id;
    }

    return { ...this.mapReservation(updated), orderId };
  }
}
