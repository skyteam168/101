import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BatchPrintStatus,
  PrintJobKind,
  PrintJobStatus,
  PrinterRole,
  Prisma,
} from '@prisma/client';
import {
  Events,
  type PrintJobMessage,
  type PrintTemplate,
  type PrintTicketPayload,
} from '@restaurant/shared';
import { BusinessError } from '../../common/errors/business.error';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentDriver } from './drivers/agent.driver';

type OrderMapped = {
  id: string;
  orderNo: string;
  type: string;
  tableCode?: string | null;
  remark?: string | null;
  subtotal: number;
  discount: number;
  serviceCharge: number;
  deliveryFee: number;
  total: number;
  paidAmount: number;
  createdAt?: Date | string;
  batches: {
    id: string;
    roundNo: number;
    printStatus?: string;
    items: {
      id: string;
      dishId: string;
      nameZh: string;
      nameVi: string;
      qty: number;
      unitPrice: number;
      amount: number;
      remark?: string | null;
      status: string;
      categoryId?: string;
    }[];
  }[];
  items?: {
    id: string;
    dishId: string;
    nameZh: string;
    nameVi: string;
    qty: number;
    unitPrice: number;
    amount: number;
    remark?: string | null;
    status: string;
  }[];
  payments?: { method: string; amount: number }[];
};

type PrinterRow = Prisma.PrinterGetPayload<{
  include: { agent: true; station: true };
}>;

const MAX_RETRIES = 3;

@Injectable()
export class PrintJobService {
  private readonly logger = new Logger(PrintJobService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly driver: AgentDriver,
    private readonly events: EventEmitter2,
  ) {}

  private paperWidth(w: number): 58 | 80 {
    return w === 58 ? 58 : 80;
  }

  private mapJob(job: {
    id: bigint;
    printerId: bigint;
    orderId: bigint | null;
    batchId: bigint | null;
    kind: PrintJobKind;
    payload: unknown;
    status: PrintJobStatus;
    retries: number;
    error: string | null;
    createdAt: Date;
    updatedAt: Date;
    printer?: { name: string; ip: string; role: PrinterRole };
  }) {
    return {
      id: job.id.toString(),
      printerId: job.printerId.toString(),
      orderId: job.orderId?.toString() ?? null,
      batchId: job.batchId?.toString() ?? null,
      kind: job.kind,
      payload: job.payload,
      status: job.status,
      retries: job.retries,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      printer: job.printer
        ? { name: job.printer.name, ip: job.printer.ip, role: job.printer.role }
        : undefined,
    };
  }

  async listJobs(
    storeId: string,
    query: { status?: string; kind?: string; page?: number; pageSize?: number },
  ) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where: Prisma.PrintJobWhereInput = {
      printer: { storeId: BigInt(storeId) },
    };
    if (query.status) where.status = query.status as PrintJobStatus;
    if (query.kind) where.kind = query.kind as PrintJobKind;

    const [total, rows] = await Promise.all([
      this.prisma.printJob.count({ where }),
      this.prisma.printJob.findMany({
        where,
        include: { printer: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, page, pageSize, list: rows.map((r) => this.mapJob(r)) };
  }

  private async loadStore(storeId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: BigInt(storeId) } });
    if (!store) throw new BusinessError('STORE_REQUIRED');
    return store;
  }

  private async loadPrinters(storeId: string) {
    return this.prisma.printer.findMany({
      where: { storeId: BigInt(storeId), isActive: true },
      include: { agent: true, station: true },
    });
  }

  private async dishStationMap(dishIds: string[]) {
    if (!dishIds.length) return new Map<string, string | null>();
    const dishes = await this.prisma.dish.findMany({
      where: { id: { in: dishIds.map((id) => BigInt(id)) } },
      include: { category: true },
    });
    const map = new Map<string, string | null>();
    for (const d of dishes) {
      map.set(d.id.toString(), d.category.kitchenStationId?.toString() ?? null);
    }
    return map;
  }

  private kindToTemplate(kind: PrintJobKind, roundNo?: number): PrintTemplate {
    switch (kind) {
      case PrintJobKind.add:
        return 'add';
      case PrintJobKind.void:
        return 'void';
      case PrintJobKind.cancel:
        return 'cancel';
      case PrintJobKind.receipt:
        return 'receipt';
      case PrintJobKind.delivery:
        return 'delivery';
      case PrintJobKind.shift:
        return 'shift';
      case PrintJobKind.order_kitchen:
        return roundNo && roundNo > 1 ? 'add' : 'kitchen';
      case PrintJobKind.order_front:
      default:
        return roundNo && roundNo > 1 ? 'add' : 'front';
    }
  }

