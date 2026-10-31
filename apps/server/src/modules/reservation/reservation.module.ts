import { Module } from '@nestjs/common';
import { MemberModule } from '../member/member.module';
import { PublicReservationController } from './public-reservation.controller';
import { ReservationController } from './reservation.controller';
import { ReservationService } from './reservation.service';

@Module({
  imports: [MemberModule],
  controllers: [ReservationController, PublicReservationController],
  providers: [ReservationService],
  exports: [ReservationService],
})
export class ReservationModule {}
