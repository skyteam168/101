import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './http';
import http from './http';

export type Station = { id: string; nameZh: string; nameVi: string };

export type Category = {
  id: string;
  nameZh: string;
  nameVi: string;
  sort: number;
  isActive: boolean;
  kitchenStationId: string | null;
  kitchenStation: Station | null;
  dishCount: number;
};

export type DishOption = {
  id?: string;
  groupNameZh: string;
  groupNameVi: string;
  optionNameZh: string;
  optionNameVi: string;
  extraPrice: number;
  required: boolean;
  multi: boolean;
  sort: number;
};

export type Dish = {
  id: string;
  categoryId: string;
  category?: { id: string; nameZh: string; nameVi: string };
  nameZh: string;
  nameVi: string;
  descZh: string | null;
  descVi: string | null;
  image: string | null;
  price: number;
  takeawayPrice: number;
  unit: string;
  status: 'on' | 'off';
  stock: number | null;
  dailyStock: number | null;
  soldToday: number;
  sort: number;
  isDineIn: boolean;
  isDelivery: boolean;
  isNew: boolean;
  options: DishOption[];
};

export const listStationsApi = () => apiGet<Station[]>('/menu/stations');
export const listCategoriesApi = () => apiGet<Category[]>('/menu/categories');
export const createCategoryApi = (data: Partial<Category>) =>
  apiPost<Category>('/menu/categories', data);
export const updateCategoryApi = (id: string, data: Partial<Category>) =>
  apiPatch<Category>(`/menu/categories/${id}`, data);
export const deleteCategoryApi = (id: string) => apiDelete(`/menu/categories/${id}`);

export const listDishesApi = (params?: {
  categoryId?: string;
  keyword?: string;
  status?: string;
}) => apiGet<Dish[]>('/menu/dishes', params);
export const getDishApi = (id: string) => apiGet<Dish>(`/menu/dishes/${id}`);
export const createDishApi = (data: Record<string, unknown>) =>
  apiPost<Dish>('/menu/dishes', data);
export const updateDishApi = (id: string, data: Record<string, unknown>) =>
  apiPatch<Dish>(`/menu/dishes/${id}`, data);
export const deleteDishApi = (id: string) => apiDelete(`/menu/dishes/${id}`);

export const batchStatusApi = (ids: string[], status: 'on' | 'off') =>
  apiPut<Dish[]>('/menu/dishes/batch/status', { ids, status });
export const batchPriceApi = (ids: string[], price?: number, takeawayPrice?: number) =>
  apiPut<Dish[]>('/menu/dishes/batch/price', { ids, price, takeawayPrice });
export const batchSoldOutApi = (ids: string[]) =>
  apiPut<Dish[]>('/menu/dishes/batch/sold-out', { ids });

export async function uploadImageApi(file: File) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await http.post<{ code: number; data: { url: string; key: string } }>(
    '/menu/upload',
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data.data;
}
