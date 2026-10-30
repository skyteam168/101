import { apiGet, apiPatch, apiPost } from './http';

export type MenuNode = {
  id: string;
  code: string;
  nameZh: string;
  nameVi: string;
  path: string | null;
  sort: number;
  children: MenuNode[];
};

export type MeResult = {
  user: {
    id: string;
    username: string;
    displayName: string;
    phone: string | null;
    lang: 'zh' | 'vi';
    status: string;
    storeId: string | null;
  };
  roles: { code: string; nameZh: string; nameVi: string }[];
  permissions: string[];
  menus: MenuNode[];
};

export function loginApi(username: string, password: string) {
  return apiPost<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; username: string; displayName: string; lang: string };
  }>('/auth/login', { username, password });
}

export function logoutApi(refreshToken?: string) {
  return apiPost('/auth/logout', { refreshToken: refreshToken ?? '' });
}

export function meApi() {
  return apiGet<MeResult>('/auth/me');
}

export function updateProfileApi(data: { lang?: 'zh' | 'vi'; displayName?: string }) {
  return apiPatch('/auth/profile', data);
}
