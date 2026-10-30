import { apiGet, apiPatch, apiPost } from './http';

export type CouponTemplate = {
  id: string;
  nameZh: string;
  nameVi: string;
  type: 'amount' | 'percent';
  value: number;
  minSpend: number;
  validDays: number;
  stackable: boolean;
  scope: 'order' | 'dish';
  dishIds: string[] | null;
  channel: 'delivery' | 'dine_in' | 'all';
  isActive: boolean;
};

export type PromoRule = {
  id: string;
  nameZh: string;
  nameVi: string;
  type: 'amount' | 'percent';
  value: number;
  minSpend: number;
  scope: 'order' | 'dish';
  dishIds: string[] | null;
  channel: 'delivery' | 'dine_in' | 'all';
  isActive: boolean;
};

export const listTemplatesApi = () => apiGet<CouponTemplate[]>('/marketing/templates');
export const createTemplateApi = (data: Record<string, unknown>) =>
  apiPost<CouponTemplate>('/marketing/templates', data);
export const updateTemplateApi = (id: string, data: Record<string, unknown>) =>
  apiPatch<CouponTemplate>(`/marketing/templates/${id}`, data);

export const issueCouponsApi = (templateId: string, customerIds: string[]) =>
  apiPost('/marketing/coupons/issue', { templateId, customerIds });
export const listCouponsApi = (customerId?: string) =>
  apiGet('/marketing/coupons', customerId ? { customerId } : undefined);

export const listRulesApi = () => apiGet<PromoRule[]>('/marketing/rules');
export const createRuleApi = (data: Record<string, unknown>) =>
  apiPost<PromoRule>('/marketing/rules', data);
export const updateRuleApi = (id: string, data: Record<string, unknown>) =>
  apiPatch<PromoRule>(`/marketing/rules/${id}`, data);
