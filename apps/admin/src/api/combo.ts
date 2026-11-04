import { apiDelete, apiGet, apiPatch, apiPost } from './http';

/** 套餐分组内菜品 */
export type ComboGroupItem = {
  id?: string;
  dishId: string;
  extraPrice: number;
  isDefault: boolean;
  sort: number;
  dish?: { nameZh: string; nameVi: string; price: number; image: string | null };
};

/** 套餐分组 */
export type ComboGroup = {
  id?: string;
  nameZh: string;
  nameVi: string;
  minSelect: number;
  maxSelect: number;
  sort: number;
  items: ComboGroupItem[];
};

/** 套餐 */
export type Combo = {
  id: string;
  nameZh: string;
  nameVi: string;
  image?: string | null;
  price: number;
  takeawayPrice: number;
  status: 'on' | 'off';
  isGroupMeal?: boolean;
  servingSize?: number | null;
  groups: ComboGroup[];
  createdAt: string;
};

type ComboListResult = { list: Combo[]; total: number; page: number; pageSize: number };

/** 列表 */
export const listCombosApi = async (params?: { status?: string; keyword?: string }) => {
  const res = await apiGet<ComboListResult | Combo[]>('/combos', params);
  return Array.isArray(res) ? res : res.list;
};

/** 详情 */
export const getComboApi = (id: string) => apiGet<Combo>(`/combos/${id}`);

/** 新建 */
export const createComboApi = (data: Record<string, unknown>) =>
  apiPost<Combo>('/combos', data);

/** 编辑 */
export const updateComboApi = (id: string, data: Record<string, unknown>) =>
  apiPatch<Combo>(`/combos/${id}`, data);

/** 删除 */
export const deleteComboApi = (id: string) => apiDelete(`/combos/${id}`);

/** 上/下架 */
export const toggleComboStatusApi = (id: string, status: 'on' | 'off') =>
  apiPatch<Combo>(`/combos/${id}`, { status });

/** 收银台：向订单追加套餐 */
export const addComboItemApi = (
  orderId: string,
  data: {
    comboId: string;
    selections: { groupId: string; dishIds: string[] }[];
    qty?: number;
  },
) => apiPost(`/orders/${orderId}/combo-items`, data);
