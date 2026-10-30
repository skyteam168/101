import { Module } from '@nestjs/common';
import { MenuController } from './menu.controller';
import { MenuScheduler } from './menu.scheduler';
import { MenuService } from './menu.service';
import { PublicMenuController } from './public-menu.controller';

@Module({
  controllers: [MenuController, PublicMenuController],
  providers: [MenuService, MenuScheduler],
  exports: [MenuService],
})
export class MenuModule {}