  private buildPayload(opts: {
    kind: PrintJobKind;
    paperWidth: 58 | 80;
    store: { nameZh: string; nameVi: string; address?: string | null; phone?: string | null };
    order?: OrderMapped;
    items: {
      nameZh: string;
      nameVi: string;
      qty: number;
      unitPrice?: number;
      amount?: number;
      remark?: string | null;
    }[];
    roundNo?: number;
    stationNameZh?: string;
    stationNameVi?: string;
    shift?: PrintTicketPayload['data']['shift'];
  }): PrintTicketPayload {
    const template = this.kindToTemplate(opts.kind, opts.roundNo);
    const titleMap: Record<string, { zh: string; vi: string }> = {
      front: { zh: '前台总单', vi: 'Phiếu tổng' },
      kitchen: { zh: '厨房单', vi: 'Phiếu bếp' },
      add: { zh: '加菜', vi: 'THÊM MÓN' },
      void: { zh: '退菜', vi: 'HỦY MÓN' },
      cancel: { zh: '取消单', vi: 'Hủy đơn' },
      receipt: { zh: '结账小票', vi: 'Hóa đơn' },
      delivery: { zh: '外卖单', vi: 'Đơn giao hàng' },
      shift: { zh: '交班单', vi: 'Bàn giao ca' },
    };
    const titles = titleMap[template] || titleMap.front;
    return {
      template,
      paperWidth: opts.paperWidth,
      data: {
        storeNameZh: opts.store.nameZh,
        storeNameVi: opts.store.nameVi,
        address: opts.store.address,
        phone: opts.store.phone,
        tableCode: opts.order?.tableCode,
        orderNo: opts.order?.orderNo,
        roundNo: opts.roundNo,
        titleZh: titles.zh,
        titleVi: titles.vi,
        remark: opts.order?.remark,
        items: opts.items,
        subtotal: opts.order?.subtotal,
        discount: opts.order?.discount,
        serviceCharge: opts.order?.serviceCharge,
        deliveryFee: opts.order?.deliveryFee,
        total: opts.order?.total,
        paidAmount: opts.order?.paidAmount,
        payments: opts.order?.payments,
        createdAt: opts.order?.createdAt
          ? new Date(opts.order.createdAt).toISOString()
          : new Date().toISOString(),
        stationNameZh: opts.stationNameZh,
        stationNameVi: opts.stationNameVi,
        shift: opts.shift,
      },
    };
  }

  private async createAndPush(opts: {
    printer: PrinterRow;
    kind: PrintJobKind;
    payload: PrintTicketPayload;
    orderId?: string;
    batchId?: string;
  }) {
    if (!opts.printer.agentId) {
      this.logger.warn(`printer ${opts.printer.id} has no agent, skip`);
      return null;
    }
    const job = await this.prisma.printJob.create({
      data: {
        printerId: opts.printer.id,
        orderId: opts.orderId ? BigInt(opts.orderId) : undefined,
        batchId: opts.batchId ? BigInt(opts.batchId) : undefined,
        kind: opts.kind,
        payload: opts.payload as unknown as Prisma.InputJsonValue,
        status: PrintJobStatus.queued,
      },
    });
    await this.dispatchJob(job.id.toString());
    return job;
  }

  async dispatchJob(jobId: string) {
    const job = await this.prisma.printJob.findUnique({
      where: { id: BigInt(jobId) },
      include: { printer: { include: { agent: true } } },
    });
    if (!job || !job.printer.agentId) return;
    if (job.status === PrintJobStatus.done) return;

    const paperWidth = this.paperWidth(job.printer.paperWidth);
    const payload = job.payload as PrintTicketPayload;
    payload.paperWidth = paperWidth;

    const msg: PrintJobMessage & { agentId: string } = {
      jobId: job.id.toString(),
      agentId: job.printer.agentId.toString(),
      printer: {
        id: job.printer.id.toString(),
        name: job.printer.name,
        ip: job.printer.ip,
        port: job.printer.port,
        paperWidth,
      },
      payload,
    };

    const sent = await this.driver.push(msg);
    if (sent) {
      await this.prisma.printJob.update({
        where: { id: job.id },
        data: { status: PrintJobStatus.sent },
      });
    }
  }

