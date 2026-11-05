import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePerm } from '../../common/decorators/require-perm.decorator';
import { BusinessError } from '../../common/errors/business.error';
import { AuthUser } from '../auth/auth.types';
import { CustomerLoginLogService } from '../security/customer-login-log.service';
import { AuditService } from './audit.service';
import {
  CustomerLoginLogQueryDto,
  LoginLogQueryDto,
  OperationLogQueryDto,
} from './dto/audit-query.dto';
import { LoginLogService } from './login-log.service';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(
    private readonly loginLogs: LoginLogService,
    private readonly customerLoginLogs: CustomerLoginLogService,
    private readonly audit: AuditService,
  ) {}

  private scopedStoreId(user: AuthUser): string | undefined {
    if (user.isSuperAdmin) return undefined;
    if (!user.storeId) throw new BusinessError('STORE_REQUIRED');
    return user.storeId;
  }

  @Get('login-logs')
  @RequirePerm('audit:view')
  listLoginLogs(@CurrentUser() user: AuthUser, @Query() query: LoginLogQueryDto) {
    return this.loginLogs.list({ ...query, storeId: this.scopedStoreId(user) });
  }

  @Get('customer-login-logs')
  @RequirePerm('audit:view')
  listCustomerLoginLogs(@CurrentUser() user: AuthUser, @Query() query: CustomerLoginLogQueryDto) {
    return this.customerLoginLogs.list({ ...query, storeId: this.scopedStoreId(user) });
  }

  @Get('operation-logs')
  @RequirePerm('audit:view')
  listOperationLogs(@CurrentUser() user: AuthUser, @Query() query: OperationLogQueryDto) {
    return this.audit.listOperationLogs({
      ...query,
      storeId: this.scopedStoreId(user),
    });
  }
}
