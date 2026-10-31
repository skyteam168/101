import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ReservationStatus, TableStatus, Prisma, SessionStatus } from '@prisma/client';
import { Events } from '@restaurant/shared';
import { randomBytes, randomInt } from 'crypto';
import { BusinessError } from '../../common/errors/business.error';
import { PrismaService } from '../../prisma/prisma.service';
import { MemberService } from '../member/member.service';
import {
  CancelReservationDto,
  CreateReservationDto,
  ReservationQueryDto,
  SeatReservationDto,
  UpdateReservationDto,
} from './dto/reservation.dto';

@Injectable()
export class ReservationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly members: MemberService,
  ) {}

  // ========== 工具函数 ==========

  private token() {
    return randomBytes(16).toString('hex');
  }

  private pin() {
    return String(randomInt(0, 10000)).padStart(4, '0');
  }

  // ========== 映射 ==========

  private mapReservation(r: Prisma.ReservationGetPayload<{
    include: {
      table: { select: { id: true; code: true } };
      area: { select: { id: true; nameZh: true; nameVi: true } };
    };
  }>) {
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
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  private get listInclude() {
    return {
      table: { select: { id: true, code: true } },
      area: { select: { id: true, nameZh: true, nameVi: true } },
    } as const;
  }

  /** 待确认预定数量（菜单角标） */
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

  // ========== CRUD ==========

  async create(storeId: string, dto: CreateReservationDto, userId?: string | null) {
    const sid = BigInt(storeId);

    // 若指定桌台，校验属于本门店
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

    const perk = await this.members.reservationPerk(dto.phone);
    const remark = [
      dto.remark?.trim(),
      perk.birthdayGift ? '生日到店赠菜（门店安排）' : '',
    ]
      .filter(Boolean)
      .join('；');
    const r = await this.prisma.reservation.create({
      data: {
        storeId: sid,
        customerName: dto.customerName,
        phone: dto.phone,
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
      include: this.listInclude,
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

  /** H5 公开预定（默认门店 1） */
  createPublic(dto: CreateReservationDto) {
    return this.create('1', dto, null);
  }

  async update(storeId: string, reservationId: string, dto: UpdateReservationDto) {
    const rid = BigInt(reservationId);
    const sid = BigInt(storeId);

    const existing = await this.prisma.reservation.findFirst({
      where: { id: rid, storeId: sid },
    });
    if (!existing) throw new BusinessError('RESERVATION_NOT_FOUND');
    // 只有待确认/已确认状态才允许修改
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

    const r = await this.prisma.reservation.update({
      where: { id: rid },
      data: {
        ...(dto.customerName !== undefined && { customerName: dto.customerName }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.guestCount !== undefined && { guestCount: dto.guestCount }),
        ...(dto.reserveAt !== undefined && { reserveAt: new Date(dto.reserveAt) }),
        ...(dto.tableId !== undefined && { tableId: dto.tableId ? BigInt(dto.tableId) : null }),
        ...(dto.areaId !== undefined && { areaId: dto.areaId ? BigInt(dto.areaId) : null }),
        ...(dto.customerId !== undefined && { customerId: dto.customerId ? BigInt(dto.customerId) : null }),
        ...(dto.deposit !== undefined && { deposit: BigInt(dto.deposit) }),
        ...(dto.remark !== undefined && { remark: dto.remark }),
      },
      include: this.listInclude,
    });

    return this.mapReservation(r);
  }

  async delete(storeId: string, reservationId: string) {
    const rid = BigInt(reservationId);
    const existing = await this.prisma.reservation.findFirst({
      where: { id: rid, storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('RESERVATION_NOT_FOUND');
    if (existing.status === ReservationStatus.seated) {
      throw new BusinessError('RESERVATION_SEATED_CANNOT_DELETE');
    }
    await this.prisma.reservation.delete({ where: { id: rid } });
    await this.emitPendingCount(storeId);
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
      // 按日期（Asia/Ho_Chi_Minh UTC+7）筛选
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

  // ========== 状态变更 ==========

  /** 确认预定 */
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
    return this.mapReservation(updated);
  }

  /** 取消预定 */
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
        ...(dto.reason && { remark: r.remark ? `${r.remark} | 取消: ${dto.reason}` : `取消: ${dto.reason}` }),
      },
      include: this.listInclude,
    });
    await this.emitPendingCount(storeId);
    return this.mapReservation(updated);
  }

  /** 标记未到 */
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
    return this.mapReservation(updated);
  }

  /**
   * 顾客到店入座：
   * 1. 若指定桌台，则调用开台逻辑（桌台必须 idle）
   * 2. 预定状态 → seated
   * 3. 写入 seatedSessionId
   */
  async seat(storeId: string, reservationId: string, dto: SeatReservationDto, userId: string) {
    const rid = BigInt(reservationId);
    const sid = BigInt(storeId);

    const r = await this.prisma.reservation.findFirst({
      where: { id: rid, storeId: sid },
    });
    if (!r) throw new BusinessError('RESERVATION_NOT_FOUND');
    if (
      r.status !== ReservationStatus.pending &&
      r.status !== ReservationStatus.confirmed
    ) {
      throw new BusinessError('RESERVATION_CANNOT_SEAT');
    }

    // 优先使用入座时传入的 tableId，其次用预定时的 tableId
    const tableId = dto.tableId ? BigInt(dto.tableId) : r.tableId;
    const guestCount = dto.guestCount ?? r.guestCount;

    let seatedSessionId: bigint | null = null;

    if (tableId) {
      // 开台（复用开台逻辑，直接在事务内执行）
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
    return this.mapReservation(updated);
  }
}
