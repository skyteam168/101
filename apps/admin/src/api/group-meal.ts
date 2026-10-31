import { apiGet, apiPatch } from './http';

export type GroupMealInquiry = {
  id: string;
  contactName: string;
  phone: string;
  company: string | null;
  guestCount: number;
  preferAt: string;
  address: string | null;
  comboId: string | null;
  comboNameZh: string | null;
  comboNameVi: string | null;
  budget: number | null;
  remark: string | null;
  status: 'pending' | 'confirmed' | 'rejected' | 'cancelled';
  adminRemark: string | null;
  createdAt: string;
};

export function listGroupMealInquiriesApi(params?: { status?: string }) {
  return apiGet<{ list: GroupMealInquiry[]; total: number }>('/group-meal/inquiries', params);
}

/** 待处理团购询单数量（菜单角标） */
export const getPendingGroupMealCountApi = () =>
  apiGet<{ count: number }>('/group-meal/inquiries/pending-count');


export function updateGroupMealInquiryApi(
  id: string,
  data: { status?: string; adminRemark?: string },
) {
  return apiPatch<GroupMealInquiry>(`/group-meal/inquiries/${id}`, data);
}
