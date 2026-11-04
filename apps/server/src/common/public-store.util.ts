/**
 * 公开接口默认门店：优先显式参数，其次环境变量 DEFAULT_STORE_ID，最后回落 '1'（seed 单店）。
 */
export function resolvePublicStoreId(explicit?: string | null): string {
  const fromArg = (explicit || '').trim();
  if (fromArg) return fromArg;
  const fromEnv = (process.env.DEFAULT_STORE_ID || '').trim();
  return fromEnv || '1';
}
