import type { PrintTicketPayload } from '@restaurant/shared';
import type { DeliveryOrder, StoreInfo } from '../api/delivery';

/** 已结清：可展示电子小票 */
export function canShowEReceipt(order: DeliveryOrder): boolean {
  if (order.paymentStatus === 'paid') return true;
  if (order.status === 'paid' || order.status === 'completed') return true;
  const paid = Number(order.paidAmount ?? 0);
  const total = Number(order.total ?? 0);
  return total > 0 && paid >= total;
}

function resolvePaidAt(order: DeliveryOrder): string {
  const tl = order.statusTimeline || [];
  for (let i = tl.length - 1; i >= 0; i--) {
    const s = tl[i]?.status;
    if (s === 'paid' || s === 'completed') return tl[i].at;
  }
  return order.updatedAt || order.createdAt;
}

/** 与收银结账小票字段对齐，组装 H5 电子小票 payload */
export function buildEReceiptPayload(
  order: DeliveryOrder,
  store: Pick<StoreInfo, 'nameZh' | 'nameVi' | 'address' | 'phone'>,
): PrintTicketPayload {
  const items = (order.items || [])
    .filter((i) => (i as { status?: string }).status !== 'voided')
    .map((i) => ({
      nameZh: i.nameZh,
      nameVi: i.nameVi,
      qty: i.qty,
      unitPrice: i.unitPrice,
      amount: i.amount,
    }));

  const payments =
    order.payments && order.payments.length
      ? order.payments.map((p) => ({ method: p.method, amount: p.amount }))
      : order.payMethod
        ? [{ method: order.payMethod, amount: order.paidAmount ?? order.total }]
        : [];

  return {
    template: 'receipt',
    paperWidth: 58,
    data: {
      storeNameZh: store.nameZh,
      storeNameVi: store.nameVi,
      address: store.address,
      phone: store.phone,
      tableCode: order.tableCode ?? null,
      orderNo: order.orderNo,
      titleZh: '结账小票',
      titleVi: 'Hóa đơn',
      remark: order.remark,
      items,
      subtotal: order.subtotal,
      discount: order.discount ?? 0,
      serviceCharge: order.serviceCharge ?? 0,
      deliveryFee: order.deliveryFee,
      total: order.total,
      paidAmount: order.paidAmount ?? order.total,
      payments,
      createdAt: order.createdAt,
      paidAt: resolvePaidAt(order),
      footerZh: '欢迎下次光临',
      footerVi: 'Hẹn gặp lại',
    },
  };
}
