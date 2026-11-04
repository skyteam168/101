import { formatVND, type PrintTicketPayload } from '@restaurant/shared';

/** 将小票 payload 渲成 ESC/POS 光栅（GS v 0），供 Web Serial 直打 */

function bi(zh?: string | null, vi?: string | null): string {
  const z = (zh || '').trim();
  const v = (vi || '').trim();
  if (z && v && z !== v) return `${z} / ${v}`;
  return z || v || '';
}

function fmtTime(iso?: string) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return iso;
  }
}

function buildLines(payload: PrintTicketPayload): string[] {
  const d = payload.data;
  const lines: string[] = [];
  const store = bi(d.storeNameZh, d.storeNameVi);
  if (store) lines.push(store);
  if (d.address) lines.push(d.address);
  if (d.phone) lines.push(d.phone);
  lines.push(bi(d.titleZh, d.titleVi) || '小票');
  lines.push('--------------------------------');
  if (d.tableCode) lines.push(`桌台: ${d.tableCode}${d.guestCount ? `  ${d.guestCount}位` : ''}`);
  if (d.orderNo) lines.push(`单号: ${d.orderNo}`);
  if (d.roundNo) lines.push(`轮次: ${d.roundNo}`);
  if (d.createdAt) lines.push(`下单: ${fmtTime(d.createdAt)}`);
  if (d.paidAt) lines.push(`结账: ${fmtTime(d.paidAt)}`);
  if (d.refundedAt) lines.push(`退款: ${fmtTime(d.refundedAt)}`);
  if (d.remark) lines.push(`备注: ${d.remark}`);
  if (d.stationNameZh || d.stationNameVi) {
    lines.push(`档口: ${bi(d.stationNameZh, d.stationNameVi)}`);
  }
  if (payload.template === 'refund') {
    lines.push('--------------------------------');
    if (d.refundAmount != null) lines.push(`退款金额: ${formatVND(d.refundAmount)}`);
    if (d.refundMethod) lines.push(`退回方式: ${d.refundMethod}`);
    if (d.refundReason) lines.push(`原因: ${d.refundReason}`);
    if (d.total != null) lines.push(`原账单: ${formatVND(d.total)}`);
    if (d.refundedAmount != null) lines.push(`累计已退: ${formatVND(d.refundedAmount)}`);
    if (d.paidAmount != null) lines.push(`剩余已付: ${formatVND(d.paidAmount)}`);
  } else {
    lines.push('--------------------------------');
    for (const it of d.items || []) {
      const name = bi(it.nameZh, it.nameVi);
      const qty = `x${it.qty}`;
      const price =
        it.amount != null ? formatVND(it.amount) : it.unitPrice != null ? formatVND(it.unitPrice) : '';
      lines.push(`${name}`);
      lines.push(`  ${qty}${price ? `    ${price}` : ''}`);
      if (it.remark) lines.push(`  * ${it.remark}`);
    }
    if (d.subtotal != null || d.total != null) {
      lines.push('--------------------------------');
      if (d.subtotal != null) lines.push(`小计: ${formatVND(d.subtotal)}`);
      if (d.discount) lines.push(`优惠: -${formatVND(d.discount)}`);
      if (d.serviceCharge) lines.push(`服务费: ${formatVND(d.serviceCharge)}`);
      if (d.deliveryFee) lines.push(`配送费: ${formatVND(d.deliveryFee)}`);
      if (d.total != null) lines.push(`合计: ${formatVND(d.total)}`);
      if (d.paidAmount != null) lines.push(`实收: ${formatVND(d.paidAmount)}`);
    }
    if (d.payments?.length) {
      for (const p of d.payments) {
        lines.push(`${p.method}: ${formatVND(p.amount)}`);
      }
    }
  }
  if (d.shift) {
    lines.push('--------------------------------');
    if (d.shift.cashierName) lines.push(`收银: ${d.shift.cashierName}`);
    if (d.shift.from || d.shift.to) lines.push(`${d.shift.from || ''} ~ ${d.shift.to || ''}`);
    if (d.shift.orderCount != null) lines.push(`单数: ${d.shift.orderCount}`);
    if (d.shift.totalSales != null) lines.push(`营业额: ${formatVND(d.shift.totalSales)}`);
  }
  lines.push('--------------------------------');
  const footer = bi(d.footerZh, d.footerVi);
  if (footer) lines.push(footer);
  lines.push('');
  lines.push('');
  return lines;
}

function canvasToRaster(canvas: HTMLCanvasElement): { bitmap: Uint8Array; width: number; height: number } {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext('2d')!;
  const { data } = ctx.getImageData(0, 0, width, height);
  const bytesPerRow = Math.ceil(width / 8);
  const bitmap = new Uint8Array(bytesPerRow * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      if (lum < 128) {
        bitmap[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }
  return { bitmap, width, height };
}

function buildEscPos(bitmap: Uint8Array, width: number, height: number, beep: boolean): Uint8Array {
  const bytesPerRow = Math.ceil(width / 8);
  const parts: number[] = [];
  // INIT
  parts.push(0x1b, 0x40);
  if (beep) {
    parts.push(0x07);
    parts.push(0x1b, 0x42, 2, 1);
  }
  // GS v 0
  parts.push(
    0x1d,
    0x76,
    0x30,
    0x00,
    bytesPerRow & 0xff,
    (bytesPerRow >> 8) & 0xff,
    height & 0xff,
    (height >> 8) & 0xff,
  );
  for (let i = 0; i < bitmap.length; i++) parts.push(bitmap[i]!);
  // feed + cut
  parts.push(0x1d, 0x56, 0x41, 0x06);
  parts.push(0x1d, 0x56, 0x00);
  return new Uint8Array(parts);
}

export function encodeTicketEscPos(payload: PrintTicketPayload): Uint8Array {
  const paperPx = payload.paperWidth === 58 ? 384 : 576;
  const lines = buildLines(payload);
  const lineHeight = 28;
  const pad = 16;
  const height = Math.max(pad * 2 + lines.length * lineHeight, 120);
  const canvas = document.createElement('canvas');
  canvas.width = paperPx;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, paperPx, height);
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 22px "Microsoft YaHei","Noto Sans SC",sans-serif';
  ctx.textBaseline = 'top';
  let y = pad;
  for (const line of lines) {
    const isTitle = line.includes('【');
    ctx.font = isTitle
      ? 'bold 26px "Microsoft YaHei","Noto Sans SC",sans-serif'
      : '20px "Microsoft YaHei","Noto Sans SC",sans-serif';
    ctx.fillText(line, 8, y, paperPx - 16);
    y += isTitle ? 32 : lineHeight;
  }
  const { bitmap, width, height: h } = canvasToRaster(canvas);
  const kitchenLike =
    payload.template === 'kitchen' ||
    payload.template === 'add' ||
    payload.template === 'void' ||
    payload.template === 'delivery';
  return buildEscPos(bitmap, width, h, kitchenLike);
}
