import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePerm } from '../../common/decorators/require-perm.decorator';
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

  @Get('login-logs')
  @RequirePerm('audit:view')
  listLoginLogs(@Query() query: LoginLogQueryDto) {
    return this.loginLogs.list(query);
  }

  @Get('customer-login-logs')
  @RequirePerm('audit:view')
  listCustomerLoginLogs(@Query() query: CustomerLoginLogQueryDto) {
    return this.customerLoginLogs.list(query);
  }

  @Get('operation-logs')
  @RequirePerm('audit:view')
  listOperationLogs(@Query() query: OperationLogQueryDto) {
    return this.audit.listOperationLogs(query);
  }
}
