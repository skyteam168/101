/** 千分位展示（越南盾整数） */
export function formatThousands(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return '';
  const num = typeof n === 'string' ? Number(n.replace(/\D/g, '')) : n;
  if (Number.isNaN(num)) return '';
  return new Intl.NumberFormat('vi-VN').format(num);
}

/** 输入框解析千分位字符串为整数 */
export function parseThousands(text: string): number {
  const digits = text.replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}
