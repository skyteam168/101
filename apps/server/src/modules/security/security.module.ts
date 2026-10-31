import { Global, Module } from '@nestjs/common';
import { CustomerLoginLogService } from './customer-login-log.service';
import { LoginLockService } from './login-lock.service';
import { SecurityController } from './security.controller';
import { TurnstileService } from './turnstile.service';

@Global()
@Module({
  controllers: [SecurityController],
  providers: [TurnstileService, CustomerLoginLogService, LoginLockService],
  exports: [TurnstileService, CustomerLoginLogService, LoginLockService],
})
export class SecurityModule {}
