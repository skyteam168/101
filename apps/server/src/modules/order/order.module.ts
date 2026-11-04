import { Module } from '@nestjs/common';
import { ComboModule } from '../combo/combo.module';
import { InventoryModule } from '../inventory/inventory.module';
import { MarketingModule } from '../marketing/marketing.module';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

@Module({
  imports: [MarketingModule, ComboModule, InventoryModule],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
