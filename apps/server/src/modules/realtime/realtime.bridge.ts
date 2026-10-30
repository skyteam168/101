import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Events } from '@restaurant/shared';
import { RealtimeGateway } from './realtime.gateway';

/** 把内部 EventEmitter2 事件转发到 Socket.IO 房间 */
@Injectable()
export class RealtimeBridge {
  private readonly logger = new Logger(RealtimeBridge.name);

  constructor(private readonly gateway: RealtimeGateway) {}

  private storeId(payload: { storeId?: string }) {
    return payload.storeId ? String(payload.storeId) : null;
  }

  private sessionId(payload: Record<string, unknown>) {
    const order = payload.order as { tableSessionId?: string } | undefined;
    return (
      (payload.sessionId as string | undefined) ||
      order?.tableSessionId ||
      (payload.tableSessionId as string | undefined) ||
      null
    );
  }

  @OnEvent(Events.TABLE_STATUS_CHANGED)
  onTable(payload: { storeId?: string }) {
    const sid = this.storeId(payload);
    if (!sid) return;
    this.gateway.emitToStore(sid, Events.TABLE_STATUS_CHANGED, payload);
  }

  @OnEvent(Events.ORDER_CREATED)
  onOrderCreated(payload: { storeId?: string; order?: { tableSessionId?: string } }) {
    const sid = this.storeId(payload);
    if (sid) {
      this.gateway.emitToStore(sid, Events.ORDER_CREATED, payload);
      this.gateway.emitToKitchen(sid, Events.ORDER_CREATED, payload);
    }
    const sessionId = this.sessionId(payload as Record<string, unknown>);
    if (sessionId) this.gateway.emitToTable(sessionId, Events.ORDER_CREATED, payload);
  }

  @OnEvent(Events.ORDER_BATCH_ADDED)
  onBatch(payload: { storeId?: string; orderId?: string; sessionId?: string; batch?: unknown }) {
    const sid = this.storeId(payload);
    if (sid) {
      this.gateway.emitToStore(sid, Events.ORDER_BATCH_ADDED, payload);
      this.gateway.emitToKitchen(sid, Events.ORDER_BATCH_ADDED, payload);
    }
    const sessionId = this.sessionId(payload as Record<string, unknown>);
    if (sessionId) this.gateway.emitToTable(sessionId, Events.ORDER_BATCH_ADDED, payload);
  }

  @OnEvent(Events.ORDER_ITEM_VOIDED)
  onVoid(payload: { storeId?: string }) {
    const sid = this.storeId(payload);
    if (sid) this.gateway.emitToStore(sid, Events.ORDER_ITEM_VOIDED, payload);
    const sessionId = this.sessionId(payload as Record<string, unknown>);
    if (sessionId) this.gateway.emitToTable(sessionId, Events.ORDER_ITEM_VOIDED, payload);
  }

  @OnEvent(Events.ORDER_CANCELLED)
  onCancel(payload: { storeId?: string; order?: { customerId?: string; type?: string } }) {
    const sid = this.storeId(payload);
    if (sid) this.gateway.emitToStore(sid, Events.ORDER_CANCELLED, payload);
    const sessionId = this.sessionId(payload as Record<string, unknown>);
    if (sessionId) this.gateway.emitToTable(sessionId, Events.ORDER_CANCELLED, payload);
    const cid = payload.order?.customerId;
    if (cid && payload.order?.type === 'delivery') {
      this.gateway.emitToCustomer(cid, Events.ORDER_CANCELLED, payload);
    }
  }

  @OnEvent(Events.ORDER_PAID)
  onPaid(payload: { storeId?: string }) {
    const sid = this.storeId(payload);
    if (sid) this.gateway.emitToStore(sid, Events.ORDER_PAID, payload);
    const sessionId = this.sessionId(payload as Record<string, unknown>);
    if (sessionId) this.gateway.emitToTable(sessionId, Events.ORDER_PAID, payload);
  }

  @OnEvent(Events.ORDER_STATUS_CHANGED)
  onStatus(payload: { storeId?: string; order?: { customerId?: string; type?: string } }) {
    const sid = this.storeId(payload);
    if (sid) this.gateway.emitToStore(sid, Events.ORDER_STATUS_CHANGED, payload);
    const sessionId = this.sessionId(payload as Record<string, unknown>);
    if (sessionId) this.gateway.emitToTable(sessionId, Events.ORDER_STATUS_CHANGED, payload);
    const cid = payload.order?.customerId;
    if (cid && payload.order?.type === 'delivery') {
      this.gateway.emitToCustomer(cid, Events.ORDER_STATUS_CHANGED, payload);
    }
  }

  @OnEvent(Events.CART_UPDATED)
  onCart(payload: { sessionId?: string }) {
    if (payload.sessionId) {
      this.gateway.emitCartUpdated(payload.sessionId, payload);
    }
  }

  @OnEvent(Events.TABLE_CALL_WAITER)
  onCall(payload: { storeId?: string; sessionId?: string }) {
    const sid = this.storeId(payload);
    if (sid) this.gateway.emitToStore(sid, Events.TABLE_CALL_WAITER, payload);
  }

  @OnEvent(Events.TABLE_REQUEST_BILL)
  onBill(payload: { storeId?: string; sessionId?: string }) {
    const sid = this.storeId(payload);
    if (sid) this.gateway.emitToStore(sid, Events.TABLE_REQUEST_BILL, payload);
  }

  @OnEvent(Events.DISH_UPDATED)
  onDish(payload: { storeId?: string }) {
    const sid = this.storeId(payload);
    if (sid) this.gateway.emitDishUpdated(sid, payload);
  }

  @OnEvent(Events.PRINT_FAILED)
  onPrintFailed(payload: { storeId?: string }) {
    const sid = this.storeId(payload);
    if (sid) this.gateway.emitToStore(sid, Events.PRINT_FAILED, payload);
  }

  @OnEvent(Events.PRINT_DONE)
  onPrintDone(payload: { storeId?: string }) {
    const sid = this.storeId(payload);
    if (sid) this.gateway.emitToStore(sid, Events.PRINT_DONE, payload);
  }

  @OnEvent(Events.DELIVERY_NEW)
  onDeliveryNew(payload: { storeId?: string; order?: { customerId?: string } }) {
    const sid = this.storeId(payload);
    if (sid) this.gateway.emitToStore(sid, Events.DELIVERY_NEW, payload);
    const cid = payload.order?.customerId;
    if (cid) this.gateway.emitToCustomer(cid, Events.DELIVERY_NEW, payload);
  }

  @OnEvent(Events.DELIVERY_STATUS_CHANGED)
  onDeliveryStatus(payload: { storeId?: string; order?: { customerId?: string } }) {
    const sid = this.storeId(payload);
    if (sid) this.gateway.emitToStore(sid, Events.DELIVERY_STATUS_CHANGED, payload);
    const cid = payload.order?.customerId;
    if (cid) this.gateway.emitToCustomer(cid, Events.DELIVERY_STATUS_CHANGED, payload);
  }

  @OnEvent(Events.RESERVATION_CREATED)
  onReservationCreated(payload: { storeId?: string }) {
    const sid = this.storeId(payload);
    if (sid) this.gateway.emitToStore(sid, Events.RESERVATION_CREATED, payload);
  }

  @OnEvent(Events.GROUP_MEAL_INQUIRY_CREATED)
  onGroupMealInquiryCreated(payload: { storeId?: string }) {
    const sid = this.storeId(payload);
    if (sid) this.gateway.emitToStore(sid, Events.GROUP_MEAL_INQUIRY_CREATED, payload);
  }

}
