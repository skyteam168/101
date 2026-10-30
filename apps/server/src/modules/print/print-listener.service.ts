import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Events } from '@restaurant/shared';
import { PrintJobService } from './print-job.service';

@Injectable()
export class PrintListenerService {
  private readonly logger = new Logger(PrintListenerService.name);

  constructor(private readonly jobs: PrintJobService) {}

  @OnEvent(Events.ORDER_BATCH_ADDED)
  async onBatch(payload: {
    storeId?: string;
    orderId?: string;
    batch?: { id?: string; roundNo?: number };
    roundNo?: number;
    needConfirm?: boolean;
    confirmed?: boolean;
    order?: Record<string, unknown>;
  }) {
    try {
      const storeId = payload.storeId ? String(payload.storeId) : null;
      const order = payload.order as
        | {
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
            createdAt?: string;
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
          }
        | undefined;

      if (!storeId || !order) {
        this.logger.debug('ORDER_BATCH_ADDED missing order payload, skip print');
        return;
      }
      const batchId = String(payload.batch?.id || '');
      if (!batchId) return;
      await this.jobs.printBatch(storeId, order, batchId, {
        needConfirm: payload.needConfirm,
        confirmed: payload.confirmed,
      });
    } catch (e) {
      this.logger.error(`print batch failed: ${(e as Error).message}`);
    }
  }

  @OnEvent(Events.ORDER_ITEM_VOIDED)
  async onVoid(payload: {
    storeId?: string;
    order?: Record<string, unknown>;
    item?: Record<string, unknown>;
  }) {
    try {
      const storeId = payload.storeId ? String(payload.storeId) : null;
      const order = payload.order as Parameters<PrintJobService['printVoid']>[1] | undefined;
      const item = payload.item as Parameters<PrintJobService['printVoid']>[2] | undefined;
      if (!storeId || !order || !item) return;
      await this.jobs.printVoid(storeId, order, item);
    } catch (e) {
      this.logger.error(`print void failed: ${(e as Error).message}`);
    }
  }

  @OnEvent(Events.ORDER_CANCELLED)
  async onCancel(payload: { storeId?: string; order?: Record<string, unknown> }) {
    try {
      const storeId = payload.storeId ? String(payload.storeId) : null;
      const order = payload.order as Parameters<PrintJobService['printCancel']>[1] | undefined;
      if (!storeId || !order) return;
      await this.jobs.printCancel(storeId, order);
    } catch (e) {
      this.logger.error(`print cancel failed: ${(e as Error).message}`);
    }
  }

  @OnEvent(Events.ORDER_PAID)
  async onPaid(payload: { storeId?: string; order?: Record<string, unknown> }) {
    try {
      const storeId = payload.storeId ? String(payload.storeId) : null;
      const order = payload.order as Parameters<PrintJobService['printReceipt']>[1] | undefined;
      if (!storeId || !order) return;
      await this.jobs.printReceipt(storeId, order);
    } catch (e) {
      this.logger.error(`print receipt failed: ${(e as Error).message}`);
    }
  }

  @OnEvent('print.agent.online')
  async onAgentOnline(payload: { agentId?: string }) {
    if (!payload.agentId) return;
    try {
      await this.jobs.flushAgentQueue(payload.agentId);
    } catch (e) {
      this.logger.error(`flush agent queue failed: ${(e as Error).message}`);
    }
  }

  @OnEvent(Events.PRINT_ACK)
  async onAck(payload: { jobId?: string; status?: 'done' | 'failed'; error?: string }) {
    if (!payload.jobId || !payload.status) return;
    try {
      await this.jobs.handleAck(payload.jobId, payload.status, payload.error);
    } catch (e) {
      this.logger.error(`print ack failed: ${(e as Error).message}`);
    }
  }
}
