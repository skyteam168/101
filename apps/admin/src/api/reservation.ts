import { apiDelete, apiGet, apiPatch, apiPost } from './http';

/** 预定状态 */
export type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'no_show'
  | 'seated';

export type ReservationItem = {
  id?: string;
  dishId: string | null;
  nameZh: string;
  nameVi: string;
  qty: number;
  unitPrice: number;
  optionsSnapshot?: unknown;
  remark?: string | null;
};

/** 预定记录 */
export type Reservation = {
  id: string;
  customerName: string;
  phone: string;
  guestCount: number;
  reserveAt: string;
  tableId: string | null;
  tableCode: string | null;
  status: ReservationStatus;
  deposit: number;
  remark: string | null;
  memberPriority?: boolean;
  items?: ReservationItem[];
  preorderCount?: number;
  orderId?: string | null;
  createdAt: string;
};

type ReservationListResult = {
  list: Reservation[];
  total: number;
  page: number;
  pageSize: number;
};

/** 列表（支持日期/状态/关键词筛选） */
export const listReservationsApi = async (params?: {
  date?: string;
  status?: string;
  keyword?: string;
}) => {
  const res = await apiGet<ReservationListResult | Reservation[]>('/reservations', params);
  return Array.isArray(res) ? res : res.list;
};

/** 待确认预定数量（菜单角标） */
export const getPendingReservationCountApi = () =>
  apiGet<{ count: number }>('/reservations/pending-count');

/** 厨房预点备料 */
export const listKitchenPreordersApi = () =>
  apiGet<Reservation[]>('/reservations/kitchen-preorders');

/** 新建 */
export const createReservationApi = (data: Record<string, unknown>) =>
  apiPost<Reservation>('/reservations', data);

/** 编辑 */
export const updateReservationApi = (id: string, data: Record<string, unknown>) =>
  apiPatch<Reservation>(`/reservations/${id}`, data);

/** 删除 */
export const deleteReservationApi = (id: string) =>
  apiDelete(`/reservations/${id}`);

/** 确认预定 */
export const confirmReservationApi = (id: string) =>
  apiPost<Reservation>(`/reservations/${id}/confirm`, {});

/** 取消 */
export const cancelReservationApi = (id: string, reason?: string) =>
  apiPost<Reservation>(`/reservations/${id}/cancel`, { reason });

/** 爽约 */
export const noShowReservationApi = (id: string) =>
  apiPost<Reservation>(`/reservations/${id}/no-show`, {});

/** 入座（需传 tableId） */
export const seatReservationApi = (id: string, tableId: string) =>
  apiPost<Reservation>(`/reservations/${id}/seat`, { tableId });
