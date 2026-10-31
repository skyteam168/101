/**
 * 外链跳转白名单：仅 http / https，防 javascript: / data: 等。
 */
export function isSafeExternalHttpUrl(url: string): boolean {
  const raw = (url || '').trim();
  if (!raw || raw.length > 2048) return false;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
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
