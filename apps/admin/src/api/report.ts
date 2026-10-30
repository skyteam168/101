import { apiGet, apiPost } from './http';
import { getAccessToken } from '../utils/auth-storage';

export type ReportOverview = {
  businessDate: string;
  cutHour: number;
  fromCache: boolean;
  revenue: number;
  orderCount: number;
  guestCount: number;
  avgTicket: number;
  avgPerGuest: number;
  tableTurnover: number;
  avgDineMinutes: number;
  dineInRevenue: number;
  takeawayRevenue: number;
  deliveryRevenue: number;
  discountTotal: number;
  voidAmount: number;
  cancelCount: number;
  channel: { key: string; amount: number; count: number }[];
  payMethods: { key: string; amount: number; count: number }[];
  hourly: { hour: number; amount: number; count: number }[];
  topDishes: { dishId: string; nameZh: string; nameVi: string; qty: number; amount: number }[];
  operators: {
    userId: string;
    displayName: string;
    discountCount: number;
    discountAmount: number;
    voidCount: number;
    voidAmount: number;
    cancelCount: number;
  }[];
};

export type TrendPoint = { date: string; revenue: number; orderCount: number };

export type CashierShift = {
  id: string;
  cashierId: string;
  cashierName: string | null;
  cashierUsername: string | null;
  startedAt: string;
  endedAt: string | null;
  openingCash: number;
  closingCash: number | null;
  note: string | null;
  summary: {
    orderCount?: number;
    totalSales?: number;
    byMethod?: Record<string, number>;
    from?: string;
    to?: string;
  } | null;
};

export const reportOverviewApi = (params?: { date?: string; from?: string; to?: string }) =>
  apiGet<ReportOverview>('/reports/overview', params);

export const reportTrendApi = (params?: { from?: string; to?: string }) =>
  apiGet<{ cutHour: number; points: TrendPoint[] }>('/reports/trend', params);

export const reportMonthApi = (month: string) =>
  apiGet<{
    yearMonth: string;
    revenue: number;
    orderCount: number;
    avgTicket: number;
    days: TrendPoint[];
  }>('/reports/month', { month });

export const listShiftsApi = (params?: { cashierId?: string; limit?: number }) =>
  apiGet<CashierShift[]>('/reports/shifts', params);

export const currentShiftApi = () => apiGet<CashierShift | null>('/reports/shifts/current');

export const openShiftApi = (data: { openingCash?: number; note?: string }) =>
  apiPost<CashierShift>('/reports/shifts/open', data);

export const closeShiftApi = (id: string, data: { closingCash?: number; note?: string }) =>
  apiPost<CashierShift>(`/reports/shifts/${id}/close`, data);

export const printShiftApi = (shiftId: string) =>
  apiPost<{ ok: boolean }>('/reports/shifts/print', { shiftId });

export async function exportReportApi(params: { date?: string; from?: string; to?: string }) {
  const token = getAccessToken();
  const q = new URLSearchParams();
  if (params.date) q.set('date', params.date);
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  const res = await fetch(`/api/reports/export?${q}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('export failed');
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'report.xlsx';
  a.click();
  URL.revokeObjectURL(a.href);
}
