import { apiDelete, apiGet, apiPatch, apiPost } from './http';

export type CouponStats = {
  issued: number;
  unused: number;
  used: number;
  expired: number;
  useRate: number;
};

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
  stats?: CouponStats;
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

export type IssuedCoupon = {
  id: string;
  code: string;
  status: 'unused' | 'used' | 'expired';
  expiresAt: string;
  createdAt: string;
  usedOrderId: string | null;
  customerId: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  template: CouponTemplate;
};

export type CouponAnalytics = {
  summary: {
    templateCount: number;
    activeTemplates: number;
    issued: number;
    unused: number;
    used: number;
    expired: number;
    useRate: number;
    uniqueClaimers: number;
  };
  byTemplate: Array<{
    id: string;
    nameZh: string;
    nameVi: string;
    isActive: boolean;
    issued: number;
    unused: number;
    used: number;
    expired: number;
    useRate: number;
  }>;
  daily: Array<{ date: string; claimed: number; used: number }>;
};

export const listTemplatesApi = () => apiGet<CouponTemplate[]>('/marketing/templates');
export const createTemplateApi = (data: Record<string, unknown>) =>
  apiPost<CouponTemplate>('/marketing/templates', data);
export const updateTemplateApi = (id: string, data: Record<string, unknown>) =>
  apiPatch<CouponTemplate>(`/marketing/templates/${id}`, data);
export const deleteTemplateApi = (id: string) =>
  apiDelete<{ ok: boolean }>(`/marketing/templates/${id}`);

export const issueCouponsApi = (templateId: string, customerIds: string[]) =>
  apiPost('/marketing/coupons/issue', { templateId, customerIds });
export const listCouponsApi = (params?: {
  customerId?: string;
  templateId?: string;
  status?: string;
}) => apiGet<IssuedCoupon[]>('/marketing/coupons', params);
export const couponAnalyticsApi = (days = 30) =>
  apiGet<CouponAnalytics>('/marketing/analytics', { days });

export const listRulesApi = () => apiGet<PromoRule[]>('/marketing/rules');
export const createRuleApi = (data: Record<string, unknown>) =>
  apiPost<PromoRule>('/marketing/rules', data);
export const updateRuleApi = (id: string, data: Record<string, unknown>) =>
  apiPatch<PromoRule>(`/marketing/rules/${id}`, data);
export const deleteRuleApi = (id: string) => apiDelete<{ ok: boolean }>(`/marketing/rules/${id}`);
