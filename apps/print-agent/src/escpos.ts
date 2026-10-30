/**
 * escpos.ts
 * 构建 ESC/POS 二进制指令。
 *
 * 关键指令：
 *   GS v 0  (1D 76 30)  — 光栅位图打印
 *   GS V    (1D 56)     — 切纸
 *   BEL / ESC B         — 蜂鸣
 */

// ─────────────────────────── 常量 ───────────────────────────

/** 初始化打印机 */
export const CMD_INIT = Buffer.from([0x1b, 0x40]);

/** 切纸：全切 */
export const CMD_CUT_FULL = Buffer.from([0x1d, 0x56, 0x00]);

/** 切纸：半切 */
export const CMD_CUT_PARTIAL = Buffer.from([0x1d, 0x56, 0x01]);

/** 进纸 n 行后全切 (GS V m n, m=65=0x41) */
export const CMD_FEED_AND_CUT = (lines: number): Buffer =>
  Buffer.from([0x1d, 0x56, 0x41, lines & 0xff]);

/** 蜂鸣：BEL 字符 */
export const CMD_BEL = Buffer.from([0x07]);

/** 蜂鸣：ESC B n t（n 次，每次 t*100ms） */
export const CMD_BEEP = (times: number, duration: number): Buffer =>
  Buffer.from([0x1b, 0x42, times & 0xff, duration & 0xff]);

/** 换行 */
export const CMD_LF = Buffer.from([0x0a]);

// ─────────────────────────── 光栅位图 ───────────────────────────

/**
 * 构建 GS v 0 光栅位图命令。
 *
 * @param bitmap   1-bit 位图，MSB first，每行 bytesPerRow 字节
 * @param width    像素宽度
 * @param height   像素高度（行数）
 * @param mode     0=普通, 1=宽×2, 2=高×2, 3=宽高各×2
 */
export function buildRasterCmd(bitmap: Buffer, width: number, height: number, mode = 0): Buffer {
  const bytesPerRow = Math.ceil(width / 8);

  // 验证数据长度
  const expected = bytesPerRow * height;
  if (bitmap.length < expected) {
    throw new Error(
      `位图数据长度不足: 期望 ${expected} 字节，实际 ${bitmap.length} 字节`,
    );
  }

  // GS v 0 m xL xH yL yH
  const header = Buffer.from([
    0x1d, 0x76, 0x30,
    mode & 0x03,
    bytesPerRow & 0xff,
    (bytesPerRow >> 8) & 0xff,
    height & 0xff,
    (height >> 8) & 0xff,
  ]);

  return Buffer.concat([header, bitmap.subarray(0, expected)]);
}

// ─────────────────────────── 完整打印缓冲区 ───────────────────────────

/**
 * 构建完整的 ESC/POS 打印缓冲区：
 *   INIT → 蜂鸣 → 位图 → 走纸 → 切纸
 */
export function buildPrintBuffer(
  bitmap: Buffer,
  width: number,
  height: number,
  opts: {
    beep?: boolean;
    /** 切纸前走纸行数，默认 6 */
    feedLines?: number;
    /** 是否全切，默认 true */
    fullCut?: boolean;
  } = {},
): Buffer {
  const { beep = true, feedLines = 6, fullCut = true } = opts;

  const parts: Buffer[] = [];

  // 初始化打印机
  parts.push(CMD_INIT);

  // 蜂鸣（厨房单常用）
  if (beep) {
    parts.push(CMD_BEL);
    parts.push(CMD_BEEP(2, 1)); // 蜂鸣 2 次，每次 100ms
  }

  // 光栅位图
  parts.push(buildRasterCmd(bitmap, width, height));

  // 走纸后切纸
  parts.push(CMD_FEED_AND_CUT(feedLines));
  if (fullCut) {
    parts.push(CMD_CUT_FULL);
  }

  return Buffer.concat(parts);
}
