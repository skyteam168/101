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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePerm } from '../../common/decorators/require-perm.decorator';
import { BusinessError } from '../../common/errors/business.error';
import { AuthUser } from '../auth/auth.types';
import {
  CancelReservationDto,
  CreateReservationDto,
  ReservationQueryDto,
  SeatReservationDto,
  UpdateReservationDto,
} from './dto/reservation.dto';
import { ReservationService } from './reservation.service';

@ApiTags('reservation')
@ApiBearerAuth()
@Controller('reservations')
export class ReservationController {
  constructor(private readonly reservationService: ReservationService) {}

  private storeId(user: AuthUser): string {
    if (!user.storeId) throw new BusinessError('STORE_REQUIRED');
    return user.storeId;
  }

  /** 预定列表（支持按日期/状态/关键词筛选） */
  @Get()
  @RequirePerm('reservation:view')
  list(@CurrentUser() user: AuthUser, @Query() query: ReservationQueryDto) {
    return this.reservationService.list(this.storeId(user), query);
  }

  /** 待确认预定数量（菜单角标） */
  @Get('pending-count')
  @RequirePerm('reservation:view')
  async pendingCount(@CurrentUser() user: AuthUser) {
    const count = await this.reservationService.countPending(this.storeId(user));
    return { count };
  }

  /** 预定详情 */
  @Get(':id')
  @RequirePerm('reservation:view')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reservationService.findById(this.storeId(user), id);
  }

  /** 新建预定 */
  @Post()
  @RequirePerm('reservation:edit')
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateReservationDto,
  ) {
    return this.reservationService.create(this.storeId(user), dto, user.id);
  }

  /** 修改预定（仅 pending/confirmed 状态可改） */
  @Patch(':id')
  @RequirePerm('reservation:edit')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateReservationDto,
  ) {
    return this.reservationService.update(this.storeId(user), id, dto);
  }

  /** 删除预定（seated 状态不可删） */
  @Delete(':id')
  @RequirePerm('reservation:edit')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reservationService.delete(this.storeId(user), id);
  }

  /** 确认预定（pending → confirmed） */
  @Post(':id/confirm')
  @RequirePerm('reservation:edit')
  @ApiOperation({ summary: '确认预定' })
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reservationService.confirm(this.storeId(user), id);
  }

  /** 取消预定 */
  @Post(':id/cancel')
  @RequirePerm('reservation:edit')
  @ApiOperation({ summary: '取消预定' })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CancelReservationDto,
  ) {
    return this.reservationService.cancel(this.storeId(user), id, dto);
  }

  /** 标记未到 */
  @Post(':id/no-show')
  @RequirePerm('reservation:edit')
  @ApiOperation({ summary: '标记未到' })
  noShow(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reservationService.noShow(this.storeId(user), id);
  }

  /**
   * 顾客入座：
   * - 若指定 tableId，自动开台并创建 TableSession
   * - 预定状态变为 seated，写入 seatedSessionId
   */
  @Post(':id/seat')
  @RequirePerm('reservation:edit')
  @ApiOperation({ summary: '顾客入座' })
  seat(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SeatReservationDto,
  ) {
    return this.reservationService.seat(this.storeId(user), id, dto, user.id);
  }
}
