/**
 * 格式化越南盾金额（整数盾）。
 * 中文界面也统一显示 VND。
 */
export function formatVND(amount: number | bigint | null | undefined): string {
  const n = amount == null ? 0 : typeof amount === 'bigint' ? Number(amount) : amount;
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(n);
}
