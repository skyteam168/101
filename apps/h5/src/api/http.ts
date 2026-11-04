import axios, { AxiosError } from 'axios';
import { showToast } from 'vant';
import { i18n } from '../i18n';
import { getGuestToken } from '../utils/guest-storage';
import { getCustomerToken } from '../utils/customer-storage';

type ApiBody<T = unknown> = { code: number | string; data: T; message: string };

const http = axios.create({ baseURL: '/api', timeout: 30000 });

http.interceptors.request.use((config) => {
  const url = String(config.url || '');
  // 桌台扫码会话接口必须用 guest token，避免同浏览器外卖登录态抢 Authorization
  const isTableGuestApi =
    url.includes('/public/table/') || url.startsWith('public/table/');
  const guestToken = getGuestToken();
  const customerToken = getCustomerToken();
  if (isTableGuestApi && guestToken) {
    config.headers.Authorization = `Bearer ${guestToken}`;
  } else if (customerToken) {
    config.headers.Authorization = `Bearer ${customerToken}`;
  } else if (guestToken) {
    config.headers.Authorization = `Bearer ${guestToken}`;
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
    const serverMsg = error.response?.data?.message;
    const key = `errors.${code}`;
    const translated = i18n.global.t(key);
    // HTTP_ERROR 常是校验失败，优先展示服务端具体原因，避免误报成「网络异常」
    if (code === 'HTTP_ERROR' && serverMsg && serverMsg !== 'HTTP_ERROR') {
      showToast(String(serverMsg));
    } else {
      showToast(translated === key ? serverMsg || error.message : String(translated));
    }
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
