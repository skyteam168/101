import { Module } from '@nestjs/common';
import { DeliveryModule } from '../delivery/delivery.module';
import { MenuModule } from '../menu/menu.module';
import { NoticeController } from './notice.controller';
import { NoticeService } from './notice.service';
import { PublicHomeController } from './public-home.controller';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';

@Module({
  imports: [DeliveryModule, MenuModule],
  controllers: [StoreController, NoticeController, PublicHomeController],
  providers: [StoreService, NoticeService],
  exports: [StoreService, NoticeService],
})
export class StoreModule {}
