/**
 * render.ts
 * 使用 @napi-rs/canvas 将打印模板渲染为黑白位图。
 * 支持 58mm (384px) / 80mm (576px) 热敏纸宽。
 */
import { createCanvas, GlobalFonts, Canvas, SKRSContext2D } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';

// ─────────────────────────── 类型定义 ───────────────────────────

export type PrintTemplate =
  | 'kitchen'
  | 'front'
  | 'add'
  | 'void'
  | 'cancel'
  | 'receipt'
  | 'refund'
  | 'delivery'
  | 'shift'
  | 'test';

export interface PrinterInfo {
  id?: string;
  name?: string;
  ip: string;
  port: number;
  paperWidth: 58 | 80;
  connectionType?: 'network' | 'browser_usb' | 'agent_usb' | 'cloud';
}

export interface OrderItem {
  nameZh: string;
  nameVi: string;
  qty: number;
  options?: string;
  note?: string;
}

export interface ReceiptItem {
  nameZh: string;
  nameVi?: string;
  qty: number;
  amount: number;
}

export interface KitchenData {
  storeName?: string;
  orderNo: string;
  tableCode: string;
  waiter?: string;
  items: OrderItem[];
  remark?: string;
  createdAt: string;
}

export interface AddData extends KitchenData {
  roundNo: number;
}

export interface VoidData {
  storeName?: string;
  orderNo: string;
  tableCode: string;
  operator: string;
  items: Array<{ nameZh: string; nameVi: string; qty: number; reason?: string }>;
  createdAt: string;
}

export interface CancelData {
  storeName?: string;
  orderNo: string;
  tableCode?: string;
  reason: string;
  operator: string;
  createdAt: string;
}

export interface ReceiptData {
  storeName?: string;
  storeNameZh?: string;
  storeNameVi?: string;
  address?: string | null;
  phone?: string | null;
  orderNo: string;
  tableCode?: string;
  guestCount?: number;
  remark?: string;
  items: ReceiptItem[];
  subtotal: number;
  discount: number;
  serviceCharge: number;
  deliveryFee?: number;
  total: number;
  paidAmount: number;
  change: number;
  paymentMethod: string;
  payments?: { method: string; amount: number }[];
  cashier: string;
  createdAt: string;
  paidAt?: string;
  footerZh?: string;
  footerVi?: string;
}

export interface DeliveryData {
  storeName?: string;
  orderNo: string;
  customer: string;
  phone: string;
  address: string;
  items: ReceiptItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  remark?: string;
  createdAt: string;
}

export interface ShiftData {
  storeNameZh?: string;
  storeNameVi?: string;
  /** 兼容旧字段 */
  storeName?: string;
  titleZh?: string;
  titleVi?: string;
  shift?: {
    cashierName?: string;
    from?: string;
    to?: string;
    orderCount?: number;
    totalSales?: number;
  };
  /** 旧版扁平字段（兜底） */
  date?: string;
  cashier?: string;
  totalOrders?: number;
  totalAmount?: number;
  breakdown?: Array<{ method: string; amount: number }>;
  openCash?: number;
  closeCash?: number;
}

export interface TestData {
  storeName?: string;
  agentId: string;
}

/** 打印任务 Socket 消息结构 */
export interface PrintJobMessage {
  jobId: string;
  printer: PrinterInfo;
  payload: {
    template: PrintTemplate;
    paperWidth?: 58 | 80;
    data: unknown;
  };
}

/** 渲染结果：包含 1-bit 位图、尺寸 */
export interface RenderResult {
  /** 1-bit 打包位图，MSB first，每行 ceil(width/8) 字节 */
  bitmap: Buffer;
  /** 像素宽度（384 或 576） */
  width: number;
  /** 像素高度（行数） */
  height: number;
}

// ─────────────────────────── 字体注册 ───────────────────────────

const FONT_FAMILY = 'PrintFont';
let fontsRegistered = false;

