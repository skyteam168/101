import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { closeToast, showLoadingToast, showToast } from 'vant';
import { i18n } from '../i18n';
import { clearCustomerToken, getCustomerToken } from '../utils/customer-storage';
import { getGuestToken } from '../utils/guest-storage';

type ApiBody<T = unknown> = { code: number | string; data: T; message: string };

type RequestConfig = InternalAxiosRequestConfig & {
  /** 跳过全局 loading */
  skipLoading?: boolean;
  /** 跳过自动 toast（调用方自行处理） */
  skipErrorToast?: boolean;
};

const http = axios.create({ baseURL: '/api', timeout: 30000 });

let loadingCount = 0;
let redirectingLogin = false;
let loadingTimer: ReturnType<typeof setTimeout> | null = null;

function isTableGuestApi(url: string) {
  return url.includes('/public/table/') || url.startsWith('public/table/');
}

function startLoading(config: RequestConfig) {
  if (config.skipLoading) return;
  loadingCount += 1;
  // 短请求不闪 loading，超过 280ms 再出现
  if (loadingCount === 1 && !loadingTimer) {
    loadingTimer = setTimeout(() => {
      loadingTimer = null;
      if (loadingCount > 0) {
        showLoadingToast({
          message: String(i18n.global.t('common.loading')),
          forbidClick: true,
          duration: 0,
        });
      }
    }, 280);
  }
}

function endLoading(config?: RequestConfig) {
  if (config?.skipLoading) return;
  loadingCount = Math.max(0, loadingCount - 1);
  if (loadingCount === 0) {
    if (loadingTimer) {
      clearTimeout(loadingTimer);
      loadingTimer = null;
    }
    closeToast();
  }
}

function redirectToLogin() {
  if (redirectingLogin) return;
  if (location.pathname.startsWith('/shop/login')) return;
  redirectingLogin = true;
  clearCustomerToken();
  const redirect = `${location.pathname}${location.search}`;
  location.href = `/shop/login?redirect=${encodeURIComponent(redirect)}`;
}

function isUnauthorized(code: unknown, status?: number) {
  return status === 401 || code === 'UNAUTHORIZED' || code === 401;
}

http.interceptors.request.use((config) => {
  const cfg = config as RequestConfig;
  startLoading(cfg);
  const url = String(cfg.url || '');
  // 桌台扫码会话接口必须用 guest token，避免同浏览器外卖登录态抢 Authorization
  const guestToken = getGuestToken();
  const customerToken = getCustomerToken();
  if (isTableGuestApi(url) && guestToken) {
    cfg.headers.Authorization = `Bearer ${guestToken}`;
  } else if (customerToken) {
    cfg.headers.Authorization = `Bearer ${customerToken}`;
  } else if (guestToken) {
    cfg.headers.Authorization = `Bearer ${guestToken}`;
  }
  return cfg;
});

http.interceptors.response.use(
  (res) => {
    endLoading(res.config as RequestConfig);
    const body = res.data as ApiBody;
    if (body && typeof body === 'object' && 'code' in body && body.code !== 0) {
      const url = String(res.config.url || '');
      // 顾客态未授权：清 token 并跳登录（桌台 guest 接口不处理）
      if (isUnauthorized(body.code) && !isTableGuestApi(url)) {
        const key = `errors.${body.code}`;
        const translated = i18n.global.t(key);
        showToast(translated === key ? body.message || String(body.code) : String(translated));
        redirectToLogin();
        return Promise.reject(body);
      }
      if (!(res.config as RequestConfig).skipErrorToast) {
        const key = `errors.${body.code}`;
        const translated = i18n.global.t(key);
        showToast(translated === key ? body.message || String(body.code) : String(translated));
      }
      return Promise.reject(body);
    }
    return res;
  },
  (error: AxiosError<ApiBody>) => {
    endLoading(error.config as RequestConfig | undefined);
    const status = error.response?.status;
    const code = error.response?.data?.code || 'HTTP_ERROR';
    const serverMsg = error.response?.data?.message;
    const url = String(error.config?.url || '');

    if (isUnauthorized(code, status) && !isTableGuestApi(url)) {
      const key = `errors.${code}`;
      const translated = i18n.global.t(key);
      showToast(translated === key ? serverMsg || String(code) : String(translated));
      redirectToLogin();
      return Promise.reject(error);
    }

    if (!(error.config as RequestConfig | undefined)?.skipErrorToast) {
      const key = `errors.${code}`;
      const translated = i18n.global.t(key);
      // HTTP_ERROR 常是校验失败，优先展示服务端具体原因，避免误报成「网络异常」
      if (code === 'HTTP_ERROR' && serverMsg && serverMsg !== 'HTTP_ERROR') {
        showToast(String(serverMsg));
      } else {
        showToast(translated === key ? serverMsg || error.message : String(translated));
      }
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
