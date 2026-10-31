/** 密码最短长度 */
export const PASSWORD_MIN_LENGTH = 8;
/** 密码最长长度（防超长 DoS） */
export const PASSWORD_MAX_LENGTH = 64;

/**
 * 复杂度：8–64 位，至少含 1 个字母与 1 个数字。
 * 示例：Admin@123、Cashier@123、hello1234
 */
export const PASSWORD_COMPLEXITY_REGEX =
  /^(?=.*[A-Za-z])(?=.*\d)[\x21-\x7E]{8,64}$/;

export function isPasswordComplex(password: string): boolean {
  return PASSWORD_COMPLEXITY_REGEX.test(password);
}
