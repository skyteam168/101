/**
 * 外卖 H5 API（对齐 apps/server delivery 模块）
 */
import { apiDelete, apiGet, apiPatch, apiPost } from './http';
import http from './http';
import { getPublicStoreId, persistPublicStoreId } from '../utils/store-id';

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
  businessHours: {
    open: string;
    close: string;
    days: number[];
    paused?: boolean;
    deliveryMinutes?: number;
  } | null;
  bankTransferQr: string | null;
  storefrontImage?: string | null;
  envGallery?: { image: string; captionZh?: string; captionVi?: string }[];
  openNow: boolean;
  /** paused=手动休息；outside_hours=非营业时间 */
  closedReason?: 'paused' | 'outside_hours' | null;
};

export async function getStoreInfo(): Promise<StoreInfo> {
  const data = await apiGet<StoreInfo>('/public/delivery/store', {
    storeId: getPublicStoreId(),
  });
  if (data?.id) persistPublicStoreId(data.id);
  return data;
}

export type DishOption = {
  id: string;
  groupNameZh: string;
  groupNameVi: string;
  optionNameZh: string;
  optionNameVi: string;
  extraPrice: number;
  required: boolean;
  multi: boolean;
};

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
  options?: DishOption[];
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
    storeId: getPublicStoreId(),
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
  avatar?: string | null;
  lang: string;
  hasPassword?: boolean;
  hasGoogle?: boolean;
};

export type AuthResult = {
  accessToken: string;
  customer: CustomerProfile;
  /** 兼容旧字段 */
  token?: string;
};

export type AuthConfig = {
  turnstile: { enabled: boolean; siteKey: string | null };
  google: { enabled: boolean; clientId: string | null };
};

export function getAuthConfig(): Promise<AuthConfig> {
  return apiGet('/public/security/auth-config');
}

export function sendCode(dto: {
  email: string;
  lang?: 'zh' | 'vi';
  purpose?: 'register' | 'login' | 'reset';
}): Promise<{
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
  phone?: string;
  lang?: 'zh' | 'vi';
  cfTurnstileToken?: string;
}): Promise<AuthResult> {
  return apiPost('/public/delivery/auth/register', dto);
}

export function login(dto: {
  email: string;
  password: string;
  cfTurnstileToken?: string;
}): Promise<AuthResult> {
  return apiPost('/public/delivery/auth/login', dto);
}

export function loginByCode(dto: {
  email: string;
  code: string;
  cfTurnstileToken?: string;
}): Promise<AuthResult> {
  return apiPost('/public/delivery/auth/login-code', dto);
}

export function loginWithGoogle(dto: {
  idToken: string;
  lang?: 'zh' | 'vi';
}): Promise<AuthResult> {
  return apiPost('/public/delivery/auth/google', dto);
}

export function logoutCustomer(): Promise<{ ok: boolean }> {
  return apiPost('/public/delivery/auth/logout');
}

export function changePassword(dto: {
  oldPassword?: string;
  newPassword: string;
}): Promise<CustomerProfile> {
  return apiPost('/public/delivery/auth/change-password', dto);
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
  avatar?: string | null;
  lang?: string;
  birthday?: string;
}): Promise<CustomerProfile> {
  return apiPatch('/public/delivery/me', dto);
}

/** 上传头像 / 门牌照等 */
export async function uploadCustomerImage(file: File): Promise<{ url: string }> {
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await http.post<{ code: number; data: { url: string; key: string } }>(
    '/public/delivery/upload',
    fd,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data.data;
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
    id?: string;
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
  return apiGet('/public/delivery/coupon-templates', { storeId: getPublicStoreId() });
}

export function claimCoupon(templateId: string): Promise<MyCoupon> {
  return apiPost('/public/delivery/coupons/claim', {
    templateId,
    storeId: getPublicStoreId(),
  });
}

export type CustomerAddress = {
  id: string;
  contactName: string;
  phone: string;
  addressText: string;
  detail?: string | null;
  landmarkPhoto?: string | null;
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
  landmarkPhoto?: string | null;
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
    landmarkPhoto?: string | null;
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
  couponId?: string;
}): Promise<{
  distanceKm: number;
  deliveryFee: number;
  minOrderAmount: number;
  subtotalOk: boolean;
  subtotal?: number;
  discount?: number;
  coupon?: { id: string; nameZh: string; amount: number } | null;
  total: number;
}> {
  return apiPost('/public/delivery/quote', { ...dto, storeId: getPublicStoreId() });
}

export type DeliveryOrder = {
  id: string;
  orderNo: string;
  status: string;
  subtotal: number;
  discount?: number;
  serviceCharge?: number;
  deliveryFee: number;
  total: number;
  paidAmount?: number;
  paymentStatus?: string;
  tableCode?: string | null;
  /** 库内类型：dine_in / takeaway / delivery */
  type?: 'dine_in' | 'takeaway' | 'delivery' | string;
  /** 展示分类：含 group_meal */
  channel?: 'dine_in' | 'takeaway' | 'delivery' | 'group_meal' | string;
  payMethod?: string | null;
  remark?: string | null;
  addressSnapshot?: Record<string, unknown> | null;
  payments?: { method: string; amount: number; received?: number }[];
  items: {
    id: string;
    dishId: string | null;
    nameZh: string;
    nameVi: string;
    unitPrice: number;
    qty: number;
    amount: number;
    status?: string;
    optionsSnapshot?: unknown;
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
    storeId: getPublicStoreId(),
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
