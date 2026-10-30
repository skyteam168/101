import { Injectable, Logger } from '@nestjs/common';
import { Events, type PrintJobMessage } from '@restaurant/shared';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import type { PrinterDriver } from './printer-driver';

@Injectable()
export class AgentDriver implements PrinterDriver {
  private readonly logger = new Logger(AgentDriver.name);

  constructor(private readonly gateway: RealtimeGateway) {}

  async push(job: PrintJobMessage & { agentId: string }): Promise<boolean> {
    const online = this.gateway.isAgentOnline(job.agentId);
    if (!online) {
      this.logger.debug(`agent ${job.agentId} offline, keep job ${job.jobId} queued`);
      return false;
    }
    this.gateway.emitToAgent(job.agentId, Events.PRINT_JOB, {
      jobId: job.jobId,
      printer: job.printer,
      payload: job.payload,
    });
    return true;
  }
}