  /** 代理上线后补发 queued / 失败可重试任务 */
  async flushAgentQueue(agentId: string) {
    const jobs = await this.prisma.printJob.findMany({
      where: {
        printer: { agentId: BigInt(agentId) },
        status: { in: [PrintJobStatus.queued, PrintJobStatus.sent] },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    for (const job of jobs) {
      await this.dispatchJob(job.id.toString());
    }
  }

  async handleAck(jobId: string, status: 'done' | 'failed', error?: string) {
    const job = await this.prisma.printJob.findUnique({
      where: { id: BigInt(jobId) },
      include: { printer: true, batch: true },
    });
    if (!job) return;

    if (status === 'done') {
      await this.prisma.printJob.update({
        where: { id: job.id },
        data: { status: PrintJobStatus.done, error: null },
      });
      if (job.batchId) {
        await this.prisma.orderBatch.update({
          where: { id: job.batchId },
          data: { printStatus: BatchPrintStatus.printed },
        });
      }
      this.events.emit(Events.PRINT_DONE, {
        storeId: job.printer.storeId.toString(),
        jobId,
        orderId: job.orderId?.toString(),
      });
      return;
    }

    const retries = job.retries + 1;
    if (retries < MAX_RETRIES) {
      await this.prisma.printJob.update({
        where: { id: job.id },
        data: {
          status: PrintJobStatus.queued,
          retries,
          error: error || 'print failed',
        },
      });
      setTimeout(() => {
        void this.dispatchJob(jobId);
      }, 2000 * retries);
      return;
    }

    await this.prisma.printJob.update({
      where: { id: job.id },
      data: {
        status: PrintJobStatus.failed,
        retries,
        error: error || 'print failed',
      },
    });
    if (job.batchId) {
      await this.prisma.orderBatch.update({
        where: { id: job.batchId },
        data: { printStatus: BatchPrintStatus.failed },
      });
    }
    this.events.emit(Events.PRINT_FAILED, {
      storeId: job.printer.storeId.toString(),
      jobId,
      orderId: job.orderId?.toString(),
      error: error || 'print failed',
      message: error || 'print failed',
    });
  }

  async reprint(storeId: string, jobId: string, printerId?: string) {
    const job = await this.prisma.printJob.findUnique({
      where: { id: BigInt(jobId) },
      include: { printer: true },
    });
    if (!job || job.printer.storeId !== BigInt(storeId)) {
      throw new BusinessError('PRINT_JOB_NOT_FOUND');
    }
    let targetPrinterId = job.printerId;
    if (printerId) {
      const p = await this.prisma.printer.findFirst({
        where: { id: BigInt(printerId), storeId: BigInt(storeId), isActive: true },
      });
      if (!p) throw new BusinessError('PRINTER_NOT_FOUND');
      targetPrinterId = p.id;
    }
    const created = await this.prisma.printJob.create({
      data: {
        printerId: targetPrinterId,
        orderId: job.orderId,
        batchId: job.batchId,
        kind: job.kind,
        payload: job.payload as Prisma.InputJsonValue,
        status: PrintJobStatus.queued,
      },
      include: { printer: true },
    });
    await this.dispatchJob(created.id.toString());
    return this.mapJob(created);
  }

  /** 堂食/加菜批次 → 前台总单 + 厨房分单 */
  async printBatch(storeId: string, order: OrderMapped, batchId: string, opts?: { needConfirm?: boolean; confirmed?: boolean }) {
    if (opts?.needConfirm && !opts?.confirmed) {
      this.logger.debug(`batch ${batchId} need confirm, skip print`);
      return;
    }

    const batch = order.batches.find((b) => b.id === batchId);
    if (!batch) return;
    if (batch.printStatus === BatchPrintStatus.need_confirm && !opts?.confirmed) return;

    const store = await this.loadStore(storeId);
    const printers = await this.loadPrinters(storeId);
    const activeItems = batch.items.filter((i) => i.status !== 'voided');
    if (!activeItems.length) return;

    const isAdd = batch.roundNo > 1;
    const frontKind = isAdd ? PrintJobKind.add : PrintJobKind.order_front;
    const kitchenKind = isAdd ? PrintJobKind.add : PrintJobKind.order_kitchen;

    // 外卖走 delivery 模板
    if (order.type === 'delivery' || order.type === 'takeaway') {
      const frontPrinters = printers.filter((p) => p.role === PrinterRole.front);
      for (const printer of frontPrinters) {
        const payload = this.buildPayload({
          kind: PrintJobKind.delivery,
          paperWidth: this.paperWidth(printer.paperWidth),
          store,
          order,
          items: activeItems,
          roundNo: batch.roundNo,
        });
        await this.createAndPush({
          printer,
          kind: PrintJobKind.delivery,
          payload,
          orderId: order.id,
          batchId: batch.id,
        });
      }
      return;
    }

    const frontPrinters = printers.filter((p) => p.role === PrinterRole.front);
    for (const printer of frontPrinters) {
      const payload = this.buildPayload({
        kind: frontKind,
        paperWidth: this.paperWidth(printer.paperWidth),
        store,
        order,
        items: activeItems,
        roundNo: batch.roundNo,
      });
      await this.createAndPush({
        printer,
        kind: frontKind,
        payload,
        orderId: order.id,
        batchId: batch.id,
      });
    }

    const stationMap = await this.dishStationMap(activeItems.map((i) => i.dishId));
    const byStation = new Map<string, typeof activeItems>();
    for (const item of activeItems) {
      const sid = stationMap.get(item.dishId) || '_default';
      if (!byStation.has(sid)) byStation.set(sid, []);
      byStation.get(sid)!.push(item);
    }

    const kitchenPrinters = printers.filter((p) => p.role === PrinterRole.kitchen);
    for (const [stationId, items] of byStation) {
      const targets =
        stationId === '_default'
          ? kitchenPrinters
          : kitchenPrinters.filter((p) => p.stationId?.toString() === stationId);
      const fallback = targets.length ? targets : kitchenPrinters;
      for (const printer of fallback) {
        if (store.printSplitItem) {
          for (const item of items) {
            for (let q = 0; q < item.qty; q++) {
              const payload = this.buildPayload({
                kind: kitchenKind,
                paperWidth: this.paperWidth(printer.paperWidth),
                store,
                order,
                items: [{ ...item, qty: 1 }],
                roundNo: batch.roundNo,
                stationNameZh: printer.station?.nameZh,
                stationNameVi: printer.station?.nameVi,
              });
              await this.createAndPush({
                printer,
                kind: kitchenKind,
                payload,
                orderId: order.id,
                batchId: batch.id,
              });
            }
          }
        } else {
          const payload = this.buildPayload({
            kind: kitchenKind,
            paperWidth: this.paperWidth(printer.paperWidth),
            store,
            order,
            items,
            roundNo: batch.roundNo,
            stationNameZh: printer.station?.nameZh,
            stationNameVi: printer.station?.nameVi,
          });
          await this.createAndPush({
            printer,
            kind: kitchenKind,
            payload,
            orderId: order.id,
            batchId: batch.id,
          });
        }
      }
    }
  }

  async printVoid(
    storeId: string,
    order: OrderMapped,
    item: {
      id: string;
      dishId: string;
      nameZh: string;
      nameVi: string;
      qty: number;
      unitPrice: number;
      amount: number;
      remark?: string | null;
    },
  ) {
    const store = await this.loadStore(storeId);
    const printers = await this.loadPrinters(storeId);
    const stationMap = await this.dishStationMap([item.dishId]);
    const stationId = stationMap.get(item.dishId);
    const kitchenPrinters = printers.filter((p) => p.role === PrinterRole.kitchen);
    const targets = stationId
      ? kitchenPrinters.filter((p) => p.stationId?.toString() === stationId)
      : kitchenPrinters;
    const list = targets.length ? targets : kitchenPrinters;
    for (const printer of list) {
      const payload = this.buildPayload({
        kind: PrintJobKind.void,
        paperWidth: this.paperWidth(printer.paperWidth),
        store,
        order,
        items: [item],
        stationNameZh: printer.station?.nameZh,
        stationNameVi: printer.station?.nameVi,
      });
      await this.createAndPush({
        printer,
        kind: PrintJobKind.void,
        payload,
        orderId: order.id,
      });
    }
  }

  async printCancel(storeId: string, order: OrderMapped) {
    const store = await this.loadStore(storeId);
    const printers = await this.loadPrinters(storeId);
    const items = (order.items || []).filter((i) => i.status !== 'voided');
    for (const printer of printers.filter((p) => p.role === PrinterRole.front || p.role === PrinterRole.kitchen)) {
      const payload = this.buildPayload({
        kind: PrintJobKind.cancel,
        paperWidth: this.paperWidth(printer.paperWidth),
        store,
        order,
        items,
      });
      await this.createAndPush({
        printer,
        kind: PrintJobKind.cancel,
        payload,
        orderId: order.id,
      });
    }
  }

  async printReceipt(storeId: string, order: OrderMapped) {
    const store = await this.loadStore(storeId);
    const printers = await this.loadPrinters(storeId);
    const items = (order.items || order.batches.flatMap((b) => b.items)).filter(
      (i) => i.status !== 'voided',
    );
    for (const printer of printers.filter((p) => p.role === PrinterRole.front)) {
      const payload = this.buildPayload({
        kind: PrintJobKind.receipt,
        paperWidth: this.paperWidth(printer.paperWidth),
        store,
        order,
        items,
      });
      await this.createAndPush({
        printer,
        kind: PrintJobKind.receipt,
        payload,
        orderId: order.id,
      });
    }
  }

  async printShift(
    storeId: string,
    shift: { cashierName?: string; from?: string; to?: string; orderCount?: number; totalSales?: number },
  ) {
    const store = await this.loadStore(storeId);
    const printers = await this.loadPrinters(storeId);
    for (const printer of printers.filter((p) => p.role === PrinterRole.front)) {
      const payload = this.buildPayload({
        kind: PrintJobKind.shift,
        paperWidth: this.paperWidth(printer.paperWidth),
        store,
        items: [],
        shift,
      });
      await this.createAndPush({ printer, kind: PrintJobKind.shift, payload });
    }
    return { ok: true };
  }
}
