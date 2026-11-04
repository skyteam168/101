import {
  assertProductionRuntimeConfig,
  isConfiguredSecret,
  isStrongJwtSecret,
} from './auth-config.util';

describe('auth-config.util', () => {
  it('rejects placeholder secrets', () => {
    expect(isConfiguredSecret('change-me-in-production')).toBe(false);
    expect(isConfiguredSecret('dev-secret-change-me')).toBe(false);
    expect(isConfiguredSecret('ok-random-value-here')).toBe(true);
  });

  it('requires strong jwt length', () => {
    expect(isStrongJwtSecret('short')).toBe(false);
    expect(isStrongJwtSecret('change-me-in-production')).toBe(false);
    expect(isStrongJwtSecret('a'.repeat(32))).toBe(true);
  });

  it('blocks production boot without turnstile', () => {
    expect(() =>
      assertProductionRuntimeConfig({
        nodeEnv: 'production',
        jwtSecret: 'a'.repeat(32),
        turnstileSiteKey: '',
        turnstileSecret: '',
      }),
    ).toThrow(/TURNSTILE/);
  });

  it('allows production boot with strong jwt + turnstile', () => {
    expect(() =>
      assertProductionRuntimeConfig({
        nodeEnv: 'production',
        jwtSecret: 'a'.repeat(32),
        turnstileSiteKey: '0x4AAAAAArealSiteKeyValue',
        turnstileSecret: '0x4AAAAAArealSecretValue',
        smtpHost: '',
      }),
    ).not.toThrow();
  });
});
