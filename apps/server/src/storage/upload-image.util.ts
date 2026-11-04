import { extname } from 'path';
import { BusinessError } from '../common/errors/business.error';

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const ALLOWED_AUDIO_MIME = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/ogg',
  'audio/webm',
]);

const MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/wave': '.wav',
  'audio/mp4': '.m4a',
  'audio/m4a': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/aac': '.aac',
  'audio/ogg': '.ogg',
  'audio/webm': '.webm',
};

/** 仅允许常见位图；禁止 svg/html 等可执行内容 */
export function assertAllowedImageUpload(file: Express.Multer.File): void {
  const mime = (file.mimetype || '').toLowerCase();
  if (!ALLOWED_IMAGE_MIME.has(mime)) {
    throw new BusinessError('UPLOAD_FILE_TYPE_INVALID');
  }
  const ext = extname(file.originalname || '').toLowerCase();
  if (ext === '.svg' || ext === '.html' || ext === '.htm' || ext === '.xhtml') {
    throw new BusinessError('UPLOAD_FILE_TYPE_INVALID');
  }
}

/** 图片 + 播报语音（门店设置 announce clips） */
export function assertAllowedMediaUpload(file: Express.Multer.File): void {
  const mime = (file.mimetype || '').toLowerCase();
  if (ALLOWED_IMAGE_MIME.has(mime) || ALLOWED_AUDIO_MIME.has(mime)) {
    const ext = extname(file.originalname || '').toLowerCase();
    if (ext === '.svg' || ext === '.html' || ext === '.htm' || ext === '.xhtml') {
      throw new BusinessError('UPLOAD_FILE_TYPE_INVALID');
    }
    return;
  }
  throw new BusinessError('UPLOAD_FILE_TYPE_INVALID');
}

export function safeImageExt(file: Express.Multer.File): string {
  return safeMediaExt(file);
}

export function safeMediaExt(file: Express.Multer.File): string {
  const mime = (file.mimetype || '').toLowerCase();
  if (MIME_EXT[mime]) return MIME_EXT[mime];
  const ext = extname(file.originalname || '').toLowerCase();
  if (ext && /^\.(jpg|jpeg|png|webp|gif|mp3|wav|m4a|aac|ogg|webm)$/.test(ext)) {
    return ext === '.jpeg' ? '.jpg' : ext;
  }
  return '.bin';
}
