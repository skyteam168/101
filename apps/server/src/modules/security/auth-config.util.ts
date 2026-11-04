const WEAK_JWT_SECRETS = new Set([
  'change-me-in-production',
  'dev-secret-change-me',
  'secret',
  'jwt_secret',
  'jwt-secret',
]);

/** 过滤未替换的占位符，避免前端误判「已启用」却渲染失败 */
export function isConfiguredSecret(value: string | undefined | null): boolean {
  const v = (value ?? '').trim();
  if (!v) return false;
  const lower = v.toLowerCase();
  if (
    lower.includes('your-') ||
    lower.includes('xxxxxx') ||
    lower.includes('changeme') ||
    lower.includes('change-me') ||
    lower.includes('placeholder') ||
    v.includes('你的') ||
    v === 'secret'
  ) {
    return false;
  }
  return true;
}

/** 生产环境 JWT：足够长且非占位符 */
export function isStrongJwtSecret(value: string | undefined | null): boolean {
  const v = (value ?? '').trim();
  if (v.length < 32) return false;
  if (WEAK_JWT_SECRETS.has(v.toLowerCase())) return false;
  return isConfiguredSecret(v);
}

/**
 * 生产启动校验。失败抛错阻止进程起来。
 * development / test 仅打警告。
 */
export function assertProductionRuntimeConfig(env: {
  nodeEnv?: string;
  jwtSecret?: string;
  turnstileSiteKey?: string;
  turnstileSecret?: string;
  smtpHost?: string;
}): void {
  const isProd = (env.nodeEnv || '').toLowerCase() === 'production';
  const jwtOk = isStrongJwtSecret(env.jwtSecret);
  if (!jwtOk) {
    const msg =
      'JWT_SECRET 过弱或为占位符（生产要求 ≥32 位随机串，禁止 change-me / dev-secret）';
    if (isProd) throw new Error(msg);
    // eslint-disable-next-line no-console
    console.warn(`[security] ${msg}`);
  }

  if (!isProd) return;

  if (!isConfiguredSecret(env.turnstileSiteKey) || !isConfiguredSecret(env.turnstileSecret)) {
    throw new Error(
      '生产环境必须配置 CF_TURNSTILE_SITE_KEY 与 CF_TURNSTILE_SECRET_KEY（防机器人）',
    );
  }
  if (!(env.smtpHost || '').trim()) {
    // 门店设置里也可配 SMTP；此处仅警告，真正发信时生产无 transporter 会 EMAIL_NOT_CONFIGURED
    // eslint-disable-next-line no-console
    console.warn(
      '[security] 未配置 SMTP_HOST：请确认后台门店 SMTP 已启用，否则验证码无法发送',
    );
  }
}

export function isConfiguredGoogleClientId(value: string | undefined | null): boolean {
  const v = (value ?? '').trim();
  if (!isConfiguredSecret(v)) return false;
  return v.endsWith('.apps.googleusercontent.com');
}
