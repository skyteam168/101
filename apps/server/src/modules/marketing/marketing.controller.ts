import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePerm } from '../../common/decorators/require-perm.decorator';
import { BusinessError } from '../../common/errors/business.error';
import { AuthUser } from '../auth/auth.types';
import {
  CreateCouponTemplateDto,
  CreatePromoRuleDto,
  IssueCouponDto,
  UpdateCouponTemplateDto,
  UpdatePromoRuleDto,
} from './dto/marketing.dto';
import { MarketingService } from './marketing.service';

@ApiTags('marketing')
@ApiBearerAuth()
@Controller('marketing')
export class MarketingController {
  constructor(private readonly marketing: MarketingService) {}

  private storeId(user: AuthUser) {
    if (!user.storeId) throw new BusinessError('STORE_REQUIRED');
    return user.storeId;
  }

  @Get('templates')
  @RequirePerm('menu:marketing')
  templates(@CurrentUser() user: AuthUser) {
    return this.marketing.listTemplates(this.storeId(user));
  }

  @Post('templates')
  @RequirePerm('marketing:edit')
  createTemplate(@CurrentUser() user: AuthUser, @Body() dto: CreateCouponTemplateDto) {
    return this.marketing.createTemplate(this.storeId(user), dto);
  }

  @Patch('templates/:id')
  @RequirePerm('marketing:edit')
  updateTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCouponTemplateDto,
  ) {
    return this.marketing.updateTemplate(this.storeId(user), id, dto);
  }

  @Delete('templates/:id')
  @RequirePerm('marketing:edit')
  deleteTemplate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.marketing.deleteTemplate(this.storeId(user), id, user.id);
  }

  @Get('analytics')
  @RequirePerm('menu:marketing')
  analytics(@CurrentUser() user: AuthUser, @Query('days') days?: string) {
    const n = days ? Number(days) : 30;
    return this.marketing.couponAnalytics(this.storeId(user), Number.isFinite(n) ? n : 30);
  }

  @Post('coupons/issue')
  @RequirePerm('marketing:edit')
  issue(@CurrentUser() user: AuthUser, @Body() dto: IssueCouponDto) {
    return this.marketing.issueCoupons(this.storeId(user), user.id, dto);
  }

  @Get('coupons')
  @RequirePerm('menu:marketing')
  coupons(
    @CurrentUser() user: AuthUser,
    @Query('customerId') customerId?: string,
    @Query('templateId') templateId?: string,
    @Query('status') status?: string,
  ) {
    return this.marketing.listCoupons(this.storeId(user), { customerId, templateId, status });
  }

  @Get('rules')
  @RequirePerm('menu:marketing')
  rules(@CurrentUser() user: AuthUser) {
    return this.marketing.listRules(this.storeId(user));
  }

  @Post('rules')
  @RequirePerm('marketing:edit')
  createRule(@CurrentUser() user: AuthUser, @Body() dto: CreatePromoRuleDto) {
    return this.marketing.createRule(this.storeId(user), dto);
  }

  @Patch('rules/:id')
  @RequirePerm('marketing:edit')
  updateRule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePromoRuleDto,
  ) {
    return this.marketing.updateRule(this.storeId(user), id, dto);
  }

  @Delete('rules/:id')
  @RequirePerm('marketing:edit')
  deleteRule(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.marketing.deleteRule(this.storeId(user), id, user.id);
  }
}
