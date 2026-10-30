import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CreateReservationDto } from './dto/reservation.dto';
import { ReservationService } from './reservation.service';

@ApiTags('public-reservation')
@Controller('public/reservations')
export class PublicReservationController {
  constructor(private readonly reservationService: ReservationService) {}

  /** H5 顾客自助预定 */
  @Public()
  @Post()
  @ApiOperation({ summary: '公开预定（无需登录）' })
  create(@Body() dto: CreateReservationDto) {
    return this.reservationService.createPublic(dto);
  }
}
