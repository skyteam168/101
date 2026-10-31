import { Global, Module } from '@nestjs/common';
import { SecurityModule } from '../security/security.module';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { LoginLogService } from './login-log.service';

@Global()
@Module({
  imports: [SecurityModule],
  controllers: [AuditController],
  providers: [AuditService, LoginLogService],
  exports: [AuditService, LoginLogService],
})
export class AuditModule {}
