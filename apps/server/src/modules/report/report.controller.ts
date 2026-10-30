import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePerm } from '../../common/decorators/require-perm.decorator';
import { BusinessError } from '../../common/errors/business.error';
import { AuthUser } from '../auth/auth.types';
import {
  CloseShiftDto,
  DateRangeDto,
  OpenShiftDto,
  PrintShiftDto,
  ShiftQueryDto,
} from './dto/report.dto';
import { ReportService } from './report.service';

@ApiTags('report')
@ApiBearerAuth()
@Controller('reports')
export class ReportController {
  constructor(private readonly reports: ReportService) {}

  private storeId(user: AuthUser): string {
    if (!user.storeId) throw new BusinessError('STORE_REQUIRED');
    return user.storeId;
  }

  @Get('overview')
  @RequirePerm('report:view')
  overview(@CurrentUser() user: AuthUser, @Query() query: DateRangeDto) {
    return this.reports.overview(this.storeId(user), query);
  }

  @Get('trend')
  @RequirePerm('report:view')
  trend(@CurrentUser() user: AuthUser, @Query() query: DateRangeDto) {
    return this.reports.trend(this.storeId(user), query);
  }

  @Get('daily')
  @RequirePerm('report:view')
  daily(@CurrentUser() user: AuthUser, @Query() query: DateRangeDto) {
    return this.reports.dailyReport(this.storeId(user), query);
  }

  @Get('month')
  @RequirePerm('report:view')
  month(@CurrentUser() user: AuthUser, @Query('month') month: string) {
    if (!month) throw new BusinessError('INVALID_DATE');
    return this.reports.monthReport(this.storeId(user), month);
  }

  @Get('export')
  @RequirePerm('report:view')
  async export(
    @CurrentUser() user: AuthUser,
    @Query() query: DateRangeDto,
    @Res() res: Response,
  ) {
    const buf = await this.reports.exportExcel(this.storeId(user), query);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="report.xlsx"');
    res.send(buf);
  }

  @Post('summaries/:date/rebuild')
  @RequirePerm('report:view')
  rebuild(@CurrentUser() user: AuthUser, @Param('date') date: string) {
    return this.reports.upsertDailySummary(this.storeId(user), date);
  }

  // ---- shifts ----

  @Get('shifts')
  @RequirePerm('report:view')
  shifts(@CurrentUser() user: AuthUser, @Query() query: ShiftQueryDto) {
    return this.reports.listShifts(this.storeId(user), query.cashierId, query.limit);
  }

  @Get('shifts/current')
  @RequirePerm('report:view')
  current(@CurrentUser() user: AuthUser) {
    return this.reports.currentShift(this.storeId(user), user.id);
  }

  @Post('shifts/open')
  @RequirePerm('report:view')
  open(@CurrentUser() user: AuthUser, @Body() dto: OpenShiftDto) {
    return this.reports.openShift(this.storeId(user), user.id, dto);
  }

  @Post('shifts/:id/close')
  @RequirePerm('report:view')
  close(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CloseShiftDto) {
    return this.reports.closeShift(this.storeId(user), id, user.id, dto);
  }

  @Post('shifts/print')
  @RequirePerm('report:view')
  print(@CurrentUser() user: AuthUser, @Body() dto: PrintShiftDto) {
    return this.reports.printShift(this.storeId(user), dto.shiftId);
  }
}
