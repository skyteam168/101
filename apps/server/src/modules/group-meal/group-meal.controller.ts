import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePerm } from '../../common/decorators/require-perm.decorator';
import { BusinessError } from '../../common/errors/business.error';
import { AuthUser } from '../auth/auth.types';
import { GroupMealInquiryQueryDto, UpdateGroupMealInquiryDto } from './dto/group-meal.dto';
import { GroupMealService } from './group-meal.service';

@ApiTags('group-meal')
@ApiBearerAuth()
@Controller('group-meal/inquiries')
export class GroupMealController {
  constructor(private readonly service: GroupMealService) {}

  private storeId(user: AuthUser): string {
    if (!user.storeId) throw new BusinessError('STORE_REQUIRED');
    return user.storeId;
  }

  @Get()
  @RequirePerm('group_meal:view')
  list(@CurrentUser() user: AuthUser, @Query() query: GroupMealInquiryQueryDto) {
    return this.service.list(this.storeId(user), query);
  }

  @Patch(':id')
  @RequirePerm('group_meal:edit')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateGroupMealInquiryDto,
  ) {
    return this.service.update(this.storeId(user), id, dto);
  }
}
