import { apiGet, apiPatch, apiPost } from './http';

export type OrderItem = {
  id: string;
  batchId?: string;
  dishId: string | null;
  nameZh: string;
  nameVi: string;
  originUnitPrice?: number;
  unitPrice: number;
  qty: number;
  lineDiscount?: number;
  isGift?: boolean;
  amount: number;
  status: string;
  voidReason?: string | null;
  optionsSnapshot?: unknown;
  guestNickname?: string | null;
};

export type OrderBatch = {
  id: string;
  roundNo: number;
  source: string;
  guestNickname: string | null;
  printStatus: string;
  createdAt: string;
  items: OrderItem[];
};

export type Payment = {
  id: string;
  method: string;
  amount: number;
  received: number;
  change: number;
  createdAt: string;
};

export type OrderRefund = {
  id: string;
  method: string;
  amount: number;
  reason: string;
  operatorId: string | null;
  createdAt: string;
};

export type Order = {
  id: string;
  orderNo: string;
  type: string;
  source: string;
  status: string;
  paymentStatus: string;
  tableSessionId: string | null;
  tableCode: string | null;
  tableId: string | null;
  guestCount?: number | null;
  remark: string | null;
  cancelReason: string | null;
  customerId?: string | null;
  couponId?: string | null;
  subtotal: number;
  discount: number;
  roundOff?: number;
  serviceCharge: number;
  deliveryFee: number;
  total: number;
  paidAmount: number;
  refundedAmount?: number;
  promoSnapshot?: {
    rules?: { id: string; nameZh: string; amount: number }[];
    coupon?: { id: string; nameZh: string; amount: number } | null;
    memberPercent?: number;
    memberDiscount?: number;
    manualDiscount?: number;
  } | null;
  createdAt: string;
  updatedAt: string;
  batches: OrderBatch[];
  items: OrderItem[];
  payments: Payment[];
  refunds?: OrderRefund[];
};

export type OrderListResult = {
  total: number;
  page: number;
  pageSize: number;
  list: Order[];
};

export const listOrdersApi = (params?: Record<string, string | number | undefined>) =>
  apiGet<OrderListResult>('/orders', params);

export const getOrderApi = (id: string) => apiGet<Order>(`/orders/${id}`);

export const getOrderByTableApi = (tableId: string) =>
  apiGet<Order | null>(`/orders/by-table/${tableId}`);

export const submitOrderApi = (data: {
  tableId: string;
  items: { dishId: string; qty: number; optionsSnapshot?: unknown }[];
  remark?: string;
}) => apiPost<Order>('/orders/submit', data);

/** 未结清外带单 */
export const listOpenTakeawaysApi = () => apiGet<Order[]>('/orders/takeaway/open');

/** 收银台外带开单 */
export const createTakeawayOrderApi = (data: {
  items: { dishId: string; qty: number; optionsSnapshot?: unknown }[];
  remark?: string;
}) => apiPost<Order>('/orders/takeaway', data);

export const addOrderItemsApi = (
  orderId: string,
  items: { dishId: string; qty: number; optionsSnapshot?: unknown }[],
) => apiPost<Order>(`/orders/${orderId}/items`, { items });

export const voidOrderItemApi = (itemId: string, reason: string) =>
  apiPost<Order>(`/orders/items/${itemId}/void`, { reason });

export const cancelOrderApi = (orderId: string, reason: string) =>
  apiPost<Order>(`/orders/${orderId}/cancel`, { reason });

export const setDiscountApi = (
  orderId: string,
  data: { discount: number; serviceCharge?: number; roundOff?: number },
) => apiPatch<Order>(`/orders/${orderId}/discount`, data);

export const addTempItemApi = (
  orderId: string,
  data: { nameZh: string; nameVi: string; unitPrice: number; qty?: number },
) => apiPost<Order>(`/orders/${orderId}/temp-item`, data);

export const updateLineItemApi = (
  itemId: string,
  data: { lineDiscount?: number; percent?: number; isGift?: boolean },
) => apiPatch<Order>(`/orders/items/${itemId}/line`, data);

export const bindCustomerApi = (
  orderId: string,
  data: { customerId?: string | null; couponId?: string | null },
) => apiPost<Order>(`/orders/${orderId}/bind-customer`, data);

export const freeOrderApi = (orderId: string) => apiPost<Order>(`/orders/${orderId}/free`);

export const checkoutOrderApi = (
  orderId: string,
  payments: { method: string; amount: number; received?: number }[],
) => apiPost<Order>(`/orders/${orderId}/checkout`, { payments });

export const reverseCheckoutApi = (orderId: string) =>
  apiPost<Order>(`/orders/${orderId}/reverse-checkout`);

export const refundOrderApi = (
  orderId: string,
  data: { amount: number; method: string; reason: string },
) => apiPost<Order>(`/orders/${orderId}/refund`, data);

export const confirmBatchApi = (batchId: string) =>
  apiPost<Order>(`/orders/batches/${batchId}/confirm`);

/** 扫码待确认轮次数量（菜单角标） */
export const getPendingConfirmCountApi = () =>
  apiGet<{ count: number }>('/orders/pending-confirm-count');
