import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePerm } from '../../common/decorators/require-perm.decorator';
import { BusinessError } from '../../common/errors/business.error';
import { AuthUser } from '../auth/auth.types';
import {
  AdjustBalanceDto,
  AdjustPointsDto,
  CreateMemberLevelDto,
  MemberQueryDto,
  UpdateMemberDto,
  UpdateMemberLevelDto,
} from './dto/member.dto';
import { MemberService } from './member.service';

@ApiTags('members')
@ApiBearerAuth()
@Controller('members')
export class MemberController {
  constructor(private readonly members: MemberService) {}

  private storeId(user: AuthUser) {
    if (!user.storeId) throw new BusinessError('STORE_REQUIRED');
    return user.storeId;
  }

  @Get('levels')
  @RequirePerm('menu:member')
  levels(@CurrentUser() user: AuthUser) {
    return this.members.listLevels(this.storeId(user));
  }

  @Post('levels')
  @RequirePerm('member:edit')
  createLevel(@CurrentUser() user: AuthUser, @Body() dto: CreateMemberLevelDto) {
    return this.members.createLevel(this.storeId(user), dto);
  }

  @Patch('levels/:id')
  @RequirePerm('member:edit')
  updateLevel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateMemberLevelDto,
  ) {
    return this.members.updateLevel(this.storeId(user), id, dto);
  }

  @Get()
  @RequirePerm('menu:member')
  list(@CurrentUser() user: AuthUser, @Query() query: MemberQueryDto) {
    return this.members.listMembers(this.storeId(user), query);
  }

  @Get('search')
  @RequirePerm('menu:member')
  search(@CurrentUser() user: AuthUser, @Query('keyword') keyword?: string) {
    return this.members.searchActive(this.storeId(user), keyword);
  }

  @Get(':id')
  @RequirePerm('menu:member')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.members.getMember(this.storeId(user), id);
  }

  @Patch(':id')
  @RequirePerm('member:edit')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.members.updateMember(this.storeId(user), id, dto);
  }

  @Put(':id/status')
  @RequirePerm('member:edit')
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body('status') status: 'active' | 'banned',
  ) {
    return this.members.setStatus(this.storeId(user), id, status, user.id);
  }

  @Post(':id/soft-delete')
  @RequirePerm('member:edit')
  softDelete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.members.softDelete(this.storeId(user), id, user.id);
  }

  @Post(':id/points')
  @RequirePerm('member:edit')
  points(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AdjustPointsDto) {
    return this.members.adjustPoints(this.storeId(user), id, user.id, dto);
  }

  @Post(':id/balance')
  @RequirePerm('member:edit')
  balance(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AdjustBalanceDto) {
    return this.members.adjustBalance(this.storeId(user), id, user.id, dto);
  }

  @Post(':id/birthday-bonus')
  @RequirePerm('member:edit')
  birthday(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.members.grantBirthdayBonus(this.storeId(user), id, user.id);
  }

  /** 生日到店赠菜已由门店安排 */
  @Post(':id/birthday-gift')
  @RequirePerm('member:edit')
  redeemGift(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.members.redeemBirthdayGift(this.storeId(user), id);
  }
}
