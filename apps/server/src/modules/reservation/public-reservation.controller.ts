import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { resolvePublicStoreId } from '../../common/public-store.util';
import {
  CreateReservationDto,
  PublicCancelReservationDto,
  PublicReservationLookupQuery,
  PublicUpdateReservationDto,
} from './dto/reservation.dto';
import { ReservationService } from './reservation.service';

@ApiTags('public-reservation')
@Controller('public/reservations')
export class PublicReservationController {
  constructor(private readonly reservationService: ReservationService) {}

  /** H5 顾客自助预定（可带预点菜 items） */
  @Public()
  @Post()
  @ApiOperation({ summary: '公开预定（无需登录；可选预点菜）' })
  create(
    @Body() dto: CreateReservationDto,
    @Query('storeId') storeId?: string,
  ) {
    return this.reservationService.create(resolvePublicStoreId(storeId), dto, null);
  }

  /** 按手机号查询我的预定 */
  @Public()
  @Get()
  @ApiOperation({ summary: '按手机号查询本店预定' })
  listMine(@Query() query: PublicReservationLookupQuery) {
    return this.reservationService.listByPhone(
      resolvePublicStoreId(query.storeId),
      query.phone,
    );
  }

  /** 预定详情（手机号核验） */
  @Public()
  @Get(':id')
  @ApiOperation({ summary: '预定详情（需手机号）' })
  detail(
    @Param('id') id: string,
    @Query() query: PublicReservationLookupQuery,
  ) {
    return this.reservationService.findByPhone(
      resolvePublicStoreId(query.storeId),
      id,
      query.phone,
    );
  }

  /** 自助修改 */
  @Public()
  @Patch(':id')
  @ApiOperation({ summary: '顾客自助修改预定（手机号核验）' })
  update(
    @Param('id') id: string,
    @Body() dto: PublicUpdateReservationDto,
    @Query('storeId') storeId?: string,
  ) {
    return this.reservationService.updateByPhone(
      resolvePublicStoreId(storeId),
      id,
      dto,
    );
  }

  /** 自助取消 */
  @Public()
  @Post(':id/cancel')
  @ApiOperation({ summary: '顾客自助取消预定（手机号核验）' })
  cancel(
    @Param('id') id: string,
    @Body() dto: PublicCancelReservationDto,
    @Query('storeId') storeId?: string,
  ) {
    return this.reservationService.cancelByPhone(
      resolvePublicStoreId(storeId),
      id,
      dto,
    );
  }
}
