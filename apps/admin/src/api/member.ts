import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './http';

export type MemberLevel = {
  id: string;
  nameZh: string;
  nameVi: string;
  minPoints: number;
  minSpend: number;
  discountPercent: number;
  birthdayBonusPoints: number;
  deliveryFeeOff: number;
  priorityReserve: boolean;
  priorityDelivery: boolean;
  birthdayGift: boolean;
  sort: number;
  isActive: boolean;
};

export type Member = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  status: string;
  points: number;
  balance: number;
  birthday: string | null;
  memberJoinedAt?: string | null;
  lifetimeSpend?: number;
  birthdayGiftRedeemedYear?: number | null;
  memberLevelId: string | null;
  memberLevel: MemberLevel | null;
  registerSource?: 'email' | 'google';
  hasPassword?: boolean;
  hasGoogle?: boolean;
  createdAt: string;
};

export const listLevelsApi = () => apiGet<MemberLevel[]>('/members/levels');
export const createLevelApi = (data: Record<string, unknown>) =>
  apiPost<MemberLevel>('/members/levels', data);
export const updateLevelApi = (id: string, data: Record<string, unknown>) =>
  apiPatch<MemberLevel>(`/members/levels/${id}`, data);
export const deleteLevelApi = (id: string) =>
  apiDelete<{
    ok: boolean;
    migratedCount: number;
    fallbackLevelId: string | null;
    fallbackNameZh: string | null;
    fallbackNameVi: string | null;
  }>(`/members/levels/${id}`);

export const listMembersApi = (params?: { keyword?: string; status?: string }) =>
  apiGet<Member[]>('/members', params);
export const searchMembersApi = (keyword?: string) =>
  apiGet<Member[]>('/members/search', keyword ? { keyword } : undefined);
export const updateMemberApi = (id: string, data: Record<string, unknown>) =>
  apiPatch<Member>(`/members/${id}`, data);
export const setMemberStatusApi = (id: string, status: 'active' | 'banned') =>
  apiPut<Member>(`/members/${id}/status`, { status });
export const softDeleteMemberApi = (id: string) =>
  apiPost(`/members/${id}/soft-delete`, {});
export const adjustPointsApi = (id: string, delta: number, remark?: string) =>
  apiPost<Member>(`/members/${id}/points`, { delta, remark });
export const adjustBalanceApi = (id: string, delta: number, remark?: string) =>
  apiPost<Member>(`/members/${id}/balance`, { delta, remark });
export const redeemBirthdayGiftApi = (id: string) =>
  apiPost<Member>(`/members/${id}/birthday-gift`, {});
