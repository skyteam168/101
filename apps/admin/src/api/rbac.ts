import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './http';

export type RoleRow = {
  id: string;
  code: string;
  nameZh: string;
  nameVi: string;
  isSystem: boolean;
};

export type PermNode = {
  id: string;
  code: string;
  nameZh: string;
  nameVi: string;
  type: string;
  path: string | null;
  sort: number;
  children: PermNode[];
};

export const listRolesApi = () => apiGet<RoleRow[]>('/rbac/roles');
export const listRolesBriefApi = () => apiGet<RoleRow[]>('/rbac/roles/brief');
export const createRoleApi = (data: { code: string; nameZh: string; nameVi: string }) =>
  apiPost<RoleRow>('/rbac/roles', data);
export const updateRoleApi = (id: string, data: { nameZh?: string; nameVi?: string }) =>
  apiPatch<RoleRow>(`/rbac/roles/${id}`, data);
export const deleteRoleApi = (id: string) => apiDelete(`/rbac/roles/${id}`);
export const permissionTreeApi = () => apiGet<PermNode[]>('/rbac/permissions/tree');
export const rolePermissionIdsApi = (id: string) => apiGet<string[]>(`/rbac/roles/${id}/permissions`);
export const setRolePermissionsApi = (id: string, permissionIds: string[]) =>
  apiPut(`/rbac/roles/${id}/permissions`, { permissionIds });
