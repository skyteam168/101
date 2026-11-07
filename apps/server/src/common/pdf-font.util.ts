import * as fs from 'fs';
import * as path from 'path';
import type PDFDocument from 'pdfkit';

/**
 * PDFKit 默认 Helvetica 不支持中文/越南文，需注册含 CJK 的字体。
 * 注意：多数 pdfkit 版本不支持 .ttc（createSubset is not a function）。
 */
export function resolvePdfFontCandidates(): string[] {
  const list = [
    path.resolve(process.cwd(), 'assets/fonts/NotoSansSC-Regular.otf'),
    path.resolve(process.cwd(), '../print-agent/assets/fonts/NotoSansSC-Regular.otf'),
    path.resolve(__dirname, '../../assets/fonts/NotoSansSC-Regular.otf'),
    path.resolve(__dirname, '../../../print-agent/assets/fonts/NotoSansSC-Regular.otf'),
    'C:\\Windows\\Fonts\\Noto Sans SC (TrueType).otf',
    'C:\\Windows\\Fonts\\NotoSansSC-Regular.otf',
    'C:\\Windows\\Fonts\\simhei.ttf',
    'C:\\Windows\\Fonts\\simkai.ttf',
    'C:\\Windows\\Fonts\\arialuni.ttf',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
  ];
  return list.filter((f, i, arr) => arr.indexOf(f) === i && fs.existsSync(f));
}

/** 注册并切到 CJK 字体，成功返回字体名；失败返回 null（将回退 Helvetica） */
export function registerPdfCjkFont(
  doc: InstanceType<typeof PDFDocument>,
  fontName = 'CjkFont',
): string | null {
  for (const fontFile of resolvePdfFontCandidates()) {
    try {
      if (/\.ttc$/i.test(fontFile)) continue;
      doc.registerFont(fontName, fontFile);
      doc.font(fontName);
      return fontName;
    } catch {
      /* 试下一个 */
    }
  }
  return null;
}