export function registerFonts(): void {
  if (fontsRegistered) return;
  fontsRegistered = true;

  const ASSETS_DIR = path.resolve(__dirname, '../assets/fonts');
  // 只用静态 Regular；加粗用 canvas bold（勿用 VF 字重 + 高阈值，易整页发黑）
  const candidates: Array<{ file: string; family: string }> = [
    { file: path.join(ASSETS_DIR, 'NotoSansSC-Regular.otf'), family: FONT_FAMILY },
    { file: path.join(ASSETS_DIR, 'NotoSans-Regular.ttf'), family: FONT_FAMILY },
    { file: 'C:\\Windows\\Fonts\\msyh.ttc', family: FONT_FAMILY },
    { file: 'C:\\Windows\\Fonts\\arial.ttf', family: FONT_FAMILY },
    { file: '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', family: FONT_FAMILY },
    { file: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', family: FONT_FAMILY },
  ];

  let registered = 0;
  for (const c of candidates) {
    if (fs.existsSync(c.file)) {
      try {
        GlobalFonts.registerFromPath(c.file, c.family);
        console.log(`[render] 注册字体: ${path.basename(c.file)}`);
        registered++;
        if (registered >= 2) break;
      } catch (e) {
        console.warn(`[render] 字体注册失败 ${c.file}:`, e);
      }
    }
  }

  if (registered === 0) {
    console.warn('[render] 警告：未找到任何字体文件，中文可能无法正常渲染。请将 NotoSansSC-Regular.otf 放入 assets/fonts/');
  }
}

// ─────────────────────────── 渲染器类 ───────────────────────────

/** 用于格式化越南盾的简单函数 */
function fmtVND(amount: number): string {
  return amount.toLocaleString('vi-VN') + ' ₫';
}

/** 格式化日期时间 */
function fmtDateTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('zh-CN', { hour12: false });
  } catch {
    return isoStr;
  }
}

export type FontSizes = { huge: number; large: number; medium: number; normal: number; small: number };

class TicketRenderer {
  private canvas: Canvas;
  private ctx: SKRSContext2D;
  private y: number;
  readonly width: number;
  readonly pad: number;
  readonly innerW: number;
  /** 字号配置（package-level 访问） */
  readonly sz: FontSizes;

  constructor(paperWidth: 58 | 80) {
    this.width = paperWidth === 58 ? 384 : 576;
    this.pad = 10;
    this.innerW = this.width - this.pad * 2;
    // 画布高度给够 4000px，后面会裁剪
    this.canvas = createCanvas(this.width, 4000);
    this.ctx = this.canvas.getContext('2d') as SKRSContext2D;

    // 白底；top baseline 避免标题/正文互相压盖（旧黑底横幅曾切掉桌号）
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.width, 4000);
    this.ctx.fillStyle = '#000000';
    this.ctx.textBaseline = 'top';

    this.y = this.pad;

