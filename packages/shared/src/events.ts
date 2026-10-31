/** Socket.IO / 内部事件名，禁止在业务代码中硬编码字符串 */
export const Events = {
  ORDER_CREATED: 'order.created',
  ORDER_BATCH_ADDED: 'order.batch_added',
  ORDER_ITEM_VOIDED: 'order.item_voided',
  ORDER_CANCELLED: 'order.cancelled',
  ORDER_PAID: 'order.paid',
  ORDER_STATUS_CHANGED: 'order.status_changed',
  /** 扫码待确认轮次数量变化（角标） */
  QR_PENDING_CHANGED: 'qr.pending_changed',
  DELIVERY_NEW: 'delivery.new',
  DELIVERY_STATUS_CHANGED: 'delivery.status_changed',
  TABLE_STATUS_CHANGED: 'table.status_changed',
  TABLE_CALL_WAITER: 'table.call_waiter',
  TABLE_REQUEST_BILL: 'table.request_bill',
  CART_UPDATED: 'cart.updated',
  DISH_UPDATED: 'dish.updated',
  RESERVATION_CREATED: 'reservation.created',
  /** 待确认预定数量变化（角标） */
  RESERVATION_PENDING_CHANGED: 'reservation.pending_changed',
  GROUP_MEAL_INQUIRY_CREATED: 'group_meal.inquiry_created',
  PRINT_JOB: 'print.job',
  PRINT_FAILED: 'print.failed',
  PRINT_DONE: 'print.done',
  PRINT_ACK: 'print.ack',
  CHAT_MESSAGE: 'chat.message',
  CHAT_READ: 'chat.read',
} as const;

export type EventName = (typeof Events)[keyof typeof Events];
