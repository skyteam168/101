import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { ElMessage } from 'element-plus';
import { i18n } from '../i18n';
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from '../utils/auth-storage';

type ApiBody<T = unknown> = {
  code: number | string;
  data: T;
  message: string;
};

const http = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post<ApiBody<{ accessToken: string; refreshToken: string }>>(
      '/api/auth/refresh',
      { refreshToken },
    );
    if (data.code !== 0 || !data.data) return null;
    setTokens(data.data.accessToken, data.data.refreshToken);
    return data.data.accessToken;
  } catch {
    return null;
  }
}

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (res) => {
    const body = res.data as ApiBody;
    if (body && typeof body === 'object' && 'code' in body && body.code !== 0) {
      const key = `errors.${body.code}`;
      const translated = i18n.global.t(key);
      const msg = translated === key ? body.message || String(body.code) : String(translated);
      ElMessage.error(msg);
      return Promise.reject(body);
    }
    return res;
  },
  async (error: AxiosError<ApiBody>) => {
    const status = error.response?.status;
    const code = error.response?.data?.code;
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (status === 401 && original && !original._retry && !original.url?.includes('/auth/login')) {
      original._retry = true;
      refreshing = refreshing ?? refreshAccessToken().finally(() => {
        refreshing = null;
      });
      const token = await refreshing;
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return http(original);
      }
      clearTokens();
      if (!location.pathname.startsWith('/login')) {
        location.href = `/login?redirect=${encodeURIComponent(location.pathname)}`;
      }
    }

    const errCode = code || (status === 403 ? 'FORBIDDEN' : status === 401 ? 'UNAUTHORIZED' : 'HTTP_ERROR');
    const key = `errors.${errCode}`;
    const translated = i18n.global.t(key);
    ElMessage.error(translated === key ? error.response?.data?.message || error.message : String(translated));
    return Promise.reject(error);
  },
);

export async function apiGet<T>(url: string, params?: object): Promise<T> {
  const { data } = await http.get<ApiBody<T>>(url, { params });
  return data.data;
}

export async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await http.post<ApiBody<T>>(url, body);
  return data.data;
}

export async function apiPatch<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await http.patch<ApiBody<T>>(url, body);
  return data.data;
}

export async function apiPut<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await http.put<ApiBody<T>>(url, body);
  return data.data;
}

export async function apiDelete<T>(url: string): Promise<T> {
  const { data } = await http.delete<ApiBody<T>>(url);
  return data.data;
}

export default http;
