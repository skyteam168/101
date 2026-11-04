import { Module } from '@nestjs/common';
import { MemberModule } from '../member/member.module';
import { OrderModule } from '../order/order.module';
import { PublicReservationController } from './public-reservation.controller';
import { ReservationController } from './reservation.controller';
import { ReservationService } from './reservation.service';

@Module({
  imports: [MemberModule, OrderModule],
  controllers: [ReservationController, PublicReservationController],
  providers: [ReservationService],
  exports: [ReservationService],
})
export class ReservationModule {}
