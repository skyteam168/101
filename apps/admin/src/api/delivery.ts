import { apiDelete, apiGet, apiPost } from './http';

export type DeliveryOrder = {
  id: string;
  orderNo: string;
  status: string;
  payMethod?: string | null;
  paymentStatus: string;
  customer?: { id: string; name: string | null; phone: string | null; email: string } | null;
  addressSnapshot?: {
    contactName?: string;
    phone?: string;
    addressText?: string;
    detail?: string;
    landmarkPhoto?: string | null;
    distanceKm?: number;
  } | null;
  subtotal: number;
  deliveryFee: number;
  total: number;
  paidAmount?: number;
  remark?: string | null;
  memberPriority?: boolean;
  cancelReason?: string | null;
  courierId?: string | null;
  courierName?: string | null;
  createdAt: string;
  items: {
    id: string;
    nameZh: string;
    nameVi: string;
    qty: number;
    amount: number;
    optionsSnapshot?: unknown;
  }[];
};

export type DeliveryCustomer = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  lang: string;
  orderCount: number;
  createdAt: string;
};

export type DeliveryBoardQuery = {
  status?: string;
  keyword?: string;
  from?: string;
  to?: string;
  paymentStatus?: string;
};

export const listDeliveryBoardApi = (params?: DeliveryBoardQuery) =>
  apiGet<DeliveryOrder[]>('/delivery/board', params);

/** 待接单外卖数量（菜单角标） */
export const getPendingDeliveryCountApi = () =>
  apiGet<{ count: number }>('/delivery/pending-count', undefined, {
    skipLoading: true,
    skipErrorToast: true,
  });

export const listDeliveryCustomersApi = () => apiGet<DeliveryCustomer[]>('/delivery/customers');

export const acceptDeliveryApi = (id: string) => apiPost(`/delivery/orders/${id}/accept`);
export const rejectDeliveryApi = (id: string, reason: string) =>
  apiPost(`/delivery/orders/${id}/reject`, { reason });
export const cookingDeliveryApi = (id: string) => apiPost(`/delivery/orders/${id}/cooking`);
export const deliveringDeliveryApi = (id: string) => apiPost(`/delivery/orders/${id}/delivering`);
export const completeDeliveryApi = (id: string) => apiPost(`/delivery/orders/${id}/complete`);
export const cancelDeliveryApi = (id: string, reason?: string) =>
  apiPost(`/delivery/orders/${id}/cancel`, { reason });
export const assignCourierApi = (id: string, courierId: string) =>
  apiPost(`/delivery/orders/${id}/assign`, { courierId });
export const deleteDeliveryApi = (id: string) => apiDelete(`/delivery/orders/${id}`);
