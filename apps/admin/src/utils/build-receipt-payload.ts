import type { PrintTicketPayload } from '@restaurant/shared';
import type { Order } from '../api/order';
import type { StoreSettings } from '../api/store';

/** 从订单快照 + 门店设置组装结账单预览 payload */
export function buildReceiptPayload(
  order: Order,
  store: Pick<StoreSettings, 'nameZh' | 'nameVi' | 'address' | 'phone'>,
  opts?: { paidAt?: string; paperWidth?: 58 | 80 },
): PrintTicketPayload {
  const items = (order.items || [])
    .filter((i) => i.status !== 'voided')
    .map((i) => ({
      nameZh: i.nameZh,
      nameVi: i.nameVi,
      qty: i.qty,
      unitPrice: i.unitPrice,
      amount: i.amount,
      remark: (i as { remark?: string | null }).remark ?? null,
    }));
  const paidAt = opts?.paidAt ?? new Date().toISOString();
  return {
    template: 'receipt',
    paperWidth: opts?.paperWidth ?? 58,
    data: {
      storeNameZh: store.nameZh,
      storeNameVi: store.nameVi,
      address: store.address,
      phone: store.phone,
      tableCode: order.tableCode,
      guestCount: order.guestCount ?? null,
      orderNo: order.orderNo,
      titleZh: '结账小票',
      titleVi: 'Hóa đơn',
      remark: order.remark,
      items,
      subtotal: order.subtotal,
      discount: order.discount,
      serviceCharge: order.serviceCharge,
      deliveryFee: order.deliveryFee,
      total: order.total,
      paidAmount: order.paidAmount || order.total,
      payments: (order.payments || []).map((p) => ({
        method: p.method,
        amount: p.amount,
        received: p.received,
      })),
      createdAt: order.createdAt,
      paidAt,
      footerZh: '欢迎下次光临',
      footerVi: 'Hẹn gặp lại',
    },
  };
}
