import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ComboService } from '../combo/combo.service';
import { CreateGroupMealInquiryDto } from './dto/group-meal.dto';
import { GroupMealService } from './group-meal.service';

@ApiTags('public-group-meal')
@Controller()
export class PublicGroupMealController {
  constructor(
    private readonly groupMeal: GroupMealService,
    private readonly comboService: ComboService,
  ) {}

  @Public()
  @Get('public/combos')
  listCombos(@Query('storeId') storeId?: string) {
    return this.comboService.listPublicGroupMeals(storeId || '1');
  }

  @Public()
  @Post('public/group-meal/inquiries')
  createInquiry(@Body() dto: CreateGroupMealInquiryDto) {
    return this.groupMeal.createInquiry(dto);
  }
}
