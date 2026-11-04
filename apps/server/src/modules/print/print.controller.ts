import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePerm } from '../../common/decorators/require-perm.decorator';
import { BusinessError } from '../../common/errors/business.error';
import { AuthUser } from '../auth/auth.types';
import {
  CreateAgentDto,
  CreatePrinterDto,
  CreateStationDto,
  JobQueryDto,
  PrintRefundTicketDto,
  ReprintDto,
  ShiftPrintDto,
  UpdateAgentDto,
  UpdatePrinterDto,
  UpdateStationDto,
} from './dto/print.dto';
import { PrintJobService } from './print-job.service';
import { PrintService } from './print.service';

@ApiTags('print')
@ApiBearerAuth()
@Controller('print')
export class PrintController {
  constructor(
    private readonly print: PrintService,
    private readonly jobs: PrintJobService,
  ) {}

  private storeId(user: AuthUser) {
    if (!user.storeId) throw new BusinessError('STORE_REQUIRED');
    return user.storeId;
  }

  // —— 档口 ——
  @Get('stations')
  @RequirePerm('menu:print')
  listStations(@CurrentUser() user: AuthUser) {
    return this.print.listStations(this.storeId(user));
  }

  @Post('stations')
  @RequirePerm('menu:print')
  createStation(@CurrentUser() user: AuthUser, @Body() dto: CreateStationDto) {
    return this.print.createStation(this.storeId(user), dto);
  }

  @Patch('stations/:id')
  @RequirePerm('menu:print')
  updateStation(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateStationDto,
  ) {
    return this.print.updateStation(this.storeId(user), id, dto);
  }

  @Delete('stations/:id')
  @RequirePerm('menu:print')
  deleteStation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.print.deleteStation(this.storeId(user), id);
  }

  // —— 打印机 ——
  @Get('printers')
  @RequirePerm('menu:print')
  listPrinters(@CurrentUser() user: AuthUser) {
    return this.print.listPrinters(this.storeId(user));
  }

  @Post('printers')
  @RequirePerm('menu:print')
  createPrinter(@CurrentUser() user: AuthUser, @Body() dto: CreatePrinterDto) {
    return this.print.createPrinter(this.storeId(user), dto);
  }

  @Patch('printers/:id')
  @RequirePerm('menu:print')
  updatePrinter(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePrinterDto,
  ) {
    return this.print.updatePrinter(this.storeId(user), id, dto);
  }

  @Delete('printers/:id')
  @RequirePerm('menu:print')
  deletePrinter(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.print.deletePrinter(this.storeId(user), id);
  }

  // —— 代理 ——
  @Get('agents')
  @RequirePerm('menu:print')
  listAgents(@CurrentUser() user: AuthUser) {
    return this.print.listAgents(this.storeId(user));
  }

  @Post('agents')
  @RequirePerm('menu:print')
  createAgent(@CurrentUser() user: AuthUser, @Body() dto: CreateAgentDto) {
    return this.print.createAgent(this.storeId(user), dto);
  }

  @Patch('agents/:id')
  @RequirePerm('menu:print')
  updateAgent(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAgentDto,
  ) {
    return this.print.updateAgent(this.storeId(user), id, dto);
  }

  @Post('agents/:id/regenerate-secret')
  @RequirePerm('menu:print')
  regenSecret(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.print.regenerateSecret(this.storeId(user), id);
  }

  @Delete('agents/:id')
  @RequirePerm('menu:print')
  deleteAgent(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.print.deleteAgent(this.storeId(user), id);
  }

  // —— 任务 ——
  @Get('jobs')
  @RequirePerm('menu:print')
  listJobs(@CurrentUser() user: AuthUser, @Query() query: JobQueryDto) {
    return this.jobs.listJobs(this.storeId(user), query);
  }

  @Post('jobs/:id/reprint')
  @RequirePerm('print:reprint')
  reprint(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReprintDto,
  ) {
    return this.jobs.reprint(this.storeId(user), id, dto.printerId);
  }

  /** 按订单退款记录出退款小票（重打） */
  @Post('orders/:orderId/refund-ticket')
  @RequirePerm('order:refund')
  printRefundTicket(
    @CurrentUser() user: AuthUser,
    @Param('orderId') orderId: string,
    @Body() dto: PrintRefundTicketDto,
  ) {
    return this.jobs.printRefundByOrder(this.storeId(user), orderId, dto.refundId);
  }

  @Post('shift')
  @RequirePerm('menu:print')
  printShift(@CurrentUser() user: AuthUser, @Body() dto: ShiftPrintDto) {
    return this.jobs.printShift(this.storeId(user), {
      cashierName: dto.cashierName || user.username,
      from: dto.from,
      to: dto.to,
    });
  }
}
