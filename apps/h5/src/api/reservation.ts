/**
 * 公开预定 API（/api/public/reservations）
 */
import { apiGet, apiPatch, apiPost } from './http';
import { getPublicStoreId } from '../utils/store-id';
import type { MenuCategory } from './delivery';

const PHONE_KEY = 'h5_reserve_phone';

export function getSavedReservePhone() {
  try {
    return localStorage.getItem(PHONE_KEY) || '';
  } catch {
    return '';
  }
}

export function saveReservePhone(phone: string) {
  try {
    const p = (phone || '').replace(/\s+/g, '').trim();
    if (p) localStorage.setItem(PHONE_KEY, p);
  } catch {
    /* ignore */
  }
}

export type ReservationItemInput = {
  dishId: string;
  qty: number;
};

export type CreateReservationDto = {
  customerName: string;
  phone: string;
  guestCount: number;
  reserveAt: string;
  remark?: string;
  items?: ReservationItemInput[];
};

export type PublicUpdateReservationDto = {
  phone: string;
  customerName?: string;
  guestCount?: number;
  reserveAt?: string;
  remark?: string;
  items?: ReservationItemInput[];
};

export type PublicReservation = {
  id: string;
  customerName: string;
  phone: string;
  guestCount: number;
  reserveAt: string;
  remark?: string | null;
  status: string;
  tableCode?: string | null;
  area?: { id: string; nameZh: string; nameVi: string } | null;
  preorderCount?: number;
  items?: Array<{
    dishId: string | null;
    nameZh: string;
    nameVi: string;
    qty: number;
    unitPrice: number;
  }>;
};

function storeQs() {
  return `storeId=${encodeURIComponent(getPublicStoreId())}`;
}

/** 预定页用堂食菜单（预点） */
export async function getReserveMenu(): Promise<MenuCategory[]> {
  const data = await apiGet<MenuCategory[] | { categories: MenuCategory[] }>('/public/menu', {
    storeId: getPublicStoreId(),
    channel: 'dine_in',
  });
  if (Array.isArray(data)) return data;
  return data.categories || [];
}

export function createReservation(dto: CreateReservationDto): Promise<PublicReservation> {
  return apiPost(`/public/reservations?${storeQs()}`, dto);
}

export function listMyReservations(phone: string): Promise<PublicReservation[]> {
  return apiGet('/public/reservations', {
    storeId: getPublicStoreId(),
    phone: phone.replace(/\s+/g, '').trim(),
  });
}

export function getMyReservation(id: string, phone: string): Promise<PublicReservation> {
  return apiGet(`/public/reservations/${id}`, {
    storeId: getPublicStoreId(),
    phone: phone.replace(/\s+/g, '').trim(),
  });
}

export function updateMyReservation(
  id: string,
  dto: PublicUpdateReservationDto,
): Promise<PublicReservation> {
  return apiPatch(`/public/reservations/${id}?${storeQs()}`, {
    ...dto,
    phone: dto.phone.replace(/\s+/g, '').trim(),
  });
}

export function cancelMyReservation(
  id: string,
  phone: string,
  reason?: string,
): Promise<PublicReservation> {
  return apiPost(`/public/reservations/${id}/cancel?${storeQs()}`, {
    phone: phone.replace(/\s+/g, '').trim(),
    reason,
  });
}
