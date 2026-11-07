import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BatchPrintStatus, OrderStatus, SessionStatus, TableStatus } from '@prisma/client';
import { Events } from '@restaurant/shared';
import { randomBytes, randomInt } from 'crypto';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import { BusinessError } from '../../common/errors/business.error';
import { registerPdfCjkFont } from '../../common/pdf-font.util';
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
    storeId: bigint;
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
    const hasSettledOrder = t.currentSession?.orders?.some(
      (o) => o.status === 'paid' || o.status === 'cancelled',
    );
    const sessionClosed = t.currentSession?.status === SessionStatus.closed;
    const pendingBatches =
      openOrder?.batches?.filter((b) => b.printStatus === 'need_confirm').map((b) => ({
        id: b.id.toString(),
        roundNo: b.roundNo,
        guestNickname: b.guestNickname,
      })) ?? [];
    // 纠正不一致：
    // - idle 仍挂 session → 有 open 单=用餐中，否则待清台
    // - dining 但会话已关 / 仅有已结账单且无 open → 待清台（结账后未刷新脏数据）
    let status = t.status;
    if (t.status === TableStatus.idle && t.currentSessionId) {
      status = openOrder ? TableStatus.dining : TableStatus.cleaning;
    } else if (
      t.status === TableStatus.dining &&
      t.currentSessionId &&
      !openOrder &&
      (sessionClosed || hasSettledOrder)
    ) {
      status = TableStatus.cleaning;
    }
    return {
      id: t.id.toString(),
      areaId: t.areaId.toString(),
      area: t.area
        ? { id: t.area.id.toString(), nameZh: t.area.nameZh, nameVi: t.area.nameVi }
        : undefined,
      code: t.code,
      seats: t.seats,
      status,
      qrToken: t.qrToken,
      qrUrl: `${this.h5Base()}/t/${t.qrToken}?storeId=${t.storeId.toString()}`,
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

  private readonly sessionFloorInclude = {
    orders: {
      // 需带上已结账/取消单，便于 mapTable 把「结账后仍 dining」纠成 cleaning
      where: {
        status: {
          in: [OrderStatus.open, OrderStatus.paid, OrderStatus.cancelled] as OrderStatus[],
        },
      },
      select: {
        id: true,
        total: true,
        status: true,
        batches: {
          where: { printStatus: BatchPrintStatus.need_confirm },
          select: { id: true, roundNo: true, printStatus: true, guestNickname: true },
        },
      },
    },
  } as const;

  /** 把 mapTable 纠出来的待清台写回 DB，避免前端刷新后又变回用餐中 */
  private async persistStatusHeals(
    tables: {
      id: bigint;
      status: TableStatus;
      currentSessionId: bigint | null;
      currentSession?: {
        status: SessionStatus;
        orders?: { status: string }[];
      } | null;
    }[],
  ) {
    const heals: { id: bigint }[] = [];
    for (const t of tables) {
      const openOrder = t.currentSession?.orders?.some((o) => o.status === 'open');
      const hasSettled = t.currentSession?.orders?.some(
        (o) => o.status === 'paid' || o.status === 'cancelled',
      );
      const sessionClosed = t.currentSession?.status === SessionStatus.closed;
      if (
        t.status === TableStatus.dining &&
        t.currentSessionId &&
        !openOrder &&
        (sessionClosed || hasSettled)
      ) {
        heals.push({ id: t.id });
      } else if (t.status === TableStatus.idle && t.currentSessionId && !openOrder) {
        heals.push({ id: t.id });
      }
    }
    if (!heals.length) return;
    await this.prisma.table.updateMany({
      where: { id: { in: heals.map((h) => h.id) } },
      data: { status: TableStatus.cleaning },
    });
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
              include: this.sessionFloorInclude,
            },
          },
        },
      },
    });
    await this.persistStatusHeals(areas.flatMap((a) => a.tables));
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
          include: this.sessionFloorInclude,
        },
      },
      orderBy: { code: 'asc' },
    });
    await this.persistStatusHeals(rows);
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
    const sid = BigInt(storeId);
    const tid = BigInt(id);

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.table.findFirst({
        where: { id: tid, storeId: sid },
      });
      if (!existing) throw new BusinessError('TABLE_NOT_FOUND');
      if (existing.status !== TableStatus.idle || existing.currentSessionId) {
        throw new BusinessError('TABLE_NOT_IDLE');
      }

      // 残留未关闭会话（脏数据）也禁止删
      const openSessions = await tx.tableSession.count({
        where: { tableId: tid, status: SessionStatus.open },
      });
      if (openSessions > 0) throw new BusinessError('TABLE_NOT_IDLE');

      // 仍有未入座预定绑着此桌 → 明确业务错误，避免 500
      const activeReservations = await tx.reservation.count({
        where: {
          tableId: tid,
          status: { in: ['pending', 'confirmed'] },
        },
      });
      if (activeReservations > 0) {
        throw new BusinessError('TABLE_HAS_ACTIVE_RESERVATION');
      }

      // 历史预定解绑；历史会话保留订单，仅断开桌台外键（table_id 可空）
      await tx.reservation.updateMany({
        where: { tableId: tid },
        data: { tableId: null },
      });
      await tx.tableSession.updateMany({
        where: { tableId: tid },
        data: { tableId: null },
      });
      await tx.table.delete({ where: { id: tid } });
    });

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
      include: {
        currentSession: {
          include: { orders: { where: { status: 'open' }, select: { id: true } } },
        },
      },
    });
    if (!table) throw new BusinessError('TABLE_NOT_FOUND');

    // 脏数据自愈：idle 但仍挂着无未结账订单的 session → 先关掉再开台
    const orphanSession =
      table.status === TableStatus.idle &&
      table.currentSessionId &&
      !(table.currentSession?.orders?.length);

    if (table.status !== TableStatus.idle || (table.currentSessionId && !orphanSession)) {
      throw new BusinessError('TABLE_NOT_IDLE');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      if (orphanSession && table.currentSessionId) {
        await tx.tableSession.update({
          where: { id: table.currentSessionId },
          data: { status: SessionStatus.closed, closeAt: new Date() },
        });
        await tx.table.update({
          where: { id: table.id },
          data: { currentSessionId: null },
        });
      }

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
    const openOrder = table.currentSession?.orders.find((o) => o.status === 'open');
    if (openOrder) throw new BusinessError('TABLE_HAS_OPEN_ORDER');
    // 已是干净空闲桌 → 不可清；其余无未结账订单的桌（含 idle 残留会话、展示为待清台的脏数据）均可清
    if (table.status === TableStatus.idle && !table.currentSessionId) {
      throw new BusinessError('TABLE_NOT_CLEANING');
    }

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
        // 避免 order_batches(orderId, roundNo) 唯一约束冲突：源轮次接到目标最大轮次之后
        const maxRound = await tx.orderBatch.aggregate({
          where: { orderId: targetOrder.id },
          _max: { roundNo: true },
        });
        const base = maxRound._max.roundNo ?? 0;
        const sourceBatches = await tx.orderBatch.findMany({
          where: { orderId: sourceOrder.id },
          orderBy: { roundNo: 'asc' },
        });
        for (let i = 0; i < sourceBatches.length; i++) {
          await tx.orderBatch.update({
            where: { id: sourceBatches[i].id },
            data: { orderId: targetOrder.id, roundNo: base + i + 1 },
          });
        }
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

    const wifiRaw = store.guestWifi;
    const wifi =
      wifiRaw && typeof wifiRaw === 'object'
        ? (wifiRaw as { ssid?: string; password?: string })
        : {};
    const wifiSsid = (wifi.ssid || '').trim();
    const wifiPass = (wifi.password || '').trim();

    // 横版桌贴：约 10cm x 7cm，放大便于印刷
    const W = 420;
    const H = 300;
    const doc = new PDFDocument({ size: [W, H], margin: 0 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c as Buffer));

    const stickerFont = registerPdfCjkFont(doc, 'StickerFont');
    const useFont = () => {
      if (stickerFont) doc.font(stickerFont);
    };

    const midX = W / 2;
    const pad = 18;
    const chars = ['扫', '码', '点', '单'];

    const drawWifiIcon = (x: number, y: number) => {
      doc.save();
      doc.lineWidth(1.1).strokeColor('#111');
      doc
        .moveTo(x + 1, y + 7)
        .bezierCurveTo(x + 4, y + 2, x + 10, y + 2, x + 13, y + 7)
        .stroke();
      doc
        .moveTo(x + 3, y + 9.5)
        .bezierCurveTo(x + 5.5, y + 6, x + 8.5, y + 6, x + 11, y + 9.5)
        .stroke();
      doc.circle(x + 7, y + 12.5, 1.3).fill('#111');
      doc.restore();
    };
    const drawLockIcon = (x: number, y: number) => {
      doc.save();
      doc.lineWidth(1.1).strokeColor('#111').fillColor('#111');
      doc
        .moveTo(x + 4, y + 6)
        .lineTo(x + 4, y + 4.5)
        .bezierCurveTo(x + 4, y + 1.5, x + 10, y + 1.5, x + 10, y + 4.5)
        .lineTo(x + 10, y + 6)
        .stroke();
      doc.roundedRect(x + 2.5, y + 6, 9, 7.5, 1).stroke();
      doc.circle(x + 7, y + 9.5, 1).fill('#111');
      doc.restore();
    };

    for (let i = 0; i < tables.length; i++) {
      if (i > 0) doc.addPage();
      const t = tables[i];
      const url = `${this.h5Base()}/t/${t.qrToken}?storeId=${storeId}`;
      const qr = await QRCode.toBuffer(url, { type: 'png', width: 320, margin: 1, errorCorrectionLevel: 'M' });

      // 外框
      doc.roundedRect(8, 8, W - 16, H - 16, 10).lineWidth(1.2).stroke('#111');
      // 中缝竖线
      doc
        .moveTo(midX, 22)
        .lineTo(midX, H - 22)
        .lineWidth(1)
        .stroke('#222');

      // —— 左：二维码 + 扫码点单（中/越/英）——
      const qrSize = 138;
      const qrX = (midX - qrSize) / 2;
      const qrY = 22;
      doc.image(qr, qrX, qrY, { width: qrSize, height: qrSize });

      const circleY = qrY + qrSize + 20;
      const circleR = 10;
      const gap = 26;
      const totalW = chars.length * gap;
      const startX = (midX - totalW) / 2 + gap / 2;
      chars.forEach((ch, idx) => {
        const cx = startX + idx * gap;
        doc.circle(cx, circleY, circleR).fill('#111');
        useFont();
        doc.fillColor('#fff').fontSize(10).text(ch, cx - 8, circleY - 5.5, { width: 16, align: 'center' });
      });
      useFont();
      doc
        .fillColor('#111')
        .fontSize(11)
        .text('Quét mã gọi món', 12, circleY + 16, {
          width: midX - 24,
          align: 'center',
        });
      useFont();
      doc
        .fillColor('#666')
        .fontSize(9)
        .text('SCAN TO ORDER', 12, circleY + 32, {
          width: midX - 24,
          align: 'center',
        });
      doc.fillColor('#000');

      // —— 右：店名 / 桌号 / WIFI ——
      const rightX = midX + pad;
      const rightW = midX - pad * 2;
      useFont();
      doc.fontSize(16).fillColor('#111').text(store.nameZh || store.nameVi, rightX, 36, {
        width: rightW,
        align: 'center',
      });
      if (store.nameVi && store.nameVi !== store.nameZh) {
        const vi =
          store.nameVi.length > 28 ? `${store.nameVi.slice(0, 26)}…` : store.nameVi;
        useFont();
        doc.fontSize(10).fillColor('#888').text(vi, rightX, 58, {
          width: rightW,
          align: 'center',
          lineBreak: false,
        });
      }

      useFont();
      doc.fontSize(42).fillColor('#e11d2e').text(t.code, rightX, 100, {
        width: rightW,
        align: 'center',
      });

      // WIFI 区：标题 + 图标行
      const wifiTop = 210;
      useFont();
      doc.fillColor('#111').fontSize(14).text('WIFI', rightX, wifiTop + 4, { width: 42 });
      const infoX = rightX + 48;
      const infoW = rightW - 48;
      if (wifiSsid || wifiPass) {
        let wy = wifiTop;
        if (wifiSsid) {
          drawWifiIcon(infoX, wy);
          useFont();
          doc.fontSize(11).fillColor('#222').text(wifiSsid, infoX + 18, wy + 1, { width: infoW - 18 });
          wy += 20;
        }
        if (wifiPass) {
          drawLockIcon(infoX, wy);
          useFont();
          doc.fontSize(11).fillColor('#222').text(wifiPass, infoX + 18, wy + 1, { width: infoW - 18 });
        }
      } else {
        useFont();
        doc.fontSize(9).fillColor('#999').text('（后台可配置 WiFi）', infoX, wifiTop + 6, {
          width: infoW,
        });
      }
      doc.fillColor('#000');
    }

    doc.end();
    await new Promise<void>((resolve) => doc.on('end', () => resolve()));
    return Buffer.concat(chunks);
  }
}
