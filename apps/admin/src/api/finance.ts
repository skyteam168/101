import { apiDelete, apiGet, apiPatch, apiPost } from './http';

export type OpsExpense = {
  id: string;
  yearMonth: string;
  type: 'water' | 'electricity' | 'rent' | 'other';
  quantity: number | null;
  unit: string | null;
  amount: number;
  remark: string | null;
  createdAt: string;
};

export type Partner = {
  id: string;
  name: string;
  idNumber: string | null;
  address: string | null;
  sharePercent: number;
  investedTotal: number;
  status: 'active' | 'inactive';
  remark: string | null;
  createdAt: string;
  dividends?: number;
  cashRoi?: number;
  equityShare?: number;
  equityGap?: number;
};

export type PartnerSettlement = {
  id: string;
  partnerId: string;
  partnerName: string | null;
  settleDate: string;
  yearMonth: string;
  amount: number;
  note: string | null;
  createdAt: string;
};

export type CapitalEntryType = 'initial' | 'increase' | 'decrease';
export type CapitalCategory =
  | 'rent'
  | 'renovation'
  | 'equipment'
  | 'furniture'
  | 'deposit'
  | 'working_capital'
  | 'other';
export type CapitalRefType = 'asset' | 'asset_event' | 'ops_expense';

export type PartnerCapitalEntry = {
  id: string;
  partnerId: string;
  partnerName: string | null;
  entryDate: string;
  type: CapitalEntryType;
  amount: number;
  category: CapitalCategory;
  refType: CapitalRefType | null;
  refId: string | null;
  note: string | null;
  createdAt: string;
};

export type PartnerLedger = {
  partner: Partner;
  capitalEntries: PartnerCapitalEntry[];
  settlements: PartnerSettlement[];
  invested: number;
  dividends: number;
  cashRoi: number;
  equityShare: number;
  equityGap: number;
  storeEquityApprox: number;
  note: string;
};

export type CapitalRecon = {
  totalCapital: number;
  assetBook: number;
  inventoryValue: number;
  capitalLinkedOpsExpense: number;
  covered: number;
  gap: number;
  totalDividends: number;
  storeEquityApprox: number;
  partners: Array<{
    id: string;
    name: string;
    sharePercent: number;
    invested: number;
    equityShare: number;
  }>;
  note: string;
};

export const listExpensesApi = (params?: { yearMonth?: string; type?: string }) =>
  apiGet<OpsExpense[]>('/finance/expenses', params);
export const createExpenseApi = (data: Record<string, unknown>) =>
  apiPost<OpsExpense>('/finance/expenses', data);
export const updateExpenseApi = (id: string, data: Record<string, unknown>) =>
  apiPatch<OpsExpense>(`/finance/expenses/${id}`, data);
export const deleteExpenseApi = (id: string) => apiDelete(`/finance/expenses/${id}`);

export const listPartnersApi = (params?: { status?: string; keyword?: string }) =>
  apiGet<Partner[]>('/finance/partners', params);
export const createPartnerApi = (data: Record<string, unknown>) =>
  apiPost<Partner>('/finance/partners', data);
export const updatePartnerApi = (id: string, data: Record<string, unknown>) =>
  apiPatch<Partner>(`/finance/partners/${id}`, data);
export const deletePartnerApi = (id: string) => apiDelete(`/finance/partners/${id}`);
export const getPartnerLedgerApi = (id: string) =>
  apiGet<PartnerLedger>(`/finance/partners/${id}/ledger`);

export const listCapitalEntriesApi = (params?: { partnerId?: string }) =>
  apiGet<PartnerCapitalEntry[]>('/finance/capital-entries', params);
export const createCapitalEntryApi = (data: Record<string, unknown>) =>
  apiPost<PartnerCapitalEntry>('/finance/capital-entries', data);
export const updateCapitalEntryApi = (id: string, data: Record<string, unknown>) =>
  apiPatch<PartnerCapitalEntry>(`/finance/capital-entries/${id}`, data);
export const deleteCapitalEntryApi = (id: string) =>
  apiDelete(`/finance/capital-entries/${id}`);
export const getCapitalReconApi = () => apiGet<CapitalRecon>('/finance/capital-recon');

export const listSettlementsApi = (params?: { yearMonth?: string; partnerId?: string }) =>
  apiGet<PartnerSettlement[]>('/finance/settlements', params);
export const createSettlementApi = (data: Record<string, unknown>) =>
  apiPost<PartnerSettlement>('/finance/settlements', data);
export const updateSettlementApi = (id: string, data: Record<string, unknown>) =>
  apiPatch<PartnerSettlement>(`/finance/settlements/${id}`, data);
export const deleteSettlementApi = (id: string) => apiDelete(`/finance/settlements/${id}`);