    // 约 1.2 倍字号（相对图二基准）
    this.sz =
      paperWidth === 58
        ? {
            huge: 29,
            large: 26,
            medium: 22,
            normal: 20,
            small: 18,
          }
        : {
            huge: 36,
            large: 31,
            medium: 26,
            normal: 24,
            small: 19,
          };
  }

  private font(size: number, bold = false): string {
    return `${bold ? 'bold ' : ''}${size}px "${FONT_FAMILY}", "Microsoft YaHei", sans-serif`;
  }

  private lineStep(size: number, title = false): number {
    return title ? size + 10 : size + 9;
  }

  /** 纯黑填充；正文再水平叠印 1px，热敏更实且不易糊成黑块 */
  private paintText(text: string, x: number, y: number, maxWidth?: number, thicken = false): void {
    this.ctx.fillStyle = '#000000';
    if (maxWidth != null) {
      this.ctx.fillText(text, x, y, maxWidth);
      if (thicken) this.ctx.fillText(text, x + 1, y, maxWidth);
    } else {
      this.ctx.fillText(text, x, y);
      if (thicken) this.ctx.fillText(text, x + 1, y);
    }
  }

  /** 水平居中文字 */
  centerText(text: string, size: number, bold = false): void {
    this.ctx.font = this.font(size, bold);
    const w = this.ctx.measureText(text).width;
    this.paintText(text, Math.max(this.pad, (this.width - w) / 2), this.y, this.innerW, !bold);
    this.y += this.lineStep(size, bold);
  }

  /** 左对齐文字（带 padding） */
  leftText(text: string, size: number, bold = false, x?: number): void {
    this.ctx.font = this.font(size, bold);
    this.paintText(text, x ?? this.pad, this.y, this.innerW, !bold);
    this.y += this.lineStep(size, bold);
  }

  /** 两端对齐：左文字 + 右文字 */
  rowText(left: string, right: string, size: number, bold = false): void {
    this.ctx.font = this.font(size, bold);
    this.paintText(left, this.pad, this.y, this.innerW * 0.62, !bold);
    const rw = this.ctx.measureText(right).width;
    this.paintText(right, this.width - this.pad - rw, this.y, undefined, !bold);
    this.y += this.lineStep(size, bold);
  }

  /** @deprecated 图二样式不再使用黑底横幅；保留以免旧调用报错 */
  invertedBanner(text: string, size: number): void {
    this.centerText(text, size, true);
  }

  /** 实线分隔符 */
  separator(): void {
    this.dashedSeparator();
  }

  /** 虚线分隔符（与浏览器打印台一致） */
  dashedSeparator(): void {
    const dashStr = '-'.repeat(Math.max(16, Math.floor(this.innerW / 7)));
    this.ctx.font = this.font(this.sz.small);
    this.paintText(dashStr, this.pad, this.y, this.innerW, true);
    this.y += this.sz.small + 4;
  }

  /** 空行 */
  gap(px?: number): void {
    this.y += px ?? 10;
  }

  /**
   * 厨房/加菜等：菜名中越同行，下一行数量（可选金额）
   * 对齐图二：`回锅肉 / Thịt...` + `  x1    95.000 ₫`
   */
  renderKitchenItems(
    items: Array<{
      nameZh?: string;
      nameVi?: string;
      qty: number;
      amount?: number;
      unitPrice?: number;
      options?: string;
      note?: string;
      remark?: string;
      reason?: string;
    }>,
    withPrice = false,
  ): void {
    for (const item of items) {
      const name = biLabel(item.nameZh, item.nameVi);
      this.leftText(name || '-', this.sz.medium, false);
      const qty = `  x${item.qty}`;
      const price =
        withPrice && (item.amount != null || item.unitPrice != null)
          ? `    ${fmtVND(item.amount ?? item.unitPrice ?? 0)}`
          : '';
      this.leftText(`${qty}${price}`, this.sz.normal, false);
      if (item.options) this.leftText(`  [${item.options}]`, this.sz.small, false);
      const note = item.note || item.remark;
      if (note) this.leftText(`  * ${note}`, this.sz.small, false);
      if (item.reason) this.leftText(`  * ${item.reason}`, this.sz.small, false);
      this.gap(2);
    }
  }

  /** 收据菜品列表（同图二） */
  renderReceiptItems(
    items: Array<{ nameZh?: string; nameVi?: string; qty: number; amount?: number; unitPrice?: number }>,
  ): void {
    this.renderKitchenItems(items, true);
  }

  /** 获取裁剪后的 1-bit 位图 */
  toBitmap(): RenderResult {
    const { width } = this;
    const fullHeight = 4000;

    // 获取像素数据
    const imageData = this.ctx.getImageData(0, 0, width, fullHeight);
    const data = imageData.data; // Uint8ClampedArray, RGBA

    // 从底部扫描，找最后一行非白色像素
    let lastRow = Math.min(this.y + 32, fullHeight - 1);
    for (let y = fullHeight - 1; y >= 0; y--) {
      let hasInk = false;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r < 240 || g < 240 || b < 240) {
          hasInk = true;
          break;
        }
      }
      if (hasInk) {
        lastRow = y;
        break;
      }
    }

    // 在原有底部基础上再加约 1.5cm 撕纸留白（203dpi：15mm≈120px；合计≈168px）
    const tearMarginPx = 168;
    const cropH = Math.ceil(Math.max(lastRow + tearMarginPx, this.y) / 8) * 8;
    const finalH = Math.min(cropH, fullHeight);

    // 标准中值阈值；过高会把抗锯齿灰边糊成整页黑块
    const bytesPerRow = Math.ceil(width / 8);
    const bitmap = Buffer.alloc(bytesPerRow * finalH, 0x00);
    const INK_LUMA = 128;

    for (let y = 0; y < finalH; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const lum = (r * 299 + g * 587 + b * 114) / 1000;
        if (lum < INK_LUMA) {
          const byteIdx = y * bytesPerRow + Math.floor(x / 8);
          const bitIdx = 7 - (x % 8); // MSB first
          bitmap[byteIdx] |= 1 << bitIdx;
        }
      }
    }

    return { bitmap, width, height: finalH };
  }
}

