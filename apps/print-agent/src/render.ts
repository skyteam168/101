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
  ip: string;
  port: number;
  paperWidth: 58 | 80;
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
  storeName?: string;
  date: string;
  cashier: string;
  totalOrders: number;
  totalAmount: number;
  breakdown: Array<{ method: string; amount: number }>;
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
  const candidates: Array<{ file: string; family: string }> = [
    // 优先使用本地 Noto 字体（覆盖中文 + 越南文 + 拉丁）
    { file: path.join(ASSETS_DIR, 'NotoSansSC-Regular.otf'), family: FONT_FAMILY },
    { file: path.join(ASSETS_DIR, 'NotoSans-Regular.ttf'), family: FONT_FAMILY },
    // Windows 系统字体回退
    { file: 'C:\\Windows\\Fonts\\msyh.ttc', family: FONT_FAMILY },
    { file: 'C:\\Windows\\Fonts\\arial.ttf', family: FONT_FAMILY },
    // Linux 系统字体回退
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
        if (registered >= 2) break; // 注册足够多的字体后停止
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

    // 白底
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.width, 4000);
    this.ctx.fillStyle = '#000000';

    this.y = this.pad;

    // 字号随纸宽缩放
    const scale = paperWidth === 80 ? 1.5 : 1;
    this.sz = {
      huge: Math.round(72 * scale),    // 桌台号
      large: Math.round(44 * scale),   // 区块标题
      medium: Math.round(32 * scale),  // 副标题
      normal: Math.round(26 * scale),  // 正文
      small: Math.round(20 * scale),   // 辅助文字
    };
  }

  private font(size: number, bold = false): string {
    return `${bold ? 'bold ' : ''}${size}px "${FONT_FAMILY}", sans-serif`;
  }

  /** 水平居中文字 */
  centerText(text: string, size: number, bold = false): void {
    this.ctx.font = this.font(size, bold);
    const w = this.ctx.measureText(text).width;
    this.ctx.fillStyle = '#000000';
    this.ctx.fillText(text, Math.max(0, (this.width - w) / 2), this.y);
    this.y += size * 1.35;
  }

  /** 左对齐文字（带 padding） */
  leftText(text: string, size: number, bold = false, x?: number): void {
    this.ctx.font = this.font(size, bold);
    this.ctx.fillStyle = '#000000';
    this.ctx.fillText(text, x ?? this.pad, this.y, this.innerW);
    this.y += size * 1.35;
  }

  /** 两端对齐：左文字 + 右文字 */
  rowText(left: string, right: string, size: number, bold = false): void {
    this.ctx.font = this.font(size, bold);
    this.ctx.fillStyle = '#000000';
    this.ctx.fillText(left, this.pad, this.y, this.innerW * 0.65);
    const rw = this.ctx.measureText(right).width;
    this.ctx.fillText(right, this.width - this.pad - rw, this.y);
    this.y += size * 1.35;
  }

  /** 反色（黑底白字）横幅 */
  invertedBanner(text: string, size: number): void {
    const bannerH = size * 1.8;
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, this.y, this.width, bannerH);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = this.font(size, true);
    const tw = this.ctx.measureText(text).width;
    this.ctx.fillText(text, Math.max(0, (this.width - tw) / 2), this.y + (bannerH - size) / 2 + size * 0.85);
    this.ctx.fillStyle = '#000000';
    this.y += bannerH + 4;
  }

  /** 实线分隔符 */
  separator(): void {
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(this.pad, this.y, this.innerW, 2);
    this.y += 8;
  }

  /** 虚线分隔符（用 - 字符） */
  dashedSeparator(): void {
    const dashStr = '- '.repeat(Math.floor(this.innerW / (this.sz.small * 0.6)));
    this.ctx.font = this.font(this.sz.small);
    this.ctx.fillStyle = '#000000';
    this.ctx.fillText(dashStr, this.pad, this.y, this.innerW);
    this.y += this.sz.small * 1.35;
  }

  /** 空行 */
  gap(px?: number): void {
    this.y += px ?? 16;
  }

  /**
   * 渲染菜品列表（厨房 / 加菜 / 退菜）
   * 每道菜显示：数量 × 中文名 / 越南文名
   */
  renderKitchenItems(items: Array<{ nameZh: string; nameVi: string; qty: number; options?: string; note?: string; reason?: string }>): void {
    for (const item of items) {
      // 数量 + 中文名 用大字体
      this.leftText(`× ${item.qty}  ${item.nameZh}`, this.sz.medium, true);
      // 越南文名用小字体
      if (item.nameVi && item.nameVi !== item.nameZh) {
        this.leftText(`      ${item.nameVi}`, this.sz.small, false, this.pad + 8);
      }
      if (item.options) {
        this.leftText(`  [${item.options}]`, this.sz.small);
      }
      if (item.note) {
        this.leftText(`  备注: ${item.note}`, this.sz.small);
      }
      if ((item as { reason?: string }).reason) {
        this.leftText(`  原因: ${(item as { reason?: string }).reason}`, this.sz.small);
      }
      this.gap(4);
    }
  }

  /**
   * 渲染收据菜品列表（中越双语：中文主行 + 越南文副行，客人两侧都能看懂）
   */
  renderReceiptItems(items: ReceiptItem[]): void {
    for (const item of items) {
      const zh = item.nameZh || '';
      const vi = item.nameVi || '';
      const primary = zh || vi;
      this.rowText(`${primary} ×${item.qty}`, fmtVND(item.amount), this.sz.normal);
      if (vi && zh && vi !== zh) {
        this.leftText(vi, this.sz.small);
      } else if (!zh && vi) {
        /* primary 已是越南文 */
      }
    }
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

    // 裁剪高度 = lastRow + 底部留白 32px，且对齐到 8 的倍数
    const cropH = Math.ceil((lastRow + 40) / 8) * 8;
    const finalH = Math.min(cropH, fullHeight);

    // 转换为 1-bit 位图
    const bytesPerRow = Math.ceil(width / 8);
    const bitmap = Buffer.alloc(bytesPerRow * finalH, 0x00);

    for (let y = 0; y < finalH; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const lum = (r * 299 + g * 587 + b * 114) / 1000;
        if (lum < 128) {
          // 黑色像素 → bit = 1
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

function renderKitchen(r: TicketRenderer, data: KitchenData): void {
  if (data.storeName) r.centerText(data.storeName, r.sz.normal);
  r.invertedBanner('厨房打印  BẾP', r.sz.large);
  r.gap(8);
  r.centerText(data.tableCode, r.sz.huge, true);
  r.separator();
  r.rowText(`单号: ${data.orderNo}`, fmtDateTime(data.createdAt), r.sz.small);
  if (data.waiter) r.leftText(`服务员: ${data.waiter}`, r.sz.small);
  r.separator();
  r.renderKitchenItems(data.items);
  if (data.remark) {
    r.separator();
    r.leftText(`备注 / Ghi chú: ${data.remark}`, r.sz.small);
  }
  r.gap(24);
}

function renderFront(r: TicketRenderer, data: KitchenData): void {
  if (data.storeName) r.centerText(data.storeName, r.sz.normal);
  r.invertedBanner('前台打印  PHỤC VỤ', r.sz.large);
  r.gap(8);
  r.centerText(data.tableCode, r.sz.huge, true);
  r.separator();
  r.rowText(`单号: ${data.orderNo}`, fmtDateTime(data.createdAt), r.sz.small);
  if (data.waiter) r.leftText(`服务员: ${data.waiter}`, r.sz.small);
  r.separator();
  r.renderKitchenItems(data.items);
  if (data.remark) {
    r.separator();
    r.leftText(`备注 / Ghi chú: ${data.remark}`, r.sz.small);
  }
  r.gap(24);
}

function renderAdd(r: TicketRenderer, data: AddData): void {
  if (data.storeName) r.centerText(data.storeName, r.sz.normal);
  r.invertedBanner(`加菜 / THÊM MÓN  第${data.roundNo}轮 / Lần ${data.roundNo}`, r.sz.large);
  r.gap(8);
  r.centerText(data.tableCode, r.sz.huge, true);
  r.separator();
  r.rowText(`单号: ${data.orderNo}`, fmtDateTime(data.createdAt), r.sz.small);
  if (data.waiter) r.leftText(`服务员: ${data.waiter}`, r.sz.small);
  r.separator();
  r.renderKitchenItems(data.items);
  if (data.remark) {
    r.separator();
    r.leftText(`备注 / Ghi chú: ${data.remark}`, r.sz.small);
  }
  r.gap(24);
}

function renderVoid(r: TicketRenderer, data: VoidData): void {
  if (data.storeName) r.centerText(data.storeName, r.sz.normal);
  r.invertedBanner('退菜 / HỦY MÓN', r.sz.large);
  r.gap(8);
  r.centerText(data.tableCode, r.sz.huge, true);
  r.separator();
  r.rowText(`单号: ${data.orderNo}`, fmtDateTime(data.createdAt), r.sz.small);
  r.leftText(`操作人: ${data.operator}`, r.sz.small);
  r.separator();
  r.renderKitchenItems(data.items);
  r.gap(24);
}

function renderCancel(r: TicketRenderer, data: CancelData): void {
  if (data.storeName) r.centerText(data.storeName, r.sz.normal);
  r.invertedBanner('取消订单 / HỦY ĐƠN', r.sz.large);
  r.gap(8);
  if (data.tableCode) r.centerText(data.tableCode, r.sz.huge, true);
  r.separator();
  r.rowText(`单号: ${data.orderNo}`, fmtDateTime(data.createdAt), r.sz.small);
  r.leftText(`操作人: ${data.operator}`, r.sz.small);
  r.leftText(`原因: ${data.reason}`, r.sz.normal);
  r.gap(24);
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
  const storeName = data.storeName || data.storeNameZh || data.storeNameVi;
  if (storeName) r.centerText(storeName, r.sz.medium, true);
  if (data.address) r.centerText(data.address, r.sz.small);
  if (data.phone) r.centerText(data.phone, r.sz.small);
  r.invertedBanner('退款 / HOÀN TIỀN', r.sz.large);
  r.separator();
  if (data.tableCode) {
    const guests =
      data.guestCount != null && data.guestCount > 0 ? `${data.guestCount} 位` : '';
    r.rowText(`桌台: ${data.tableCode}`, guests, r.sz.small);
  }
  r.leftText(`单号: ${data.orderNo}`, r.sz.small);
  if (data.createdAt) r.leftText(`下单: ${fmtDateTime(data.createdAt)}`, r.sz.small);
  if (data.refundedAt) r.leftText(`退款: ${fmtDateTime(data.refundedAt)}`, r.sz.small);
  r.separator();
  if (data.refundAmount != null) {
    r.rowText('退款金额:', fmtVND(data.refundAmount), r.sz.medium, true);
  }
  if (data.refundMethod) r.rowText('退回方式:', data.refundMethod, r.sz.normal);
  if (data.refundReason) r.leftText(`原因: ${data.refundReason}`, r.sz.normal);
  r.separator();
  if (data.total != null) r.rowText('原账单:', fmtVND(data.total), r.sz.normal);
  if (data.refundedAmount != null) r.rowText('累计已退:', fmtVND(data.refundedAmount), r.sz.normal);
  if (data.paidAmount != null) r.rowText('剩余已付:', fmtVND(data.paidAmount), r.sz.normal);
  r.gap(16);
  const footer =
    data.footerZh || data.footerVi
      ? [data.footerZh, data.footerVi].filter(Boolean).join('  ')
      : '退款凭证请妥善保管';
  r.centerText(footer, r.sz.normal);
  r.gap(24);
}

function renderReceipt(r: TicketRenderer, data: ReceiptData): void {
  const storeName = data.storeName || data.storeNameZh || data.storeNameVi;
  if (storeName) r.centerText(storeName, r.sz.medium, true);
  if (data.address) r.centerText(data.address, r.sz.small);
  if (data.phone) r.centerText(data.phone, r.sz.small);
  r.centerText('收据 / HÓA ĐƠN', r.sz.large, true);
  r.separator();
  if (data.tableCode) {
    const guests =
      data.guestCount != null && data.guestCount > 0 ? `${data.guestCount} 位` : '';
    r.rowText(`桌台: ${data.tableCode}`, guests, r.sz.small);
  }
  r.leftText(`单号: ${data.orderNo}`, r.sz.small);
  r.leftText(`下单: ${fmtDateTime(data.createdAt)}`, r.sz.small);
  if (data.paidAt) r.leftText(`结账: ${fmtDateTime(data.paidAt)}`, r.sz.small);
  if (data.cashier) r.leftText(`收银: ${data.cashier}`, r.sz.small);
  r.separator();
  r.renderReceiptItems(data.items);
  r.separator();
  r.rowText('小计  Tạm tính:', fmtVND(data.subtotal), r.sz.normal);
  if (data.discount > 0) r.rowText('折扣  Giảm giá:', `-${fmtVND(data.discount)}`, r.sz.normal);
  if (data.serviceCharge > 0) r.rowText('服务费  Phí phục vụ:', fmtVND(data.serviceCharge), r.sz.normal);
  if (data.deliveryFee && data.deliveryFee > 0) r.rowText('配送费  Phí giao hàng:', fmtVND(data.deliveryFee), r.sz.normal);
  r.separator();
  r.rowText('合计  TỔNG CỘNG:', fmtVND(data.total), r.sz.medium, true);
  r.separator();
  if (data.payments?.length) {
    for (const p of data.payments) {
      r.rowText(`支付 ${p.method}:`, fmtVND(p.amount), r.sz.normal);
    }
  } else {
    r.rowText(`支付 ${data.paymentMethod || ''}:`, fmtVND(data.paidAmount), r.sz.normal);
  }
  if (data.change > 0) r.rowText('找零  Tiền thừa:', fmtVND(data.change), r.sz.normal);
  r.gap(16);
  const footer =
    data.footerZh || data.footerVi
      ? [data.footerZh, data.footerVi].filter(Boolean).join('  ')
      : '谢谢惠顾  Cảm ơn quý khách!';
  r.centerText(footer, r.sz.normal);
  r.gap(24);
}

function renderDelivery(r: TicketRenderer, data: DeliveryData): void {
  if (data.storeName) r.centerText(data.storeName, r.sz.medium, true);
  r.invertedBanner('外卖 / GIAO HÀNG', r.sz.large);
  r.separator();
  r.rowText(`单号: ${data.orderNo}`, fmtDateTime(data.createdAt), r.sz.small);
  r.leftText(`客户: ${data.customer}  ${data.phone}`, r.sz.normal);
  r.leftText(`地址: ${data.address}`, r.sz.normal);
  if (data.remark) r.leftText(`备注: ${data.remark}`, r.sz.small);
  r.separator();
  r.renderReceiptItems(data.items);
  r.separator();
  r.rowText('小计:', fmtVND(data.subtotal), r.sz.normal);
  r.rowText('配送费:', fmtVND(data.deliveryFee), r.sz.normal);
  r.rowText('合计  TỔNG:', fmtVND(data.total), r.sz.medium, true);
  r.gap(24);
}

function renderShift(r: TicketRenderer, data: ShiftData): void {
  if (data.storeName) r.centerText(data.storeName, r.sz.medium, true);
  r.centerText('交班报表 / TỔNG KẾT CA', r.sz.large, true);
  r.separator();
  r.rowText('日期:', data.date, r.sz.normal);
  r.rowText('收银员:', data.cashier, r.sz.normal);
  if (data.openCash !== undefined) r.rowText('开始现金:', fmtVND(data.openCash), r.sz.normal);
  r.separator();
  r.leftText('支付明细:', r.sz.normal, true);
  for (const b of data.breakdown) {
    r.rowText(`  ${b.method}:`, fmtVND(b.amount), r.sz.normal);
  }
  r.separator();
  r.rowText('总订单数:', String(data.totalOrders), r.sz.normal);
  r.rowText('总营业额:', fmtVND(data.totalAmount), r.sz.medium, true);
  if (data.closeCash !== undefined) r.rowText('结束现金:', fmtVND(data.closeCash), r.sz.normal);
  r.gap(24);
}

function renderTest(r: TicketRenderer, data: TestData, agentIdFallback: string): void {
  r.centerText('===== 测试打印 =====', r.sz.normal, true);
  r.centerText('PRINT TEST', r.sz.large, true);
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
