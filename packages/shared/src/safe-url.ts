/** 阻止 SSRF：内网 / 环回 / 链路本地 / 元数据主机名 */
function isBlockedHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host === 'metadata.google.internal') {
    return true;
  }
  // IPv6 环回 / 链路本地
  if (host === '::1' || host.startsWith('fe80:') || host.startsWith('[fe80:')) return true;
  // 裸 IPv4
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (m) {
    const a = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    if (a.some((n) => n > 255)) return true;
    if (a[0] === 10) return true;
    if (a[0] === 127) return true;
    if (a[0] === 0) return true;
    if (a[0] === 169 && a[1] === 254) return true;
    if (a[0] === 172 && a[1] >= 16 && a[1] <= 31) return true;
    if (a[0] === 192 && a[1] === 168) return true;
    if (a[0] === 100 && a[1] >= 64 && a[1] <= 127) return true; // CGNAT
  }
  return false;
}

/**
 * 外链跳转 / Webhook / AI apiBase 白名单：仅公网 http(s)，防 javascript/data 与内网 SSRF。
 */
export function isSafeExternalHttpUrl(url: string): boolean {
  const raw = (url || '').trim();
  if (!raw || raw.length > 2048) return false;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
    if (isBlockedHostname(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * 媒体地址：本站 /uploads/ 相对路径，或 http(s) 绝对地址。
 * 用于聊天图片、地标照等 :src / :href。
 */
export function isSafeMediaUrl(url: string): boolean {
  const raw = (url || '').trim();
  if (!raw || raw.length > 2048) return false;
  if (raw.startsWith('/uploads/')) {
    return !raw.includes('..') && !raw.includes('\\') && !raw.includes('\0');
  }
  return isSafeExternalHttpUrl(raw);
}
