import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BatchPrintStatus,
  PrintJobKind,
  PrintJobStatus,
  PrinterConnectionType,
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
import { BrowserDriver } from './drivers/browser.driver';
import { CloudPrinterDriver } from './drivers/cloud-printer.driver';

type OrderMapped = {
  id: string;
  orderNo: string;
  type: string;
  tableCode?: string | null;
  guestCount?: number | null;
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
  refundedAmount?: number;
};

export type RefundPrintInfo = {
  id: string;
  amount: number;
  method: string;
  reason: string;
  createdAt?: string | Date;
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
    private readonly browserDriver: BrowserDriver,
    private readonly cloudDriver: CloudPrinterDriver,
    private readonly events: EventEmitter2,
  ) {}

  private printersForRole(printers: PrinterRow[], role: PrinterRole) {
    return printers.filter((p) => p.role === role || p.acceptAllTickets);
  }

  /**
   * 厨房分单目标：有档口专属机时只用专属机，避免与 acceptAllTickets 机重复打两份。
   */
  private resolveKitchenTargets(kitchenPrinters: PrinterRow[], stationId: string): PrinterRow[] {
    if (stationId === '_default') {
      const unbound = kitchenPrinters.filter((p) => !p.stationId);
      return unbound.length ? unbound : kitchenPrinters;
    }
    const bound = kitchenPrinters.filter((p) => p.stationId?.toString() === stationId);
    if (bound.length) return bound;
    const catchAll = kitchenPrinters.filter((p) => p.acceptAllTickets);
    return catchAll.length ? catchAll : kitchenPrinters;
  }

  private dedupePrinters(list: PrinterRow[]) {
    const map = new Map<string, PrinterRow>();
    for (const p of list) map.set(p.id.toString(), p);
    return [...map.values()];
  }

  private isBrowserPrinter(p: { connectionType: PrinterConnectionType }) {
    return p.connectionType === PrinterConnectionType.browser_usb;
  }

  private isCloudPrinter(p: { connectionType: PrinterConnectionType }) {
    return p.connectionType === PrinterConnectionType.cloud;
  }

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
      case PrintJobKind.refund:
        return 'refund';
      case PrintJobKind.delivery:
        return 'delivery';
      case PrintJobKind.shift:
        return 'shift';
      case PrintJobKind.order_kitchen:
        // 后厨始终用 kitchen 模板；加菜只改标题，避免与前台加菜单打成一模一样
        return 'kitchen';
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
    refund?: RefundPrintInfo;
  }): PrintTicketPayload {
    const template = this.kindToTemplate(opts.kind, opts.roundNo);
    const isKitchenAdd = template === 'kitchen' && !!opts.roundNo && opts.roundNo > 1;
    const titleMap: Record<string, { zh: string; vi: string }> = {
      front: { zh: '【堂食】前台总单', vi: '【Tại chỗ】Phiếu tổng' },
      kitchen: isKitchenAdd
        ? { zh: '【后厨】加菜', vi: '【Bếp】THÊM MÓN' }
        : { zh: '【后厨】厨房单', vi: '【Bếp】Phiếu bếp' },
      add: { zh: '【堂食】加菜', vi: '【Tại chỗ】THÊM MÓN' },
      void: { zh: '【后厨】退菜', vi: '【Bếp】HỦY MÓN' },
      cancel: { zh: '【取消】取消单', vi: '【Hủy】Hủy đơn' },
      receipt: { zh: '【结账】结账小票', vi: '【TT】Hóa đơn' },
      refund: { zh: '【退款】退款小票', vi: '【Hoàn】Phiếu hoàn tiền' },
      delivery: { zh: '【外卖】外卖单', vi: '【Giao】Đơn giao hàng' },
      shift: { zh: '【交班】交班单', vi: '【Ca】Bàn giao ca' },
    };
    const titles = titleMap[template] || titleMap.front;
    const isReceipt = template === 'receipt';
    const isRefund = template === 'refund';
    return {
      template,
      paperWidth: opts.paperWidth,
      data: {
        storeNameZh: opts.store.nameZh,
        storeNameVi: opts.store.nameVi,
        address: opts.store.address,
        phone: opts.store.phone,
        tableCode: opts.order?.tableCode,
        guestCount: opts.order?.guestCount ?? null,
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
        paidAt: isReceipt ? new Date().toISOString() : undefined,
        refundId: opts.refund?.id,
        refundAmount: opts.refund?.amount,
        refundMethod: opts.refund?.method,
        refundReason: opts.refund?.reason,
        refundedAt: opts.refund?.createdAt
          ? new Date(opts.refund.createdAt).toISOString()
          : isRefund
            ? new Date().toISOString()
            : undefined,
        refundedAmount: opts.order?.refundedAmount,
        footerZh: isRefund
          ? '退款凭证请妥善保管'
          : template === 'receipt' || template === 'front' || template === 'delivery'
            ? '欢迎下次光临'
            : undefined,
        footerVi: isRefund
          ? 'Vui lòng giữ phiếu hoàn tiền'
          : template === 'receipt' || template === 'front' || template === 'delivery'
            ? 'Hẹn gặp lại'
            : undefined,
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
    const browser = this.isBrowserPrinter(opts.printer);
    const cloud = this.isCloudPrinter(opts.printer);
    if (!browser && !cloud && !opts.printer.agentId) {
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
    if (!job) return;
    if (job.status === PrintJobStatus.done) return;

    const paperWidth = this.paperWidth(job.printer.paperWidth);
    const payload = job.payload as PrintTicketPayload;
    payload.paperWidth = paperWidth;
    const browser = this.isBrowserPrinter(job.printer);

    if (browser) {
      const msg: PrintJobMessage = {
        jobId: job.id.toString(),
        printer: {
          id: job.printer.id.toString(),
          name: job.printer.name,
          paperWidth,
          connectionType: 'browser_usb',
        },
        payload,
      };
      const sent = await this.browserDriver.push(job.printer.storeId.toString(), msg);
      if (sent) {
        await this.prisma.printJob.update({
          where: { id: job.id },
          data: { status: PrintJobStatus.sent },
        });
      }
      return;
    }

    if (this.isCloudPrinter(job.printer)) {
      const msg: PrintJobMessage = {
        jobId: job.id.toString(),
        printer: {
          id: job.printer.id.toString(),
          name: job.printer.name,
          ip: job.printer.ip,
          port: job.printer.port,
          paperWidth,
          connectionType: 'cloud',
        },
        payload,
      };
      const sent = await this.cloudDriver.push(msg);
      if (sent) {
        // Webhook 无回执通道：2xx 即视为完成
        await this.prisma.printJob.update({
          where: { id: job.id },
          data: { status: PrintJobStatus.done, error: null },
        });
      } else {
        await this.handleAck(job.id.toString(), 'failed', 'CLOUD_WEBHOOK_FAILED');
      }
      return;
    }

    if (!job.printer.agentId) return;

    const agentConn =
      job.printer.connectionType === PrinterConnectionType.agent_usb ? 'agent_usb' : 'network';
    const msg: PrintJobMessage & { agentId: string } = {
      jobId: job.id.toString(),
      agentId: job.printer.agentId.toString(),
      printer: {
        id: job.printer.id.toString(),
        name: job.printer.name,
        ip: job.printer.ip,
        port: job.printer.port,
        paperWidth,
        connectionType: agentConn,
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
        printer: { agentId: BigInt(agentId), isActive: true },
        status: { in: [PrintJobStatus.queued, PrintJobStatus.sent] },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    for (const job of jobs) {
      await this.dispatchJob(job.id.toString());
    }
  }

  /** 打印台上线后补发浏览器 USB 队列 */
  async flushBrowserQueue(storeId: string) {
    const jobs = await this.prisma.printJob.findMany({
      where: {
        printer: {
          storeId: BigInt(storeId),
          connectionType: PrinterConnectionType.browser_usb,
        },
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

    // 同一 agentId 多开时：收银机 done 后，其它机器 failed 不得覆盖成功态
    if (job.status === PrintJobStatus.done) return;

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
    } else if (!job.printer.isActive) {
      // 旧任务可能绑在已停用的 127.0.0.1 网口机上：重打改走当前可用机
      const fallback =
        (await this.prisma.printer.findFirst({
          where: {
            storeId: BigInt(storeId),
            isActive: true,
            acceptAllTickets: true,
          },
          orderBy: { id: 'asc' },
        })) ||
        (await this.prisma.printer.findFirst({
          where: {
            storeId: BigInt(storeId),
            isActive: true,
            role: job.printer.role,
          },
          orderBy: { id: 'asc' },
        }));
      if (!fallback) throw new BusinessError('PRINTER_NOT_FOUND');
      targetPrinterId = fallback.id;
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
    // 后厨加菜仍走 order_kitchen，避免与前台加菜单同 kind/同版式连打多张「一样的」
    const kitchenKind = PrintJobKind.order_kitchen;

    // 外卖走 delivery 模板
    if (order.type === 'delivery' || order.type === 'takeaway') {
      const frontPrinters = this.printersForRole(printers, PrinterRole.front);
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

    const stationMap = await this.dishStationMap(activeItems.map((i) => i.dishId));
    const byStation = new Map<string, typeof activeItems>();
    for (const item of activeItems) {
      const sid = stationMap.get(item.dishId) || '_default';
      if (!byStation.has(sid)) byStation.set(sid, []);
      byStation.get(sid)!.push(item);
    }

    // 同一台打印机上的多档口菜合并成一张完整厨房单（避免热菜一张、饮品一张的「残单」）
    // 多台档口专属机仍各打各的。
    const kitchenPrinters = this.printersForRole(printers, PrinterRole.kitchen);
    const mergedByPrinter = new Map<
      string,
      { printer: (typeof kitchenPrinters)[number]; items: typeof activeItems }
    >();
    for (const [stationId, items] of byStation) {
      const targets = this.resolveKitchenTargets(kitchenPrinters, stationId);
      for (const printer of targets) {
        const key = printer.id.toString();
        const row = mergedByPrinter.get(key);
        if (row) {
          row.items.push(...items);
        } else {
          mergedByPrinter.set(key, { printer, items: [...items] });
        }
      }
    }

    const kitchenPrinterIds = new Set(mergedByPrinter.keys());
    const frontPrinters = this.printersForRole(printers, PrinterRole.front);
    for (const printer of frontPrinters) {
      // 加菜：同机已打后厨加菜单时不再打前台加菜，避免连出两张
      if (isAdd && kitchenPrinterIds.has(printer.id.toString())) continue;
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

    // 厨房单 / 加菜单各打 1 份完整联；一菜一切时仍按份拆
    for (const { printer, items } of mergedByPrinter.values()) {
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
    const kitchenPrinters = this.printersForRole(printers, PrinterRole.kitchen);
    const list = this.resolveKitchenTargets(
      kitchenPrinters,
      stationId?.toString() || '_default',
    );
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
    const cancelPrinters = this.dedupePrinters([
      ...this.printersForRole(printers, PrinterRole.front),
      ...this.printersForRole(printers, PrinterRole.kitchen),
    ]);
    for (const printer of cancelPrinters) {
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
    for (const printer of this.printersForRole(printers, PrinterRole.front)) {
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

  /** 退款小票 → 前台打印机（网口 agent / 浏览器 USB） */
  async printRefund(storeId: string, order: OrderMapped, refund: RefundPrintInfo) {
    const store = await this.loadStore(storeId);
    const printers = await this.loadPrinters(storeId);
    const items = (order.items || order.batches?.flatMap((b) => b.items) || []).filter(
      (i) => i.status !== 'voided',
    );
    for (const printer of this.printersForRole(printers, PrinterRole.front)) {
      const payload = this.buildPayload({
        kind: PrintJobKind.refund,
        paperWidth: this.paperWidth(printer.paperWidth),
        store,
        order,
        items,
        refund,
      });
      await this.createAndPush({
        printer,
        kind: PrintJobKind.refund,
        payload,
        orderId: order.id,
      });
    }
  }

  /**
   * 按退款记录重打退款小票；未传 refundId 则打最近一笔。
   */
  async printRefundByOrder(storeId: string, orderId: string, refundId?: string) {
    const oid = BigInt(orderId);
    const order = await this.prisma.order.findFirst({
      where: { id: oid, storeId: BigInt(storeId) },
      include: {
        batches: { include: { items: true } },
        items: true,
        payments: true,
        refunds: { orderBy: { createdAt: 'desc' } },
        tableSession: { include: { table: true } },
      },
    });
    if (!order) throw new BusinessError('ORDER_NOT_FOUND');
    if (!order.refunds.length) throw new BusinessError('REFUND_NOT_FOUND');

    const refundRow = refundId
      ? order.refunds.find((r) => r.id.toString() === refundId)
      : order.refunds[0];
    if (!refundRow) throw new BusinessError('REFUND_NOT_FOUND');

    const refundedAmount = order.refunds.reduce((s, r) => s + Number(r.amount), 0);
    const mapped: OrderMapped = {
      id: order.id.toString(),
      orderNo: order.orderNo,
      type: order.type,
      tableCode: order.tableSession?.table?.code ?? null,
      guestCount: order.tableSession?.guestCount ?? null,
      remark: order.remark,
      subtotal: Number(order.subtotal),
      discount: Number(order.discount),
      serviceCharge: Number(order.serviceCharge),
      deliveryFee: Number(order.deliveryFee),
      total: Number(order.total),
      paidAmount: Number(order.paidAmount),
      refundedAmount,
      createdAt: order.createdAt,
      batches: order.batches.map((b) => ({
        id: b.id.toString(),
        roundNo: b.roundNo,
        items: b.items.map((it) => ({
          id: it.id.toString(),
          dishId: it.dishId?.toString() ?? '',
          nameZh: it.nameZh,
          nameVi: it.nameVi,
          qty: it.qty,
          unitPrice: Number(it.unitPrice),
          amount: Number(it.amount),
          status: it.status,
        })),
      })),
      items: order.items.map((it) => ({
        id: it.id.toString(),
        dishId: it.dishId?.toString() ?? '',
        nameZh: it.nameZh,
        nameVi: it.nameVi,
        qty: it.qty,
        unitPrice: Number(it.unitPrice),
        amount: Number(it.amount),
        status: it.status,
      })),
      payments: order.payments.map((p) => ({
        method: p.method,
        amount: Number(p.amount),
      })),
    };

    await this.printRefund(storeId, mapped, {
      id: refundRow.id.toString(),
      amount: Number(refundRow.amount),
      method: refundRow.method,
      reason: refundRow.reason,
      createdAt: refundRow.createdAt,
    });
    return { ok: true, refundId: refundRow.id.toString() };
  }

  async printShift(
    storeId: string,
    shift: { cashierName?: string; from?: string; to?: string; orderCount?: number; totalSales?: number },
  ) {
    const store = await this.loadStore(storeId);
    const printers = await this.loadPrinters(storeId);
    for (const printer of this.printersForRole(printers, PrinterRole.front)) {
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
