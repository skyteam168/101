import axios, { AxiosError } from 'axios';
import { showToast } from 'vant';
import { i18n } from '../i18n';
import { getGuestToken } from '../utils/guest-storage';
import { getCustomerToken } from '../utils/customer-storage';

type ApiBody<T = unknown> = { code: number | string; data: T; message: string };

const http = axios.create({ baseURL: '/api', timeout: 30000 });

http.interceptors.request.use((config) => {
  // customer token 优先；/t/ 路由回退到 guest token
  const customerToken = getCustomerToken();
  if (customerToken) {
    config.headers.Authorization = `Bearer ${customerToken}`;
  } else {
    const guestToken = getGuestToken();
    if (guestToken) config.headers.Authorization = `Bearer ${guestToken}`;
  }
  return config;
});

http.interceptors.response.use(
  (res) => {
    const body = res.data as ApiBody;
    if (body && typeof body === 'object' && 'code' in body && body.code !== 0) {
      const key = `errors.${body.code}`;
      const translated = i18n.global.t(key);
      showToast(translated === key ? body.message || String(body.code) : String(translated));
      return Promise.reject(body);
    }
    return res;
  },
  (error: AxiosError<ApiBody>) => {
    const code = error.response?.data?.code || 'HTTP_ERROR';
    const key = `errors.${code}`;
    const translated = i18n.global.t(key);
    showToast(translated === key ? error.response?.data?.message || error.message : String(translated));
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

export async function apiDelete<T>(url: string): Promise<T> {
  const { data } = await http.delete<ApiBody<T>>(url);
  return data.data;
}

export default http;
