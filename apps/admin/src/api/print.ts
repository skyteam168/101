import { apiDelete, apiGet, apiPatch, apiPost } from './http';

export type Station = { id: string; nameZh: string; nameVi: string };
export type PrintAgent = {
  id: string;
  name: string;
  status: 'online' | 'offline';
  lastSeenAt: string | null;
  printerCount: number;
  secret?: string;
};
export type Printer = {
  id: string;
  name: string;
  ip: string;
  port: number;
  paperWidth: number;
  role: 'front' | 'kitchen';
  connectionType?: 'network' | 'browser_usb' | 'cloud';
  acceptAllTickets?: boolean;
  stationId: string | null;
  agentId: string | null;
  isActive: boolean;
  station?: Station | null;
  agent?: { id: string; name: string; status: string } | null;
};
export type PrintJob = {
  id: string;
  printerId: string;
  orderId: string | null;
  batchId: string | null;
  kind: string;
  status: string;
  retries: number;
  error: string | null;
  createdAt: string;
  payload?: import('@restaurant/shared').PrintTicketPayload | null;
  printer?: { name: string; ip: string; role: string };
};

export const listPrintStationsApi = () => apiGet<Station[]>('/print/stations');
export const createPrintStationApi = (data: { nameZh: string; nameVi: string }) =>
  apiPost<Station>('/print/stations', data);
export const updatePrintStationApi = (id: string, data: Partial<{ nameZh: string; nameVi: string }>) =>
  apiPatch<Station>(`/print/stations/${id}`, data);
export const deletePrintStationApi = (id: string) => apiDelete(`/print/stations/${id}`);

export const listPrintersApi = () => apiGet<Printer[]>('/print/printers');
export const createPrinterApi = (data: Record<string, unknown>) =>
  apiPost<Printer>('/print/printers', data);
export const updatePrinterApi = (id: string, data: Record<string, unknown>) =>
  apiPatch<Printer>(`/print/printers/${id}`, data);
export const deletePrinterApi = (id: string) => apiDelete(`/print/printers/${id}`);

export const listAgentsApi = () => apiGet<PrintAgent[]>('/print/agents');
export const createAgentApi = (data: { name: string }) =>
  apiPost<PrintAgent>('/print/agents', data);
export const updateAgentApi = (id: string, data: { name: string }) =>
  apiPatch<PrintAgent>(`/print/agents/${id}`, data);
export const regenerateAgentSecretApi = (id: string) =>
  apiPost<{ id: string; secret: string }>(`/print/agents/${id}/regenerate-secret`, {});
export const deleteAgentApi = (id: string) => apiDelete(`/print/agents/${id}`);

export const listPrintJobsApi = (params?: { status?: string; page?: number; pageSize?: number }) => {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.page) q.set('page', String(params.page));
  if (params?.pageSize) q.set('pageSize', String(params.pageSize));
  const qs = q.toString();
  return apiGet<{ total: number; list: PrintJob[] }>(`/print/jobs${qs ? `?${qs}` : ''}`);
};

export const reprintJobApi = (id: string, printerId?: string) =>
  apiPost<PrintJob>(`/print/jobs/${id}/reprint`, { printerId });

/** 按订单退款记录出退款小票（缺省最近一笔） */
export const printRefundTicketApi = (orderId: string, refundId?: string) =>
  apiPost<{ ok: boolean; refundId: string }>(`/print/orders/${orderId}/refund-ticket`, {
    refundId,
  });

export const printShiftApi = (data?: { cashierName?: string; from?: string; to?: string }) =>
  apiPost('/print/shift', data || {});
