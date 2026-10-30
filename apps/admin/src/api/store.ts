import { apiDelete, apiGet, apiPatch, apiPost } from './http';

export type AnnounceSettings = {
  dineInNew: boolean;
  addItem: boolean;
  deliveryNew: boolean;
  callWaiter: boolean;
  requestBill: boolean;
  orderCancel: boolean;
  printFailed: boolean;
  reservationNew: boolean;
};

export type StoreNotice = {
  id: string;
  storeId: string;
  titleZh: string;
  titleVi: string;
  contentZh: string;
  contentVi: string;
  level: 'info' | 'warn' | 'important' | string;
  isActive: boolean;
  sort: number;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DeliveryFeeRule = { maxKm: number; fee: number };
export type BusinessHours = { open: string; close: string; days: number[] };

export type MailSettings = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

export type StoreSettings = {
  id: string;
  nameZh: string;
  nameVi: string;
  address: string | null;
  phone: string | null;
  serviceChargeRate: number;
  taxRate: number;
  qrOrderNeedConfirm: boolean;
  qrAutoOpen: boolean;
  qrRequirePin: boolean;
  announceLang: 'zh' | 'vi';
  announceSettings: AnnounceSettings;
  printSplitItem: boolean;
  deliveryRadiusKm: number;
  deliveryFeeRules: DeliveryFeeRule[];
  minOrderAmount: number;
  businessHours: BusinessHours | null;
  lat: number | null;
  lng: number | null;
  bankTransferQr: string | null;
  businessDayCutHour: number;
  mailSettings?: MailSettings;
  homeBanners?: HomeBanner[];
};

export type HomeBanner = {
  image: string;
  link?: string;
  titleZh?: string;
  titleVi?: string;
};

export const getStoreSettingsApi = () => apiGet<StoreSettings>('/store/settings');

export const getAnnounceApi = () =>
  apiGet<{ announceLang: 'zh' | 'vi'; announceSettings: AnnounceSettings }>('/store/announce');

export const updateStoreSettingsApi = (data: Partial<StoreSettings>) =>
  apiPatch<StoreSettings>('/store/settings', data);

export const pushMessageApi = (data: {
  emails?: string[];
  customerIds?: string[];
  subject: string;
  content: string;
}) => apiPost<{ sent: number }>('/store/push-message', data);

export const listNoticesApi = () => apiGet<StoreNotice[]>('/store/notices');

export const createNoticeApi = (data: Partial<StoreNotice>) =>
  apiPost<StoreNotice>('/store/notices', data);

export const updateNoticeApi = (id: string, data: Partial<StoreNotice>) =>
  apiPatch<StoreNotice>(`/store/notices/${id}`, data);

export const deleteNoticeApi = (id: string) => apiDelete(`/store/notices/${id}`);
