import http, { apiDelete, apiGet, apiPatch, apiPost } from './http';
import { getAccessToken } from '../utils/auth-storage';

export type AssetCategory = {
  id: string;
  nameZh: string;
  nameVi: string;
  depreciationMonths: number;
  assetCount: number;
};

export type AssetEvent = {
  id: string;
  assetId: string;
  type: string;
  qty: number;
  amount: number;
  fromLocation: string | null;
  toLocation: string | null;
  reason: string | null;
  operatorId: string | null;
  operatorName: string | null;
  happenedAt: string;
};

export type Asset = {
  id: string;
  assetNo: string;
  categoryId: string;
  category: {
    id: string;
    nameZh: string;
    nameVi: string;
    depreciationMonths: number;
  } | null;
  nameZh: string;
  nameVi: string;
  spec: string | null;
  unit: string;
  location: string | null;
  supplier: string | null;
  purchaseDate: string | null;
  unitPrice: number;
  qtyTotal: number;
  qtyInUse: number;
  qtyIdle: number;
  qtyRepair: number;
  qtyDisposed: number;
  originalValue: number;
  netValue: number;
  netUnit: number;
  warrantyUntil: string | null;
  photo: string | null;
  createdAt: string;
  events?: AssetEvent[];
};

export type AssetReport = {
  summary: {
    assetCount: number;
    originalValue: number;
    netValue: number;
    repairCostMonth: number;
    scrapLossMonth: number;
    sellIncomeMonth: number;
  };
  byCategory: {
    categoryId: string;
    nameZh: string;
    nameVi: string;
    qtyTotal: number;
    qtyActive: number;
    originalValue: number;
    netValue: number;
  }[];
  warrantyExpiring: Asset[];
};

export const listAssetCategoriesApi = () => apiGet<AssetCategory[]>('/assets/categories');
export const createAssetCategoryApi = (data: {
  nameZh: string;
  nameVi: string;
  depreciationMonths?: number;
}) => apiPost<AssetCategory>('/assets/categories', data);
export const updateAssetCategoryApi = (
  id: string,
  data: Partial<{ nameZh: string; nameVi: string; depreciationMonths: number }>,
) => apiPatch<AssetCategory>(`/assets/categories/${id}`, data);
export const deleteAssetCategoryApi = (id: string) => apiDelete(`/assets/categories/${id}`);

export const listAssetsApi = (params?: {
  categoryId?: string;
  location?: string;
  status?: string;
  keyword?: string;
}) => apiGet<Asset[]>('/assets', params);
export const getAssetApi = (id: string) => apiGet<Asset>(`/assets/${id}`);
export const createAssetApi = (data: Record<string, unknown>) => apiPost<Asset>('/assets', data);
export const updateAssetApi = (id: string, data: Record<string, unknown>) =>
  apiPatch<Asset>(`/assets/${id}`, data);

export const assetInApi = (id: string, data: Record<string, unknown>) =>
  apiPost<Asset>(`/assets/${id}/in`, data);
export const assetAssignApi = (id: string, data: Record<string, unknown>) =>
  apiPost<Asset>(`/assets/${id}/assign`, data);
export const assetTransferApi = (id: string, data: Record<string, unknown>) =>
  apiPost<Asset>(`/assets/${id}/transfer`, data);
export const assetRepairApi = (id: string, data: Record<string, unknown>) =>
  apiPost<Asset>(`/assets/${id}/repair`, data);
export const assetRepairDoneApi = (id: string, data: Record<string, unknown>) =>
  apiPost<Asset>(`/assets/${id}/repair-done`, data);
export const assetScrapApi = (id: string, data: Record<string, unknown>) =>
  apiPost<Asset>(`/assets/${id}/scrap`, data);
export const assetSellApi = (id: string, data: Record<string, unknown>) =>
  apiPost<Asset>(`/assets/${id}/sell`, data);
export const assetCheckApi = (id: string, data: Record<string, unknown>) =>
  apiPost<Asset>(`/assets/${id}/check`, data);

export const assetReportApi = () => apiGet<AssetReport>('/assets/report');

async function downloadBlob(url: string, filename: string, method: 'GET' | 'POST' = 'GET', body?: unknown) {
  const token = getAccessToken();
  const res = await fetch(`/api${url}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error('download failed');
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const exportAssetsApi = () => downloadBlob('/assets/export', 'assets.xlsx');

export const importAssetsApi = async (file: File) => {
  const form = new FormData();
  form.append('file', file);
  const { data } = await http.post('/assets/import', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.data as { created: number; errors: string[] };
};

export const printAssetLabelsApi = (ids: string[]) =>
  downloadBlob('/assets/labels', 'asset-labels.pdf', 'POST', { ids });
