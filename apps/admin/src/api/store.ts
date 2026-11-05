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
  qrNeedConfirm: boolean;
  checkout: boolean;
  chatMessage: boolean;
};

export type AnnounceClipPair = { zh?: string; vi?: string };
export type AnnounceClips = Partial<Record<keyof AnnounceSettings, AnnounceClipPair>>;

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
export type BusinessHours = {
  open: string;
  close: string;
  days: number[];
  /** 手动暂停接单 */
  paused?: boolean;
  /** 预计送达分钟（展示用） */
  deliveryMinutes?: number;
};

export type MailSettings = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

export type AiSettings = {
  enabled: boolean;
  provider: string;
  apiBase: string;
  apiKey: string;
  model: string;
};

export type EnvGalleryItem = {
  image: string;
  captionZh?: string;
  captionVi?: string;
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
  announceClips?: AnnounceClips;
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
  storefrontImage?: string | null;
  /** 管理后台侧栏 Logo */
  adminLogo?: string | null;
  envGallery?: EnvGalleryItem[];
  aiSettings?: AiSettings;
  /** 桌贴 WiFi */
  guestWifi?: { ssid: string; password: string };
};

export type StoreBrand = {
  nameZh: string;
  nameVi: string;
  adminLogo: string | null;
};

export type HomeBanner = {
  image: string;
  link?: string;
  titleZh?: string;
  titleVi?: string;
};

export const getStoreSettingsApi = () => apiGet<StoreSettings>('/store/settings');

export const getStoreBrandApi = () => apiGet<StoreBrand>('/store/brand');

export const getAnnounceApi = () =>
  apiGet<{
    announceLang: 'zh' | 'vi';
    announceSettings: AnnounceSettings;
    announceClips?: AnnounceClips;
  }>('/store/announce');

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

export async function uploadStoreImageApi(file: File) {
  const form = new FormData();
  form.append('file', file);
  const http = (await import('./http')).default;
  const { data } = await http.post<{ code: number; data: { url: string; key: string } }>(
    '/store/upload',
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data.data;
}
