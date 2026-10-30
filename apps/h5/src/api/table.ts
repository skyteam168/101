import { apiDelete, apiGet, apiPatch, apiPost } from './http';

export type TablePeek = {
  tableId: string;
  code: string;
  seats: number;
  status: string;
  storeId: string;
  storeNameZh: string;
  storeNameVi: string;
  areaNameZh: string;
  areaNameVi: string;
  qrAutoOpen: boolean;
  qrRequirePin: boolean;
  needPin: boolean;
  hasSession: boolean;
};

export type CartLine = {
  id: string;
  dishId: string;
  nameZh: string;
  nameVi: string;
  unitPrice: number;
  qty: number;
  amount: number;
  optionsSnapshot: unknown;
  nickname: string;
  guestId: string;
};

export type OrderBatch = {
  id: string;
  roundNo: number;
  source: string;
  guestNickname: string | null;
  printStatus: string;
  createdAt: string;
  items: Array<{
    id: string;
    nameZh: string;
    nameVi: string;
    unitPrice: number;
    qty: number;
    amount: number;
    status: string;
    guestNickname: string | null;
  }>;
};

export type GuestOrder = {
  id: string;
  orderNo: string;
  status: string;
  subtotal: number;
  discount: number;
  serviceCharge: number;
  total: number;
  tableCode: string | null;
  tableSessionId: string | null;
  batches: OrderBatch[];
};

export type JoinResult = {
  guestToken: string;
  guestId: string;
  nickname: string;
  tableId: string;
  tableCode: string;
  storeId: string;
  sessionId: string;
  pin: string;
  sessionToken: string;
  cart: CartLine[];
};

export type MenuCategory = {
  id: string;
  nameZh: string;
  nameVi: string;
  dishes: Array<{
    id: string;
    nameZh: string;
    nameVi: string;
    descZh: string | null;
    descVi: string | null;
    image: string | null;
    price: number;
    unit: string;
    stock: number | null;
    options: Array<{
      id: string;
      groupNameZh: string;
      groupNameVi: string;
      optionNameZh: string;
      optionNameVi: string;
      extraPrice: number;
      required: boolean;
      multi: boolean;
    }>;
  }>;
};

export const peekTableApi = (qrToken: string) => apiGet<TablePeek>(`/public/table/${qrToken}`);

export const joinTableApi = (
  qrToken: string,
  body: { nickname: string; pin?: string; guestCount?: number },
) => apiPost<JoinResult>(`/public/table/${qrToken}/join`, body);

export const sessionStateApi = () =>
  apiGet<{ cart: CartLine[]; cartTotal: number; order: GuestOrder | null }>(
    '/public/table/session/state',
  );

export const getCartApi = () => apiGet<CartLine[]>('/public/table/session/cart');

export const addCartApi = (
  items: { dishId: string; qty: number; optionsSnapshot?: unknown }[],
) => apiPost<CartLine[]>('/public/table/session/cart/items', { items });

export const patchCartItemApi = (itemId: string, qty: number) =>
  apiPatch<CartLine[]>(`/public/table/session/cart/items/${itemId}`, { qty });

export const removeCartItemApi = (itemId: string) =>
  apiDelete<CartLine[]>(`/public/table/session/cart/items/${itemId}`);

export const submitCartApi = () => apiPost<GuestOrder>('/public/table/session/submit');

export const callWaiterApi = () => apiPost('/public/table/session/call-waiter');

export const requestBillApi = () => apiPost('/public/table/session/request-bill');

export const publicMenuApi = (storeId: string) =>
  apiGet<MenuCategory[]>('/public/menu', { storeId, channel: 'dine_in' });
