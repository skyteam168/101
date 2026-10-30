import axios from 'axios';
import { apiDelete, apiGet, apiPatch, apiPost } from './http';
import { getAccessToken } from '../utils/auth-storage';

export type TableSessionInfo = {
  id: string;
  openAt: string;
  guestCount: number;
  pin: string;
  sessionToken: string;
  status: string;
  orderId: string | null;
  total: number;
  durationMinutes: number;
  pendingConfirmCount?: number;
  pendingBatches?: { id: string; roundNo: number; guestNickname: string | null }[];
};

export type FloorTable = {
  id: string;
  areaId: string;
  code: string;
  seats: number;
  status: 'idle' | 'dining' | 'cleaning';
  qrToken: string;
  qrUrl: string;
  currentSessionId: string | null;
  session: TableSessionInfo | null;
  area?: { id: string; nameZh: string; nameVi: string };
};

export type AreaFloor = {
  id: string;
  nameZh: string;
  nameVi: string;
  sort: number;
  tableCount: number;
  tables: FloorTable[];
};

export type Area = {
  id: string;
  nameZh: string;
  nameVi: string;
  sort: number;
  tableCount: number;
};

export const listFloorApi = () => apiGet<AreaFloor[]>('/tables/floor');
export const listAreasApi = () => apiGet<Area[]>('/tables/areas');
export const createAreaApi = (data: { nameZh: string; nameVi: string; sort?: number }) =>
  apiPost<Area>('/tables/areas', data);
export const updateAreaApi = (id: string, data: Partial<Area>) =>
  apiPatch<Area>(`/tables/areas/${id}`, data);
export const deleteAreaApi = (id: string) => apiDelete(`/tables/areas/${id}`);

export const createTableApi = (data: { areaId: string; code: string; seats?: number }) =>
  apiPost<FloorTable>('/tables', data);
export const updateTableApi = (id: string, data: { areaId?: string; code?: string; seats?: number }) =>
  apiPatch<FloorTable>(`/tables/${id}`, data);
export const deleteTableApi = (id: string) => apiDelete(`/tables/${id}`);
export const resetQrApi = (id: string) => apiPost<FloorTable>(`/tables/${id}/reset-qr`);

export const openTableApi = (id: string, guestCount: number) =>
  apiPost<FloorTable>(`/tables/${id}/open`, { guestCount });
export const clearTableApi = (id: string) => apiPost<FloorTable>(`/tables/${id}/clear`);
export const transferTableApi = (id: string, targetTableId: string) =>
  apiPost(`/tables/${id}/transfer`, { targetTableId });
export const mergeTableApi = (id: string, sourceTableId: string) =>
  apiPost(`/tables/${id}/merge`, { sourceTableId });

export async function exportStickersApi(tableIds?: string[]) {
  const { data } = await axios.post(
    '/api/tables/export-stickers',
    { tableIds },
    {
      responseType: 'blob',
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    },
  );
  if (data instanceof Blob && data.type.includes('json')) {
    const text = await data.text();
    const body = JSON.parse(text) as { code: string | number; message?: string };
    throw body;
  }
  const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'table-stickers.pdf';
  a.click();
  URL.revokeObjectURL(url);
}
