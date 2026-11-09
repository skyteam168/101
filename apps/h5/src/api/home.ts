import { apiGet } from './http';
import { getPublicStoreId, persistPublicStoreId } from '../utils/store-id';

export type HomeNotice = {
  id: string;
  titleZh: string;
  titleVi: string;
  contentZh: string;
  contentVi: string;
  level: string;
  sort: number;
  expiresAt: string | null;
};

export type HomeDishOption = {
  id: string;
  groupNameZh: string;
  groupNameVi: string;
  optionNameZh: string;
  optionNameVi: string;
  extraPrice: number;
  required: boolean;
  multi: boolean;
};

export type HomeNewDish = {
  id: string;
  nameZh: string;
  nameVi: string;
  descZh: string | null;
  descVi: string | null;
  image: string | null;
  price: number;
  takeawayPrice: number;
  isNew: boolean;
  status?: string;
  stock?: number | null;
  options?: HomeDishOption[];
};

export type HomeBanner = {
  image: string;
  link?: string;
  titleZh?: string;
  titleVi?: string;
};

export type HomeStore = {
  id: string;
  nameZh: string;
  nameVi: string;
  address: string | null;
  phone: string | null;
  lat?: number | null;
  lng?: number | null;
  banners: HomeBanner[];
  /** 门头图 */
  storefrontImage?: string | null;
  envGallery?: { image: string; captionZh?: string; captionVi?: string }[];
  businessHours?: {
    open: string;
    close: string;
    days: number[];
    paused?: boolean;
    deliveryMinutes?: number;
  } | null;
  openNow?: boolean;
  closedReason?: 'paused' | 'outside_hours' | null;
};

export type HomeFeed = {
  store: HomeStore;
  banners: HomeBanner[];
  notices: HomeNotice[];
  newDishes: HomeNewDish[];
};

export async function getHomeFeedApi(storeId = getPublicStoreId()) {
  const data = await apiGet<HomeFeed>('/public/home', { storeId });
  if (data?.store?.id) persistPublicStoreId(data.store.id);
  return data;
}
