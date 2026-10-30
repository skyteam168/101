import { apiGet } from './http';

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
  banners: HomeBanner[];
};

export type HomeFeed = {
  store: HomeStore;
  banners: HomeBanner[];
  notices: HomeNotice[];
  newDishes: HomeNewDish[];
};

export const getHomeFeedApi = (storeId = '1') =>
  apiGet<HomeFeed>('/public/home', { storeId });
