/** 直线法折旧：按购入月数 / 折旧月数，净值向下取整，不低于 0 */
export function straightLineNetUnit(
  unitPrice: number,
  purchaseDate: Date | null | undefined,
  depreciationMonths: number,
  asOf: Date = new Date(),
): number {
  if (!purchaseDate || depreciationMonths <= 0) return Math.max(0, Math.floor(unitPrice));
  const months =
    (asOf.getFullYear() - purchaseDate.getFullYear()) * 12 +
    (asOf.getMonth() - purchaseDate.getMonth());
  const used = Math.max(0, months);
  if (used >= depreciationMonths) return 0;
  const ratio = 1 - used / depreciationMonths;
  return Math.max(0, Math.floor(unitPrice * ratio));
}

export function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

export function assertNonNeg(label: string, n: number) {
  if (n < 0) {
    const err = new Error(label);
    (err as Error & { code?: string }).code = 'ASSET_QTY_NEGATIVE';
    throw err;
  }
}

export type QtyState = {
  qtyTotal: number;
  qtyInUse: number;
  qtyIdle: number;
  qtyRepair: number;
  qtyDisposed: number;
};

export function sumActive(q: QtyState) {
  return q.qtyInUse + q.qtyIdle + q.qtyRepair;
}

/** 校验四态之和等于总数 */
export function assertQtyBalance(q: QtyState) {
  const sum = q.qtyInUse + q.qtyIdle + q.qtyRepair + q.qtyDisposed;
  if (sum !== q.qtyTotal) {
    const err = new Error('ASSET_QTY_IMBALANCE');
    (err as Error & { code?: string }).code = 'ASSET_QTY_IMBALANCE';
    throw err;
  }
  for (const [k, v] of Object.entries(q)) {
    if (v < 0) {
      const err = new Error(k);
      (err as Error & { code?: string }).code = 'ASSET_QTY_NEGATIVE';
      throw err;
    }
  }
}
