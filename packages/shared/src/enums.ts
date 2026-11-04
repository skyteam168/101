/** 用户界面语言 */
export enum UserLang {
  ZH = 'zh',
  VI = 'vi',
}

/** 员工账号状态 */
export enum UserStatus {
  ACTIVE = 'active',
  DISABLED = 'disabled',
}

/** 权限类型 */
export enum PermissionType {
  MENU = 'menu',
  BUTTON = 'button',
  API = 'api',
}

/** 菜品上下架 */
export enum DishStatus {
  ON = 'on',
  OFF = 'off',
}

/** 桌台状态 */
export enum TableStatus {
  IDLE = 'idle',
  DINING = 'dining',
  CLEANING = 'cleaning',
}

/** 开台会话状态 */
export enum SessionStatus {
  OPEN = 'open',
  CLOSED = 'closed',
}

/** 订单类型 */
export enum OrderType {
  DINE_IN = 'dine_in',
  TAKEAWAY = 'takeaway',
  DELIVERY = 'delivery',
}

/** 订单来源 */
export enum OrderSource {
  WAITER = 'waiter',
  QR = 'qr',
  H5 = 'h5',
  POS = 'pos',
}

/**
 * 订单状态
 * 堂食：open → paid | cancelled
 * 外卖：pending → accepted → cooking → delivering → completed，可 cancelled/rejected
 */
export enum OrderStatus {
  OPEN = 'open',
  PAID = 'paid',
  CANCELLED = 'cancelled',
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  COOKING = 'cooking',
  DELIVERING = 'delivering',
  COMPLETED = 'completed',
  REJECTED = 'rejected',
}

/** 支付状态 */
export enum PaymentStatus {
  UNPAID = 'unpaid',
  PARTIAL = 'partial',
  PAID = 'paid',
  REFUNDED = 'refunded',
}

/** 订单明细状态 */
export enum OrderItemStatus {
  PENDING = 'pending',
  COOKING = 'cooking',
  SERVED = 'served',
  VOIDED = 'voided',
}

/** 支付方式 */
export enum PaymentMethod {
  CASH = 'cash',
  CARD = 'card',
  BANK_TRANSFER = 'bank_transfer',
  MOMO = 'momo',
  VNPAY = 'vnpay',
}

/** 打印机角色 */
export enum PrinterRole {
  FRONT = 'front',
  KITCHEN = 'kitchen',
}

/** 打印任务类型 */
export enum PrintJobKind {
  ORDER_FRONT = 'order_front',
  ORDER_KITCHEN = 'order_kitchen',
  ADD = 'add',
  VOID = 'void',
  RECEIPT = 'receipt',
  CANCEL = 'cancel',
  DELIVERY = 'delivery',
  SHIFT = 'shift',
  REFUND = 'refund',
}

/** 打印任务状态 */
export enum PrintJobStatus {
  QUEUED = 'queued',
  SENT = 'sent',
  DONE = 'done',
  FAILED = 'failed',
}

/** 打印代理在线状态 */
export enum PrintAgentStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
}

/** 轮次打印状态 */
export enum BatchPrintStatus {
  PENDING = 'pending',
  PRINTED = 'printed',
  FAILED = 'failed',
  NEED_CONFIRM = 'need_confirm',
}

/** 资产变动类型 */
export enum AssetEventType {
  IN = 'in',
  ASSIGN = 'assign',
  TRANSFER = 'transfer',
  REPAIR = 'repair',
  REPAIR_DONE = 'repair_done',
  SCRAP = 'scrap',
  SELL = 'sell',
  CHECK = 'check',
}
