import { isSafeExternalHttpUrl, isSafeMediaUrl } from '@restaurant/shared';
import { BusinessError } from './errors/business.error';

export function assertSafeMediaUrl(url: string): void {
  if (!isSafeMediaUrl(url)) {
    throw new BusinessError('UNSAFE_URL');
  }
}

export function assertSafeExternalHttpUrl(url: string): void {
  if (!isSafeExternalHttpUrl(url)) {
    throw new BusinessError('UNSAFE_URL');
  }
}

/** 去掉控制字符，降低注入噪音（文本仍按纯文本渲染） */
export function sanitizePlainText(input: string, maxLen = 4000): string {
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLen);
}
