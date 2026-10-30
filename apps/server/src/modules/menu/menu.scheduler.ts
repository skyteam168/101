import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MenuService } from './menu.service';

@Injectable()
export class MenuScheduler {
  private readonly logger = new Logger(MenuScheduler.name);

  constructor(private readonly menuService: MenuService) {}

  /** 每小时检查是否到达门店营业日切日时刻，重置每日限量 */
  @Cron('5 * * * *')
  async onHour() {
    this.logger.debug('check business-day daily stock reset');
    await this.menuService.resetDailyStockForBusinessDay();
  }
}