// ─────────────────────────── 各模板渲染函数 ───────────────────────────

/** 中越双语拼一行（与 admin ticket-escpos 一致） */
function biLabel(zh?: string | null, vi?: string | null): string {
  const z = (zh || '').trim();
  const v = (vi || '').trim();
  if (z && v && z !== v) return `${z} / ${v}`;
  return z || v || '';
}

function L(zh: string, vi: string) {
  return biLabel(zh, vi);
}

type TicketPayloadData = {
  storeName?: string;
  storeNameZh?: string;
  storeNameVi?: string;
  address?: string | null;
  phone?: string | null;
  titleZh?: string;
  titleVi?: string;
  orderNo?: string;
  tableCode?: string;
  guestCount?: number | null;
  waiter?: string;
  cashier?: string;
  remark?: string;
  createdAt?: string;
  paidAt?: string;
  refundedAt?: string;
  roundNo?: number;
  stationNameZh?: string;
  stationNameVi?: string;
  items?: Array<{
    nameZh?: string;
    nameVi?: string;
    qty: number;
    amount?: number;
    unitPrice?: number;
    options?: string;
    note?: string;
    remark?: string;
    reason?: string;
  }>;
  subtotal?: number;
  discount?: number;
  serviceCharge?: number;
  deliveryFee?: number;
  total?: number;
  paidAmount?: number;
  change?: number;
  paymentMethod?: string;
  payments?: { method: string; amount: number }[];
  refundAmount?: number;
  refundMethod?: string;
  refundReason?: string;
  refundedAmount?: number;
  footerZh?: string;
  footerVi?: string;
  customer?: string;
  operator?: string;
  reason?: string;
  shift?: ShiftData['shift'];
  date?: string;
  cashierFlat?: string;
  totalOrders?: number;
  totalAmount?: number;
  breakdown?: Array<{ method: string; amount: number }>;
  openCash?: number;
  closeCash?: number;
};

/**
 * 统一按图二 / 浏览器打印台样式渲染：无黑底横幅，虚线分隔，标题略加粗。
 */
