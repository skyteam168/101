export type LocaleCode = 'zh' | 'vi' | 'zh-CN' | 'vi-VN';

function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const val = row[key];
    if (typeof val === 'string' && val.length > 0) return val;
  }
  return '';
}

/**
 * 按当前语言取双语字段（纯函数版，对应前端 useLocaleField）。
 * 同时兼容 snake_case（name_zh）与接口 camelCase（nameZh）。
 */
export function localeField<T extends Record<string, unknown>>(
  row: T,
  field: string,
  locale: LocaleCode = 'zh',
): string {
  const isVi = locale === 'vi' || locale === 'vi-VN';
  const lang = isVi ? 'vi' : 'zh';
  const other = isVi ? 'zh' : 'vi';
  const camel = (l: string) => `${field}${l[0].toUpperCase()}${l.slice(1)}`;
  const primary = pick(row, [`${field}_${lang}`, camel(lang)]);
  if (primary) return primary;
  return pick(row, [`${field}_${other}`, camel(other)]);
}

/** 兼容命名：useLocaleField 的纯函数版本 */
export const useLocaleField = localeField;
