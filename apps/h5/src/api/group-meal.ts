import { apiGet, apiPost } from './http';
import { getPublicStoreId } from '../utils/store-id';

export type GroupComboItem = {
  id: string;
  dishId: string;
  extraPrice: number;
  isDefault: boolean;
  dish?: { nameZh: string; nameVi: string; status?: string };
};

export type GroupComboGroup = {
  id: string;
  nameZh: string;
  nameVi: string;
  minSelect: number;
  maxSelect: number;
  items: GroupComboItem[];
};

export type GroupCombo = {
  id: string;
  nameZh: string;
  nameVi: string;
  descZh?: string | null;
  descVi?: string | null;
  image?: string | null;
  price: number;
  takeawayPrice: number;
  servingSize?: number | null;
  isGroupMeal: boolean;
  groups: GroupComboGroup[];
};

export function listGroupCombos(storeId = getPublicStoreId()) {
  return apiGet<GroupCombo[]>('/public/combos', { storeId });
}

export function createGroupInquiry(dto: {
  contactName: string;
  phone: string;
  company?: string;
  guestCount: number;
  preferAt: string;
  address?: string;
  comboId?: string;
  budget?: number;
  remark?: string;
  storeId?: string;
}) {
  return apiPost('/public/group-meal/inquiries', dto);
}

export function placeGroupOrder(dto: {
  comboId: string;
  selections: { groupId: string; dishIds: string[] }[];
  qty?: number;
  guestCount: number;
  addressId: string;
  payMethod: 'cash' | 'bank_transfer';
  remark?: string;
}) {
  return apiPost('/public/delivery/group-orders', { ...dto, storeId: getPublicStoreId() });
}
