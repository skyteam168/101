/** Socket.IO / 内部事件名，禁止在业务代码中硬编码字符串 */
export const Events = {
  ORDER_CREATED: 'order.created',
  ORDER_BATCH_ADDED: 'order.batch_added',
  ORDER_ITEM_VOIDED: 'order.item_voided',
  /** 厨房看板：菜品制作状态变更 pending/cooking/served */
  ORDER_ITEM_STATUS_CHANGED: 'order.item_status_changed',
  ORDER_CANCELLED: 'order.cancelled',
  ORDER_PAID: 'order.paid',
  /** 正式退款成功（触发退款小票） */
  ORDER_REFUNDED: 'order.refunded',
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
  /** 预定已确认（厨房预点区刷新） */
  RESERVATION_CONFIRMED: 'reservation.confirmed',
  /** 预定取消/爽约/入座后厨房预点区刷新 */
  RESERVATION_PREORDER_CHANGED: 'reservation.preorder_changed',
  /** 待确认预定数量变化（角标） */
  RESERVATION_PENDING_CHANGED: 'reservation.pending_changed',
  GROUP_MEAL_INQUIRY_CREATED: 'group_meal.inquiry_created',
  PRINT_JOB: 'print.job',
  /** 推给收银电脑「打印台」浏览器（USB Web Serial） */
  PRINT_BROWSER_JOB: 'print.browser.job',
  PRINT_FAILED: 'print.failed',
  PRINT_DONE: 'print.done',
  PRINT_ACK: 'print.ack',
  /** 员工页声明本机为打印台 */
  PRINT_STATION_CLAIM: 'print.station.claim',
  PRINT_STATION_RELEASE: 'print.station.release',
  PRINT_STATION_STATUS: 'print.station.status',
  CHAT_MESSAGE: 'chat.message',
  CHAT_READ: 'chat.read',
} as const;

export type EventName = (typeof Events)[keyof typeof Events];
