import { apiGet, apiPatch } from './http';

export type KitchenBoardItem = {
  id: string;
  orderId: string;
  orderNo: string;
  orderType: string;
  orderStatus: string;
  tableCode: string | null;
  batchId: string | null;
  roundNo: number | null;
  dishId: string | null;
  nameZh: string;
  nameVi: string;
  qty: number;
  status: 'pending' | 'cooking' | string;
  guestNickname: string | null;
  stationId: string | null;
  stationNameZh: string | null;
  stationNameVi: string | null;
  createdAt: string;
};

export const listKitchenBoardApi = (stationId?: string) =>
  apiGet<KitchenBoardItem[]>(
    '/orders/kitchen-board',
    stationId ? { stationId } : undefined,
  );

export const updateKitchenItemStatusApi = (itemId: string, status: 'cooking' | 'served') =>
  apiPatch<{ itemId: string; to: string }>(`/orders/items/${itemId}/status`, { status });
