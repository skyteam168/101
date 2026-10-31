import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessError } from '../../common/errors/business.error';
import { isConfiguredSecret } from './auth-config.util';

type SiteverifyResponse = {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
};

@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);

  constructor(private readonly config: ConfigService) {}

  private secret(): string {
    return (this.config.get<string>('CF_TURNSTILE_SECRET_KEY') ?? '').trim();
  }

  private siteKey(): string {
    return (this.config.get<string>('CF_TURNSTILE_SITE_KEY') ?? '').trim();
  }

  /** 未配置有效密钥时跳过校验（本地开发）；生产务必配置真实 key */
  isEnabled(): boolean {
    return isConfiguredSecret(this.secret()) && isConfiguredSecret(this.siteKey());
  }

  async assertValid(token: string | undefined | null, remoteIp?: string | null): Promise<void> {
    if (!this.isEnabled()) {
      this.logger.debug('Turnstile skipped (CF_TURNSTILE_SECRET_KEY empty)');
      return;
    }
    if (!token || !token.trim()) {
      throw new BusinessError('TURNSTILE_REQUIRED');
    }

    const body = new URLSearchParams();
    body.set('secret', this.secret());
    body.set('response', token.trim());
    if (remoteIp) body.set('remoteip', remoteIp);

    let data: SiteverifyResponse;
    try {
      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      data = (await res.json()) as SiteverifyResponse;
    } catch (err) {
      this.logger.error(`Turnstile siteverify network error: ${(err as Error).message}`);
      throw new BusinessError('TURNSTILE_FAILED');
    }

    if (!data.success) {
      this.logger.warn(
        `Turnstile failed ip=${remoteIp ?? '-'} codes=${(data['error-codes'] || []).join(',')}`,
      );
      throw new BusinessError('TURNSTILE_FAILED');
    }

    this.logger.log(
      `Turnstile ok ip=${remoteIp ?? '-'} host=${data.hostname ?? '-'} action=${data.action ?? '-'}`,
    );
  }
}
