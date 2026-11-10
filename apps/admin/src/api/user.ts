import { apiGet, apiPatch, apiPost, apiPut } from './http';

export type UserRow = {
  id: string;
  username: string;
  displayName: string;
  phone: string | null;
  lang: string;
  status: string;
  storeId: string | null;
  roles: { id: string; code: string; nameZh: string; nameVi: string }[];
};

export const listUsersApi = (opts?: { skipErrorToast?: boolean; skipLoading?: boolean }) =>
  apiGet<UserRow[]>('/users', undefined, opts);
export const createUserApi = (data: Record<string, unknown>) => apiPost<UserRow>('/users', data);
export const updateUserApi = (id: string, data: Record<string, unknown>) =>
  apiPatch<UserRow>(`/users/${id}`, data);
export const setUserStatusApi = (id: string, status: 'active' | 'disabled') =>
  apiPut<UserRow>(`/users/${id}/status`, { status });
export const resetUserPasswordApi = (id: string, password: string) =>
  apiPut(`/users/${id}/password`, { password });
