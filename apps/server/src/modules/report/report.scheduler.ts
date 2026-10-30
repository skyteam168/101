import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ReportService } from './report.service';

@Injectable()
export class ReportScheduler {
  private readonly logger = new Logger(ReportScheduler.name);

  constructor(private readonly reports: ReportService) {}

  /** 每小时第 8 分：若正好切日时刻，写入上一营业日 daily_summary */
  @Cron('8 * * * *')
  async onHour() {
    const sealed = await this.reports.sealYesterdayForAllStores();
    if (sealed.length) {
      this.logger.log(`sealed daily_summary: ${sealed.join(', ')}`);
    }
  }
}
