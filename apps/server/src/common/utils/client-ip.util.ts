import { Request } from 'express';

/** 去掉 IPv4-mapped IPv6 前缀，如 ::ffff:127.0.0.1 → 127.0.0.1 */
export function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let ip = raw.trim();
  if (!ip) return null;
  // 取逗号分隔列表的第一段（XFF 可能整段传入）
  if (ip.includes(',')) ip = ip.split(',')[0]!.trim();
  if (ip.toLowerCase().startsWith('::ffff:')) {
    ip = ip.slice(7);
  }
  // 去掉方括号 IPv6
  if (ip.startsWith('[') && ip.includes(']')) {
    ip = ip.slice(1, ip.indexOf(']'));
  }
  return ip || null;
}

/**
 * 解析真实客户端 IP（经 Cloudflare / 反向代理时）。
 * 优先级：CF-Connecting-IP → True-Client-IP → X-Forwarded-For 最左 → X-Real-IP → req.ip / socket
 */
export function getClientIp(req: Request): string | null {
  const headers = req.headers;
  const cf = headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.trim()) return normalizeIp(cf);

  const trueClient = headers['true-client-ip'];
  if (typeof trueClient === 'string' && trueClient.trim()) return normalizeIp(trueClient);

  const xff = headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) return normalizeIp(xff);
  if (Array.isArray(xff) && xff[0]) return normalizeIp(xff[0]);

  const xri = headers['x-real-ip'];
  if (typeof xri === 'string' && xri.trim()) return normalizeIp(xri);

  return normalizeIp(req.ip || req.socket?.remoteAddress || null);
}

export function getUserAgent(req: Request): string | null {
  const ua = req.headers['user-agent'];
  if (!ua) return null;
  return String(ua).slice(0, 512);
}

export type ClientMeta = {
  ip?: string | null;
  userAgent?: string | null;
};

export function getClientMeta(req: Request): ClientMeta {
  return {
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
  };
}