function renderPayloadStyle(
  r: TicketRenderer,
  data: TicketPayloadData,
  opts: {
    fallbackTitleZh: string;
    fallbackTitleVi?: string;
    withPrice?: boolean;
    showTotals?: boolean;
    extraMeta?: () => void;
    afterItems?: () => void;
  },
): void {
  const store = biLabel(data.storeNameZh, data.storeNameVi) || data.storeName || '';
  if (store) r.leftText(store, r.sz.small, false);
  if (data.address) r.leftText(String(data.address), r.sz.small);
  if (data.phone) r.leftText(String(data.phone), r.sz.small);

  const title =
    biLabel(data.titleZh, data.titleVi) ||
    biLabel(opts.fallbackTitleZh, opts.fallbackTitleVi || '');
  r.leftText(title, r.sz.large, true);
  r.dashedSeparator();

  if (data.tableCode) {
    const guests =
      data.guestCount != null && data.guestCount > 0
        ? `  ${data.guestCount} ${L('位', 'khách')}`
        : '';
    r.leftText(`${L('桌台', 'Bàn')}: ${data.tableCode}${guests}`, r.sz.normal);
  }
  if (data.orderNo) r.leftText(`${L('单号', 'Mã đơn')}: ${data.orderNo}`, r.sz.normal);
  if (data.roundNo) r.leftText(`${L('轮次', 'Lượt')}: ${data.roundNo}`, r.sz.normal);
  if (data.createdAt) r.leftText(`${L('下单', 'Đặt')}: ${fmtDateTime(data.createdAt)}`, r.sz.normal);
  if (data.paidAt) r.leftText(`${L('结账', 'Thanh toán')}: ${fmtDateTime(data.paidAt)}`, r.sz.normal);
  if (data.refundedAt) {
    r.leftText(`${L('退款', 'Hoàn tiền')}: ${fmtDateTime(data.refundedAt)}`, r.sz.normal);
  }
  if (data.cashier) r.leftText(`${L('收银', 'Thu ngân')}: ${data.cashier}`, r.sz.normal);
  if (data.waiter) r.leftText(`${L('服务员', 'NV')}: ${data.waiter}`, r.sz.normal);
  if (data.operator) r.leftText(`${L('操作人', 'NV')}: ${data.operator}`, r.sz.normal);
  if (data.remark) r.leftText(`${L('备注', 'Ghi chú')}: ${data.remark}`, r.sz.normal);
  if (data.reason) r.leftText(`${L('原因', 'Lý do')}: ${data.reason}`, r.sz.normal);
  if (data.stationNameZh || data.stationNameVi) {
    r.leftText(`${L('档口', 'Quầy')}: ${biLabel(data.stationNameZh, data.stationNameVi)}`, r.sz.normal);
  }
  opts.extraMeta?.();

  r.dashedSeparator();
  r.renderKitchenItems(data.items || [], !!opts.withPrice);

  if (opts.showTotals) {
    r.dashedSeparator();
    if (data.subtotal != null) r.rowText(`${L('小计', 'Tạm tính')}:`, fmtVND(data.subtotal), r.sz.normal);
    if (data.discount) r.rowText(`${L('优惠', 'Giảm giá')}:`, `-${fmtVND(data.discount)}`, r.sz.normal);
    if (data.serviceCharge) {
      r.rowText(`${L('服务费', 'Phí phục vụ')}:`, fmtVND(data.serviceCharge), r.sz.normal);
    }
    if (data.deliveryFee) {
      r.rowText(`${L('配送费', 'Phí giao')}:`, fmtVND(data.deliveryFee), r.sz.normal);
    }
    if (data.total != null) r.rowText(`${L('合计', 'TỔNG')}:`, fmtVND(data.total), r.sz.medium, true);
    if (data.paidAmount != null) {
      r.rowText(`${L('实收', 'Thực thu')}:`, fmtVND(data.paidAmount), r.sz.normal);
    }
    if (data.payments?.length) {
      for (const p of data.payments) {
        r.rowText(`${p.method}:`, fmtVND(p.amount), r.sz.normal);
      }
    } else if (data.paymentMethod) {
      r.leftText(`${L('支付', 'TT')}: ${data.paymentMethod}`, r.sz.normal);
    }
    if (data.change && data.change > 0) {
      r.rowText(`${L('找零', 'Tiền thừa')}:`, fmtVND(data.change), r.sz.normal);
    }
  }

  opts.afterItems?.();

  r.dashedSeparator();
  // 前台/结账/外卖等顾客向小票：缺省欢迎语（与结账单一致）
  const footer =
    biLabel(data.footerZh, data.footerVi) ||
    (opts.showTotals ? biLabel('欢迎下次光临', 'Hẹn gặp lại') : '');
  if (footer) r.leftText(footer, r.sz.small, false);
  // 欢迎语下方再留约 1.5cm+，方便撕纸
  r.gap(168);
}

function renderKitchen(r: TicketRenderer, data: KitchenData): void {
  renderPayloadStyle(r, data as unknown as TicketPayloadData, {
    fallbackTitleZh: '【后厨】厨房单',
    fallbackTitleVi: '【Bếp】Phiếu bếp',
    withPrice: false,
  });
}

