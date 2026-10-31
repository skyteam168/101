import { extname } from 'path';
import { BusinessError } from '../common/errors/business.error';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

/** 仅允许常见位图；禁止 svg/html 等可执行内容 */
export function assertAllowedImageUpload(file: Express.Multer.File): void {
  const mime = (file.mimetype || '').toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    throw new BusinessError('UPLOAD_FILE_TYPE_INVALID');
  }
  const ext = extname(file.originalname || '').toLowerCase();
  if (ext === '.svg' || ext === '.html' || ext === '.htm' || ext === '.xhtml') {
    throw new BusinessError('UPLOAD_FILE_TYPE_INVALID');
  }
}

export function safeImageExt(file: Express.Multer.File): string {
  const mime = (file.mimetype || '').toLowerCase();
  return MIME_EXT[mime] || '.jpg';
}
