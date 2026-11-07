/** HTTP 客户端：只读调用后台 /api，统一解包 { code, data, message } */

export type ApiEnvelope<T> = {
  code: number | string;
  data: T;
  message?: string;
};

export class RestaurantApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  async get<T>(path: string, query?: Record<string, string | undefined>): Promise<T> {
    const url = new URL(path.replace(/^\//, ''), ensureSlash(this.baseUrl));
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v != null && v !== '') url.searchParams.set(k, v);
      }
    }

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
    });

    const text = await res.text();
    let body: ApiEnvelope<T> | null = null;
    try {
      body = text ? (JSON.parse(text) as ApiEnvelope<T>) : null;
    } catch {
      throw new Error(`API 非 JSON 响应 HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    if (!res.ok) {
      throw new Error(
        `API HTTP ${res.status}: ${body?.message || body?.code || text.slice(0, 200)}`,
      );
    }
    if (!body || (body.code !== 0 && body.code !== '0')) {
      throw new Error(`业务错误 ${String(body?.code)}: ${body?.message || 'unknown'}`);
    }
    return body.data;
  }
}

function ensureSlash(base: string): string {
  return base.endsWith('/') ? base : `${base}/`;
}