function renderFront(r: TicketRenderer, data: KitchenData): void {
  renderPayloadStyle(r, data as unknown as TicketPayloadData, {
    fallbackTitleZh: '【堂食】前台总单',
    fallbackTitleVi: '【Tại chỗ】Phiếu tổng',
    withPrice: true,
    showTotals: true,
  });
}

function renderAdd(r: TicketRenderer, data: AddData): void {
  renderPayloadStyle(r, data as unknown as TicketPayloadData, {
    fallbackTitleZh: '【堂食】加菜',
    fallbackTitleVi: '【Tại chỗ】THÊM MÓN',
    withPrice: true,
  });
}

function renderVoid(r: TicketRenderer, data: VoidData): void {
  renderPayloadStyle(r, data as unknown as TicketPayloadData, {
    fallbackTitleZh: '【后厨】退菜',
    fallbackTitleVi: '【Bếp】HỦY MÓN',
    withPrice: false,
  });
}

function renderCancel(r: TicketRenderer, data: CancelData): void {
  renderPayloadStyle(r, data as unknown as TicketPayloadData, {
    fallbackTitleZh: '【取消】取消单',
    fallbackTitleVi: '【Hủy】Hủy đơn',
    withPrice: false,
  });
}

function renderRefund(
  r: TicketRenderer,
  data: ReceiptData & {
    refundAmount?: number;
    refundMethod?: string;
    refundReason?: string;
    refundedAt?: string;
    refundedAmount?: number;
    titleZh?: string;
    titleVi?: string;
  },
): void {
  renderPayloadStyle(r, data as unknown as TicketPayloadData, {
    fallbackTitleZh: '【退款】退款小票',
    fallbackTitleVi: '【Hoàn】Phiếu hoàn tiền',
    withPrice: false,
    afterItems: () => {
      r.dashedSeparator();
      if (data.refundAmount != null) {
        r.rowText(`${L('退款金额', 'Số hoàn')}:`, fmtVND(data.refundAmount), r.sz.medium, true);
      }
      if (data.refundMethod) r.leftText(`${L('退回方式', 'Cách hoàn')}: ${data.refundMethod}`, r.sz.normal);
      if (data.refundReason) r.leftText(`${L('原因', 'Lý do')}: ${data.refundReason}`, r.sz.normal);
      if (data.total != null) r.rowText(`${L('原账单', 'Hóa đơn gốc')}:`, fmtVND(data.total), r.sz.normal);
      if (data.refundedAmount != null) {
        r.rowText(`${L('累计已退', 'Đã hoàn')}:`, fmtVND(data.refundedAmount), r.sz.normal);
      }
      if (data.paidAmount != null) {
        r.rowText(`${L('剩余已付', 'Còn lại')}:`, fmtVND(data.paidAmount), r.sz.normal);
      }
    },
  });
}

function renderReceipt(r: TicketRenderer, data: ReceiptData): void {
  renderPayloadStyle(r, data as unknown as TicketPayloadData, {
    fallbackTitleZh: '【结账】结账小票',
    fallbackTitleVi: '【TT】Hóa đơn',
    withPrice: true,
    showTotals: true,
  });
}

function renderDelivery(r: TicketRenderer, data: DeliveryData): void {
  renderPayloadStyle(
    r,
    {
      ...(data as unknown as TicketPayloadData),
      remark: data.remark,
    },
    {
      fallbackTitleZh: '【外卖】外卖单',
      fallbackTitleVi: '【Giao】Đơn giao hàng',
      withPrice: true,
      showTotals: true,
      extraMeta: () => {
        if (data.customer || data.phone) {
          r.leftText(`${L('客户', 'KH')}: ${data.customer || ''} ${data.phone || ''}`.trim(), r.sz.normal);
        }
        if (data.address) r.leftText(`${L('地址', 'Địa chỉ')}: ${data.address}`, r.sz.normal);
      },
    },
  );
}

