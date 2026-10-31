import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import {
  isConfiguredGoogleClientId,
  isConfiguredSecret,
} from './auth-config.util';
import { TurnstileService } from './turnstile.service';

@ApiTags('security')
@Controller('public/security')
export class SecurityController {
  constructor(
    private readonly config: ConfigService,
    private readonly turnstile: TurnstileService,
  ) {}

  private turnstileKeys() {
    const siteKey = (this.config.get<string>('CF_TURNSTILE_SITE_KEY') ?? '').trim();
    const secretOk = isConfiguredSecret(this.config.get<string>('CF_TURNSTILE_SECRET_KEY'));
    const siteOk = isConfiguredSecret(siteKey);
    return {
      enabled: secretOk && siteOk,
      siteKey: secretOk && siteOk ? siteKey : null,
    };
  }

  /** H5 拉取 Turnstile 站点配置（仅 site key，无 secret） */
  @Public()
  @Get('turnstile')
  turnstileConfig() {
    return this.turnstileKeys();
  }

  /** H5 认证提供方配置（Turnstile + Google GIS） */
  @Public()
  @Get('auth-config')
  authConfig() {
    const googleClientId = (this.config.get<string>('GOOGLE_CLIENT_ID') ?? '').trim();
    const googleOk = isConfiguredGoogleClientId(googleClientId);
    return {
      turnstile: this.turnstileKeys(),
      google: {
        enabled: googleOk,
        clientId: googleOk ? googleClientId : null,
      },
    };
  }
}
