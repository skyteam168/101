/**
 * 外卖 H5 API（对齐 apps/server delivery 模块）
 */
import { apiDelete, apiGet, apiPatch, apiPost } from './http';

export type StoreInfo = {
  id: string;
  nameZh: string;
  nameVi: string;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  deliveryRadiusKm: number;
  deliveryFeeRules: { maxKm: number; fee: number }[];
  minOrderAmount: number;
  businessHours: { open: string; close: string; days: number[] } | null;
  bankTransferQr: string | null;
  openNow: boolean;
};

export function getStoreInfo(): Promise<StoreInfo> {
  return apiGet('/public/delivery/store');
}

export type Dish = {
  id: string;
  nameZh: string;
  nameVi: string;
  descZh?: string;
  descVi?: string;
  image?: string | null;
  price: number;
  takeawayPrice?: number | null;
  unit: string;
  status: string;
  stock: number | null;
  options?: unknown[];
};

export type MenuCategory = {
  id: string;
  nameZh: string;
  nameVi: string;
  sort: number;
  dishes: Dish[];
};

/** 公开菜单可能是分类数组或 { categories } */
export async function getDeliveryMenu(): Promise<MenuCategory[]> {
  const data = await apiGet<MenuCategory[] | { categories: MenuCategory[] }>('/public/menu', {
    channel: 'delivery',
  });
  if (Array.isArray(data)) return data;
  return data.categories || [];
}

export type CustomerProfile = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  lang: string;
};

export type AuthResult = {
  accessToken: string;
  customer: CustomerProfile;
  /** 兼容旧字段 */
  token?: string;
};

export function sendCode(dto: { email: string; lang?: 'zh' | 'vi' }): Promise<{
  ok: boolean;
  expiresIn: number;
  devCode?: string;
}> {
  return apiPost('/public/delivery/auth/send-code', dto);
}

export function register(dto: {
  email: string;
  code: string;
  password: string;
  name?: string;
  lang?: 'zh' | 'vi';
}): Promise<AuthResult> {
  return apiPost('/public/delivery/auth/register', dto);
}

export function login(dto: { email: string; password: string }): Promise<AuthResult> {
  return apiPost('/public/delivery/auth/login', dto);
}

export function forgotPassword(dto: {
  email: string;
  code: string;
  newPassword: string;
}): Promise<AuthResult> {
  return apiPost('/public/delivery/auth/forgot-password', dto);
}

export function getMe(): Promise<CustomerProfile> {
  return apiGet('/public/delivery/me');
}

export function updateMe(dto: {
  name?: string;
  phone?: string;
  lang?: string;
  birthday?: string;
}): Promise<CustomerProfile> {
  return apiPatch('/public/delivery/me', dto);
}

export function cancelAccount(): Promise<{ ok: boolean }> {
  return apiPost('/public/delivery/me/cancel');
}

export type MyCoupon = {
  id: string;
  code: string;
  status: string;
  expiresAt: string;
  template: {
    nameZh: string;
    nameVi: string;
    type: string;
    value: number;
    minSpend: number;
  };
};

export function listMyCoupons(): Promise<MyCoupon[]> {
  return apiGet('/public/delivery/coupons');
}

export type CouponTemplatePublic = {
  id: string;
  nameZh: string;
  nameVi: string;
  type: string;
  value: number;
  minSpend: number;
  validDays: number;
};

export function listCouponTemplates(): Promise<CouponTemplatePublic[]> {
  return apiGet('/public/delivery/coupon-templates');
}

export function claimCoupon(templateId: string): Promise<MyCoupon> {
  return apiPost('/public/delivery/coupons/claim', { templateId });
}

export type CustomerAddress = {
  id: string;
  contactName: string;
  phone: string;
  addressText: string;
  detail?: string | null;
  lat: number | null;
  lng: number | null;
  isDefault: boolean;
};

export function listAddresses(): Promise<CustomerAddress[]> {
  return apiGet('/public/delivery/addresses');
}

export function createAddress(dto: {
  contactName: string;
  phone: string;
  addressText: string;
  detail?: string;
  lat: number;
  lng: number;
  isDefault?: boolean;
}): Promise<CustomerAddress> {
  return apiPost('/public/delivery/addresses', dto);
}

export function updateAddress(
  id: string | number,
  dto: Partial<{
    contactName: string;
    phone: string;
    addressText: string;
    detail?: string;
    lat: number;
    lng: number;
    isDefault?: boolean;
  }>,
): Promise<CustomerAddress> {
  return apiPatch(`/public/delivery/addresses/${id}`, dto);
}

export function deleteAddress(id: string | number): Promise<{ ok: boolean }> {
  return apiDelete(`/public/delivery/addresses/${id}`);
}

export function setDefaultAddress(id: string | number): Promise<CustomerAddress> {
  return updateAddress(id, { isDefault: true });
}

export function quoteOrder(dto: {
  lat: number;
  lng: number;
  subtotal?: number;
}): Promise<{
  distanceKm: number;
  deliveryFee: number;
  minOrderAmount: number;
  subtotalOk: boolean;
  total: number;
}> {
  return apiPost('/public/delivery/quote', dto);
}

export type DeliveryOrder = {
  id: string;
  orderNo: string;
  status: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  payMethod?: string | null;
  remark?: string | null;
  addressSnapshot?: Record<string, unknown> | null;
  items: {
    id: string;
    dishId: string;
    nameZh: string;
    nameVi: string;
    unitPrice: number;
    qty: number;
    amount: number;
  }[];
  statusTimeline: { status: string; at: string; reason?: string }[];
  createdAt: string;
  updatedAt: string;
};

export function placeOrder(dto: {
  addressId: string | number;
  payMethod: 'cash' | 'bank_transfer' | 'momo' | 'vnpay';
  remark?: string;
  couponId?: string;
  items: { dishId: string | number; qty: number; optionsSnapshot?: unknown }[];
}): Promise<DeliveryOrder> {
  return apiPost('/public/delivery/orders', {
    ...dto,
    addressId: String(dto.addressId),
    items: dto.items.map((i) => ({ ...i, dishId: String(i.dishId) })),
  });
}

export async function listMyOrders(): Promise<{ items: DeliveryOrder[]; total: number }> {
  const list = await apiGet<DeliveryOrder[]>('/public/delivery/orders');
  const items = Array.isArray(list) ? list : [];
  return { items, total: items.length };
}

export function getOrderDetail(id: string | number): Promise<DeliveryOrder> {
  return apiGet(`/public/delivery/orders/${id}`);
}

export function cancelOrder(id: string | number, reason?: string): Promise<DeliveryOrder> {
  return apiPost(`/public/delivery/orders/${id}/cancel`, { reason });
}
