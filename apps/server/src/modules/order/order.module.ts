import { Module } from '@nestjs/common';
import { ComboModule } from '../combo/combo.module';
import { MarketingModule } from '../marketing/marketing.module';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

@Module({
  imports: [MarketingModule, ComboModule],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
