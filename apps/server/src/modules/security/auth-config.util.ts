/** 过滤未替换的占位符，避免前端误判「已启用」却渲染失败 */
export function isConfiguredSecret(value: string | undefined | null): boolean {
  const v = (value ?? '').trim();
  if (!v) return false;
  const lower = v.toLowerCase();
  if (
    lower.includes('your-') ||
    lower.includes('xxxxxx') ||
    lower.includes('changeme') ||
    lower.includes('placeholder') ||
    v.includes('你的') ||
    v === 'secret'
  ) {
    return false;
  }
  return true;
}

export function isConfiguredGoogleClientId(value: string | undefined | null): boolean {
  const v = (value ?? '').trim();
  if (!isConfiguredSecret(v)) return false;
  return v.endsWith('.apps.googleusercontent.com');
}