function renderShift(r: TicketRenderer, data: ShiftData): void {
  renderPayloadStyle(
    r,
    {
      storeNameZh: data.storeNameZh,
      storeNameVi: data.storeNameVi,
      storeName: data.storeName,
      titleZh: data.titleZh,
      titleVi: data.titleVi,
      cashier: data.shift?.cashierName || data.cashier,
      footerZh: undefined,
      footerVi: undefined,
      items: [],
    },
    {
      fallbackTitleZh: '【交班】交班单',
      fallbackTitleVi: '【Ca】Bàn giao ca',
      afterItems: () => {
        const shift = data.shift;
        if (shift?.from || shift?.to) {
          r.leftText(`${shift?.from || ''} ~ ${shift?.to || ''}`, r.sz.normal);
        } else if (data.date) {
          r.leftText(`${L('日期', 'Ngày')}: ${data.date}`, r.sz.normal);
        }
        if (data.openCash !== undefined) {
          r.rowText(`${L('开始现金', 'Tiền đầu')}:`, fmtVND(data.openCash), r.sz.normal);
        }
        const breakdown = Array.isArray(data.breakdown) ? data.breakdown : [];
        for (const b of breakdown) {
          r.rowText(`  ${b.method}:`, fmtVND(b.amount), r.sz.normal);
        }
        r.dashedSeparator();
        r.rowText(
          `${L('单数', 'Số đơn')}:`,
          String(shift?.orderCount ?? data.totalOrders ?? 0),
          r.sz.normal,
        );
        r.rowText(
          `${L('营业额', 'Doanh thu')}:`,
          fmtVND(shift?.totalSales ?? data.totalAmount ?? 0),
          r.sz.medium,
          true,
        );
        if (data.closeCash !== undefined) {
          r.rowText(`${L('结束现金', 'Tiền cuối')}:`, fmtVND(data.closeCash), r.sz.normal);
        }
      },
    },
  );
}

function renderTest(r: TicketRenderer, data: TestData, agentIdFallback: string): void {
  r.leftText('===== 测试打印 / PRINT TEST =====', r.sz.large, true);
  r.separator();
  r.rowText('代理 ID:', data.agentId || agentIdFallback, r.sz.normal);
  r.rowText('时间:', fmtDateTime(new Date().toISOString()), r.sz.small);
  r.gap(16);
  r.centerText('打印机工作正常 ✓', r.sz.normal);
  r.centerText('Máy in hoạt động bình thường ✓', r.sz.small);
  r.gap(24);
}

// ─────────────────────────── 主入口 ───────────────────────────

/**
 * 将打印任务渲染为 1-bit 位图。
 * @param msg 打印任务消息
 * @param agentId 代理 ID（用于测试打印）
 */
export function renderTicket(msg: PrintJobMessage, agentId = ''): RenderResult {
  const paperWidth = msg.payload.paperWidth ?? msg.printer.paperWidth ?? 58;
  const r = new TicketRenderer(paperWidth as 58 | 80);
  const data = msg.payload.data as Record<string, unknown>;
  const template = msg.payload.template;

  switch (template) {
    case 'kitchen':
      renderKitchen(r, data as unknown as KitchenData);
      break;
    case 'front':
      renderFront(r, data as unknown as KitchenData);
      break;
    case 'add':
      renderAdd(r, data as unknown as AddData);
      break;
    case 'void':
      renderVoid(r, data as unknown as VoidData);
      break;
    case 'cancel':
      renderCancel(r, data as unknown as CancelData);
      break;
    case 'receipt':
      renderReceipt(r, data as unknown as ReceiptData);
      break;
    case 'refund':
      renderRefund(r, data as unknown as ReceiptData);
      break;
    case 'delivery':
      renderDelivery(r, data as unknown as DeliveryData);
      break;
    case 'shift':
      renderShift(r, data as unknown as ShiftData);
      break;
    case 'test':
      renderTest(r, data as unknown as TestData, agentId);
      break;
    default:
      // 未知模板：打印原始 JSON
      r.centerText('UNKNOWN TEMPLATE', r.sz.medium, true);
      r.leftText(JSON.stringify(msg.payload, null, 2).slice(0, 500), r.sz.small);
      break;
  }

  return r.toBitmap();
}
