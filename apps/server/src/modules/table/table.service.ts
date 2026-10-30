import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SessionStatus, TableStatus } from '@prisma/client';
import { Events } from '@restaurant/shared';
import { randomBytes, randomInt } from 'crypto';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import { BusinessError } from '../../common/errors/business.error';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateAreaDto,
  CreateTableDto,
  ExportStickersDto,
  MergeTableDto,
  OpenTableDto,
  TransferTableDto,
  UpdateAreaDto,
  UpdateTableDto,
} from './dto/table.dto';

@Injectable()
export class TableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly config: ConfigService,
  ) {}

  private token() {
    return randomBytes(16).toString('hex');
  }

  private pin() {
    return String(randomInt(0, 10000)).padStart(4, '0');
  }

  private mapArea(a: {
    id: bigint;
    nameZh: string;
    nameVi: string;
    sort: number;
    _count?: { tables: number };
  }) {
    return {
      id: a.id.toString(),
      nameZh: a.nameZh,
      nameVi: a.nameVi,
      sort: a.sort,
      tableCount: a._count?.tables ?? 0,
    };
  }

  private mapTable(t: {
    id: bigint;
    areaId: bigint;
    code: string;
    seats: number;
    status: TableStatus;
    qrToken: string;
    currentSessionId: bigint | null;
    area?: { id: bigint; nameZh: string; nameVi: string };
    currentSession?: {
      id: bigint;
      openAt: Date;
      guestCount: number;
      pin: string;
      sessionToken: string;
      status: SessionStatus;
      orders?: {
        id: bigint;
        total: bigint;
        status: string;
        batches?: { id: bigint; roundNo: number; printStatus: string; guestNickname: string | null }[];
      }[];
    } | null;
  }) {
    const openOrder = t.currentSession?.orders?.find((o) => o.status === 'open');
    const pendingBatches =
      openOrder?.batches?.filter((b) => b.printStatus === 'need_confirm').map((b) => ({
        id: b.id.toString(),
        roundNo: b.roundNo,
        guestNickname: b.guestNickname,
      })) ?? [];
    return {
      id: t.id.toString(),
      areaId: t.areaId.toString(),
      area: t.area
        ? { id: t.area.id.toString(), nameZh: t.area.nameZh, nameVi: t.area.nameVi }
        : undefined,
      code: t.code,
      seats: t.seats,
      status: t.status,
      qrToken: t.qrToken,
      qrUrl: `${this.h5Base()}/t/${t.qrToken}`,
      currentSessionId: t.currentSessionId?.toString() ?? null,
      session: t.currentSession
        ? {
            id: t.currentSession.id.toString(),
            openAt: t.currentSession.openAt,
            guestCount: t.currentSession.guestCount,
            pin: t.currentSession.pin,
            sessionToken: t.currentSession.sessionToken,
            status: t.currentSession.status,
            orderId: openOrder?.id.toString() ?? null,
            total: openOrder ? Number(openOrder.total) : 0,
            durationMinutes: Math.max(
              0,
              Math.floor((Date.now() - t.currentSession.openAt.getTime()) / 60000),
            ),
            pendingConfirmCount: pendingBatches.length,
            pendingBatches,
          }
        : null,
    };
  }

  private h5Base() {
    return (this.config.get<string>('H5_BASE_URL') || 'http://localhost:5174').replace(/\/$/, '');
  }

  private emitTable(storeId: string, payload: unknown) {
    this.events.emit(Events.TABLE_STATUS_CHANGED, { storeId, ...((payload as object) || {}) });
  }

  async listAreas(storeId: string) {
    const rows = await this.prisma.area.findMany({
      where: { storeId: BigInt(storeId) },
      include: { _count: { select: { tables: true } } },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    return rows.map((a) => this.mapArea(a));
  }

  async createArea(storeId: string, dto: CreateAreaDto) {
    const row = await this.prisma.area.create({
      data: {
        storeId: BigInt(storeId),
        nameZh: dto.nameZh,
        nameVi: dto.nameVi,
        sort: dto.sort ?? 0,
      },
      include: { _count: { select: { tables: true } } },
    });
    return this.mapArea(row);
  }

  async updateArea(storeId: string, id: string, dto: UpdateAreaDto) {
    const existing = await this.prisma.area.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('AREA_NOT_FOUND');
    const row = await this.prisma.area.update({
      where: { id: existing.id },
      data: dto,
      include: { _count: { select: { tables: true } } },
    });
    return this.mapArea(row);
  }

  async deleteArea(storeId: string, id: string) {
    const existing = await this.prisma.area.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
      include: { _count: { select: { tables: true } } },
    });
    if (!existing) throw new BusinessError('AREA_NOT_FOUND');
    if (existing._count.tables > 0) throw new BusinessError('AREA_HAS_TABLES');
    await this.prisma.area.delete({ where: { id: existing.id } });
    return { ok: true };
  }

  async listFloor(storeId: string) {
    const areas = await this.prisma.area.findMany({
      where: { storeId: BigInt(storeId) },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      include: {
        tables: {
          orderBy: { code: 'asc' },
          include: {
            area: true,
            currentSession: {
              include: {
                orders: {
                  where: { status: 'open' },
                  select: {
                    id: true,
                    total: true,
                    status: true,
                    batches: {
                      where: { printStatus: 'need_confirm' },
                      select: { id: true, roundNo: true, printStatus: true, guestNickname: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    return areas.map((a) => ({
      ...this.mapArea(a),
      tables: a.tables.map((t) => this.mapTable(t)),
    }));
  }

  async listTables(storeId: string) {
    const rows = await this.prisma.table.findMany({
      where: { storeId: BigInt(storeId) },
      include: {
        area: true,
        currentSession: {
          include: {
            orders: {
              where: { status: 'open' },
              select: {
                id: true,
                total: true,
                status: true,
                batches: {
                  where: { printStatus: 'need_confirm' },
                  select: { id: true, roundNo: true, printStatus: true, guestNickname: true },
                },
              },
            },
          },
        },
      },
      orderBy: { code: 'asc' },
    });
    return rows.map((t) => this.mapTable(t));
  }

  async createTable(storeId: string, dto: CreateTableDto) {
    const area = await this.prisma.area.findFirst({
      where: { id: BigInt(dto.areaId), storeId: BigInt(storeId) },
    });
    if (!area) throw new BusinessError('AREA_NOT_FOUND');
    const exists = await this.prisma.table.findUnique({
      where: { storeId_code: { storeId: BigInt(storeId), code: dto.code } },
    });
    if (exists) throw new BusinessError('TABLE_CODE_EXISTS');
    const row = await this.prisma.table.create({
      data: {
        storeId: BigInt(storeId),
        areaId: area.id,
        code: dto.code,
        seats: dto.seats ?? 4,
        qrToken: this.token(),
        status: TableStatus.idle,
      },
      include: { area: true, currentSession: true },
    });
    return this.mapTable(row);
  }

  async updateTable(storeId: string, id: string, dto: UpdateTableDto) {
    const existing = await this.prisma.table.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('TABLE_NOT_FOUND');
    if (dto.areaId) {
      const area = await this.prisma.area.findFirst({
        where: { id: BigInt(dto.areaId), storeId: BigInt(storeId) },
      });
      if (!area) throw new BusinessError('AREA_NOT_FOUND');
    }
    const row = await this.prisma.table.update({
      where: { id: existing.id },
      data: {
        areaId: dto.areaId ? BigInt(dto.areaId) : undefined,
        code: dto.code,
        seats: dto.seats,
      },
      include: { area: true, currentSession: true },
    });
    return this.mapTable(row);
  }

  async deleteTable(storeId: string, id: string) {
    const existing = await this.prisma.table.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('TABLE_NOT_FOUND');
    if (existing.status !== TableStatus.idle || existing.currentSessionId) {
      throw new BusinessError('TABLE_NOT_IDLE');
    }
    await this.prisma.table.delete({ where: { id: existing.id } });
    return { ok: true };
  }

  async resetQr(storeId: string, id: string) {
    const existing = await this.prisma.table.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('TABLE_NOT_FOUND');
    const row = await this.prisma.table.update({
      where: { id: existing.id },
      data: { qrToken: this.token() },
      include: { area: true, currentSession: true },
    });
    return this.mapTable(row);
  }

  async openTable(storeId: string, tableId: string, dto: OpenTableDto, waiterId?: string) {
    const table = await this.prisma.table.findFirst({
      where: { id: BigInt(tableId), storeId: BigInt(storeId) },
    });
    if (!table) throw new BusinessError('TABLE_NOT_FOUND');
    if (table.status !== TableStatus.idle || table.currentSessionId) {
      throw new BusinessError('TABLE_NOT_IDLE');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const session = await tx.tableSession.create({
        data: {
          tableId: table.id,
          guestCount: dto.guestCount,
          pin: this.pin(),
          sessionToken: this.token(),
          waiterId: waiterId ? BigInt(waiterId) : null,
          status: SessionStatus.open,
        },
      });
      const updated = await tx.table.update({
        where: { id: table.id },
        data: { status: TableStatus.dining, currentSessionId: session.id },
        include: {
          area: true,
          currentSession: {
            include: { orders: { where: { status: 'open' }, select: { id: true, total: true, status: true } } },
          },
        },
      });
      return updated;
    });

    const mapped = this.mapTable(result);
    this.emitTable(storeId, { table: mapped });
    return mapped;
  }

  async clearTable(storeId: string, tableId: string) {
    const table = await this.prisma.table.findFirst({
      where: { id: BigInt(tableId), storeId: BigInt(storeId) },
      include: { currentSession: { include: { orders: true } } },
    });
    if (!table) throw new BusinessError('TABLE_NOT_FOUND');
    if (table.status !== TableStatus.cleaning) {
      throw new BusinessError('TABLE_NOT_CLEANING');
    }
    const openOrder = table.currentSession?.orders.find((o) => o.status === 'open');
    if (openOrder) throw new BusinessError('TABLE_HAS_OPEN_ORDER');

    const result = await this.prisma.$transaction(async (tx) => {
      if (table.currentSessionId) {
        await tx.tableSession.update({
          where: { id: table.currentSessionId },
          data: { status: SessionStatus.closed, closeAt: new Date() },
        });
      }
      return tx.table.update({
        where: { id: table.id },
        data: { status: TableStatus.idle, currentSessionId: null },
        include: { area: true, currentSession: true },
      });
    });

    const mapped = this.mapTable(result);
    this.emitTable(storeId, { table: mapped });
    return mapped;
  }

  async transferTable(storeId: string, tableId: string, dto: TransferTableDto) {
    if (tableId === dto.targetTableId) throw new BusinessError('TABLE_TRANSFER_SAME');
    const source = await this.prisma.table.findFirst({
      where: { id: BigInt(tableId), storeId: BigInt(storeId) },
    });
    const target = await this.prisma.table.findFirst({
      where: { id: BigInt(dto.targetTableId), storeId: BigInt(storeId) },
    });
    if (!source || !target) throw new BusinessError('TABLE_NOT_FOUND');
    if (source.status !== TableStatus.dining || !source.currentSessionId) {
      throw new BusinessError('TABLE_NOT_DINING');
    }
    if (target.status !== TableStatus.idle || target.currentSessionId) {
      throw new BusinessError('TABLE_NOT_IDLE');
    }

    const sessionId = source.currentSessionId;
    await this.prisma.$transaction(async (tx) => {
      await tx.tableSession.update({
        where: { id: sessionId },
        data: { tableId: target.id },
      });
      await tx.table.update({
        where: { id: source.id },
        data: { status: TableStatus.idle, currentSessionId: null },
      });
      await tx.table.update({
        where: { id: target.id },
        data: { status: TableStatus.dining, currentSessionId: sessionId },
      });
    });

    const floor = await this.listFloor(storeId);
    this.emitTable(storeId, { transferred: true, from: tableId, to: dto.targetTableId });
    return floor;
  }

  /** 并桌：源桌订单并入目标桌会话，源桌清为空闲 */
  async mergeTable(storeId: string, targetTableId: string, dto: MergeTableDto) {
    if (targetTableId === dto.sourceTableId) throw new BusinessError('TABLE_MERGE_SAME');
    const target = await this.prisma.table.findFirst({
      where: { id: BigInt(targetTableId), storeId: BigInt(storeId) },
      include: { currentSession: { include: { orders: true } } },
    });
    const source = await this.prisma.table.findFirst({
      where: { id: BigInt(dto.sourceTableId), storeId: BigInt(storeId) },
      include: { currentSession: { include: { orders: true } } },
    });
    if (!target || !source) throw new BusinessError('TABLE_NOT_FOUND');
    if (target.status !== TableStatus.dining || !target.currentSessionId) {
      throw new BusinessError('TABLE_NOT_DINING');
    }
    if (source.status !== TableStatus.dining || !source.currentSessionId) {
      throw new BusinessError('TABLE_NOT_DINING');
    }

    const targetOrder = target.currentSession!.orders.find((o) => o.status === 'open');
    const sourceOrder = source.currentSession!.orders.find((o) => o.status === 'open');

    await this.prisma.$transaction(async (tx) => {
      let mergeTargetOrderId = targetOrder?.id ?? null;

      if (sourceOrder && targetOrder) {
        await tx.orderItem.updateMany({
          where: { orderId: sourceOrder.id },
          data: { orderId: targetOrder.id },
        });
        await tx.orderBatch.updateMany({
          where: { orderId: sourceOrder.id },
          data: { orderId: targetOrder.id },
        });
        await tx.order.update({
          where: { id: sourceOrder.id },
          data: { status: 'cancelled', cancelReason: 'merge_table' },
        });
        mergeTargetOrderId = targetOrder.id;
      } else if (sourceOrder && !targetOrder) {
        await tx.order.update({
          where: { id: sourceOrder.id },
          data: { tableSessionId: target.currentSessionId },
        });
        mergeTargetOrderId = sourceOrder.id;
      }

      if (mergeTargetOrderId) {
        const items = await tx.orderItem.findMany({ where: { orderId: mergeTargetOrderId } });
        const subtotal = items
          .filter((i) => i.status !== 'voided')
          .reduce((s, i) => s + i.amount, 0n);
        const order = await tx.order.findUniqueOrThrow({ where: { id: mergeTargetOrderId } });
        const discount = order.discount > subtotal ? subtotal : order.discount;
        await tx.order.update({
          where: { id: mergeTargetOrderId },
          data: {
            subtotal,
            discount,
            total: subtotal - discount + order.serviceCharge + order.deliveryFee,
          },
        });
      }

      await tx.tableSession.update({
        where: { id: source.currentSessionId! },
        data: { status: SessionStatus.closed, closeAt: new Date() },
      });
      await tx.table.update({
        where: { id: source.id },
        data: { status: TableStatus.idle, currentSessionId: null },
      });
      await tx.tableSession.update({
        where: { id: target.currentSessionId! },
        data: {
          guestCount: target.currentSession!.guestCount + source.currentSession!.guestCount,
        },
      });
    });

    this.emitTable(storeId, { merged: true, target: targetTableId, source: dto.sourceTableId });
    return this.listFloor(storeId);
  }

  async exportStickers(storeId: string, dto: ExportStickersDto): Promise<Buffer> {
    const store = await this.prisma.store.findUnique({ where: { id: BigInt(storeId) } });
    if (!store) throw new BusinessError('STORE_REQUIRED');
    const tables = await this.prisma.table.findMany({
      where: {
        storeId: BigInt(storeId),
        ...(dto.tableIds?.length ? { id: { in: dto.tableIds.map((id) => BigInt(id)) } } : {}),
      },
      orderBy: { code: 'asc' },
    });
    if (!tables.length) throw new BusinessError('TABLE_NOT_FOUND');

    const doc = new PDFDocument({ size: [298, 420], margin: 24 }); // A6-ish
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c as Buffer));

    for (let i = 0; i < tables.length; i++) {
      if (i > 0) doc.addPage();
      const t = tables[i];
      const url = `${this.h5Base()}/t/${t.qrToken}`;
      const qr = await QRCode.toBuffer(url, { type: 'png', width: 220, margin: 1 });
      doc.fontSize(14).text(store.nameZh, { align: 'center' });
      doc.fontSize(11).fillColor('#666').text(store.nameVi, { align: 'center' });
      doc.moveDown(0.5);
      doc.fillColor('#000').fontSize(28).text(t.code, { align: 'center' });
      doc.moveDown(0.5);
      doc.image(qr, (doc.page.width - 180) / 2, doc.y, { width: 180 });
      doc.moveDown(12);
      doc.fontSize(12).text('扫码点餐', { align: 'center' });
      doc.fontSize(11).text('Quét mã để gọi món', { align: 'center' });
    }

    doc.end();
    await new Promise<void>((resolve) => doc.on('end', () => resolve()));
    return Buffer.concat(chunks);
  }
}
