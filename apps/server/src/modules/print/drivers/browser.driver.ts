import { Injectable, Logger } from '@nestjs/common';
import { Events, type PrintJobMessage } from '@restaurant/shared';
import { RealtimeGateway } from '../../realtime/realtime.gateway';

/** 推送到收银电脑「打印台」浏览器（Web Serial USB） */
@Injectable()
export class BrowserDriver {
  private readonly logger = new Logger(BrowserDriver.name);

  constructor(private readonly gateway: RealtimeGateway) {}

  async push(storeId: string, job: PrintJobMessage): Promise<boolean> {
    if (!this.gateway.isPrintStationOnline(storeId)) {
      this.logger.debug(`print station offline for store ${storeId}, keep job ${job.jobId} queued`);
      return false;
    }
    this.gateway.emitToPrintStation(storeId, Events.PRINT_BROWSER_JOB, job);
    return true;
  }
}
