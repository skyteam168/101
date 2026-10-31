import { isPasswordComplex } from '@restaurant/shared';
import { BusinessError } from './errors/business.error';

/** 设密 / 改密时统一校验；登录口不调用（避免锁死历史弱密码账号） */
export function assertPasswordComplexity(password: string): void {
  if (!isPasswordComplex(password)) {
    throw new BusinessError('PASSWORD_TOO_WEAK');
  }
}
