import { Module } from '@nestjs/common';
import { PublicReservationController } from './public-reservation.controller';
import { ReservationController } from './reservation.controller';
import { ReservationService } from './reservation.service';

@Module({
  controllers: [ReservationController, PublicReservationController],
  providers: [ReservationService],
  exports: [ReservationService],
})
export class ReservationModule {}
