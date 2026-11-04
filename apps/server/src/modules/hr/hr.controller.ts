import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePerm } from '../../common/decorators/require-perm.decorator';
import { BusinessError } from '../../common/errors/business.error';
import { AuthUser } from '../auth/auth.types';
import {
  AttendanceQueryDto,
  CreateAttendanceDto,
  CreateEmployeeDto,
  EmployeeQueryDto,
  RunPayrollDto,
  UpdateAttendanceDto,
  UpdateEmployeeDto,
} from './dto/hr.dto';
import { HrService } from './hr.service';

@ApiTags('hr')
@ApiBearerAuth()
@Controller('hr')
export class HrController {
  constructor(private readonly hr: HrService) {}

  private storeId(user: AuthUser): string {
    if (!user.storeId) throw new BusinessError('STORE_REQUIRED');
    return user.storeId;
  }

  @Get('employees')
  @RequirePerm('menu:hr')
  listEmployees(@CurrentUser() user: AuthUser, @Query() query: EmployeeQueryDto) {
    return this.hr.listEmployees(this.storeId(user), query);
  }

  @Post('employees')
  @RequirePerm('hr:edit')
  createEmployee(@CurrentUser() user: AuthUser, @Body() dto: CreateEmployeeDto) {
    return this.hr.createEmployee(this.storeId(user), dto, user.id);
  }

  @Patch('employees/:id')
  @RequirePerm('hr:edit')
  updateEmployee(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.hr.updateEmployee(this.storeId(user), id, dto, user.id);
  }

  @Get('attendance')
  @RequirePerm('menu:hr')
  listAttendance(@CurrentUser() user: AuthUser, @Query() query: AttendanceQueryDto) {
    return this.hr.listAttendance(this.storeId(user), query);
  }

  @Post('attendance')
  @RequirePerm('hr:edit')
  createAttendance(@CurrentUser() user: AuthUser, @Body() dto: CreateAttendanceDto) {
    return this.hr.createAttendance(this.storeId(user), dto, user.id);
  }

  @Patch('attendance/:id')
  @RequirePerm('hr:edit')
  updateAttendance(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAttendanceDto,
  ) {
    return this.hr.updateAttendance(this.storeId(user), id, dto, user.id);
  }

  @Delete('attendance/:id')
  @RequirePerm('hr:edit')
  deleteAttendance(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.hr.deleteAttendance(this.storeId(user), id, user.id);
  }

  @Get('payroll/:yearMonth')
  @RequirePerm('menu:hr')
  getPayroll(@CurrentUser() user: AuthUser, @Param('yearMonth') yearMonth: string) {
    return this.hr.getPayroll(this.storeId(user), yearMonth);
  }

  @Get('payroll/:yearMonth/preview')
  @RequirePerm('menu:hr')
  previewPayroll(@CurrentUser() user: AuthUser, @Param('yearMonth') yearMonth: string) {
    return this.hr.previewPayroll(this.storeId(user), yearMonth);
  }

  @Post('payroll/run')
  @RequirePerm('hr:payroll')
  runPayroll(@CurrentUser() user: AuthUser, @Body() dto: RunPayrollDto) {
    return this.hr.runPayroll(this.storeId(user), dto.yearMonth, user.id);
  }
}
