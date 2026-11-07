import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePerm } from '../../common/decorators/require-perm.decorator';
import { BusinessError } from '../../common/errors/business.error';
import { AuthUser } from '../auth/auth.types';
import {
  CapitalEntryQueryDto,
  CreateCapitalEntryDto,
  CreateOpsExpenseDto,
  CreatePartnerDto,
  CreateSettlementDto,
  OpsExpenseQueryDto,
  PartnerQueryDto,
  SettlementQueryDto,
  UpdateCapitalEntryDto,
  UpdateOpsExpenseDto,
  UpdatePartnerDto,
  UpdateSettlementDto,
} from './dto/finance.dto';
import { FinanceService } from './finance.service';

@ApiTags('finance')
@ApiBearerAuth()
@Controller('finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  private storeId(user: AuthUser): string {
    if (!user.storeId) throw new BusinessError('STORE_REQUIRED');
    return user.storeId;
  }

  // ---- ops expenses ----

  @Get('expenses')
  @RequirePerm('menu:finance')
  listExpenses(@CurrentUser() user: AuthUser, @Query() query: OpsExpenseQueryDto) {
    return this.finance.listExpenses(this.storeId(user), query);
  }

  @Post('expenses')
  @RequirePerm('menu:finance')
  createExpense(@CurrentUser() user: AuthUser, @Body() dto: CreateOpsExpenseDto) {
    return this.finance.createExpense(this.storeId(user), dto);
  }

  @Patch('expenses/:id')
  @RequirePerm('menu:finance')
  updateExpense(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateOpsExpenseDto,
  ) {
    return this.finance.updateExpense(this.storeId(user), id, dto);
  }

  @Delete('expenses/:id')
  @RequirePerm('menu:finance')
  deleteExpense(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.finance.deleteExpense(this.storeId(user), id);
  }

  // ---- partners ----

  @Get('partners')
  @RequirePerm('menu:finance')
  listPartners(@CurrentUser() user: AuthUser, @Query() query: PartnerQueryDto) {
    return this.finance.listPartnersWithRoi(this.storeId(user), query);
  }

  @Get('partners/:id/ledger')
  @RequirePerm('menu:finance')
  partnerLedger(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.finance.partnerLedger(this.storeId(user), id);
  }

  @Post('partners')
  @RequirePerm('menu:finance')
  createPartner(@CurrentUser() user: AuthUser, @Body() dto: CreatePartnerDto) {
    return this.finance.createPartner(this.storeId(user), dto, user.id);
  }

  @Patch('partners/:id')
  @RequirePerm('menu:finance')
  updatePartner(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePartnerDto,
  ) {
    return this.finance.updatePartner(this.storeId(user), id, dto);
  }

  @Delete('partners/:id')
  @RequirePerm('menu:finance')
  deletePartner(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.finance.deletePartner(this.storeId(user), id);
  }

  // ---- capital entries ----

  @Get('capital-entries')
  @RequirePerm('menu:finance')
  listCapitalEntries(
    @CurrentUser() user: AuthUser,
    @Query() query: CapitalEntryQueryDto,
  ) {
    return this.finance.listCapitalEntries(this.storeId(user), query);
  }

  @Get('capital-recon')
  @RequirePerm('menu:finance')
  capitalRecon(@CurrentUser() user: AuthUser) {
    return this.finance.capitalRecon(this.storeId(user));
  }

  @Post('capital-entries')
  @RequirePerm('menu:finance')
  createCapitalEntry(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCapitalEntryDto,
  ) {
    return this.finance.createCapitalEntry(this.storeId(user), dto, user.id);
  }

  @Patch('capital-entries/:id')
  @RequirePerm('menu:finance')
  updateCapitalEntry(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCapitalEntryDto,
  ) {
    return this.finance.updateCapitalEntry(this.storeId(user), id, dto);
  }

  @Delete('capital-entries/:id')
  @RequirePerm('menu:finance')
  deleteCapitalEntry(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.finance.deleteCapitalEntry(this.storeId(user), id);
  }

  // ---- settlements ----

  @Get('settlements')
  @RequirePerm('menu:finance')
  listSettlements(@CurrentUser() user: AuthUser, @Query() query: SettlementQueryDto) {
    return this.finance.listSettlements(this.storeId(user), query);
  }

  @Post('settlements')
  @RequirePerm('menu:finance')
  createSettlement(@CurrentUser() user: AuthUser, @Body() dto: CreateSettlementDto) {
    return this.finance.createSettlement(this.storeId(user), dto);
  }

  @Patch('settlements/:id')
  @RequirePerm('menu:finance')
  updateSettlement(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSettlementDto,
  ) {
    return this.finance.updateSettlement(this.storeId(user), id, dto);
  }

  @Delete('settlements/:id')
  @RequirePerm('menu:finance')
  deleteSettlement(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.finance.deleteSettlement(this.storeId(user), id);
  }
}
