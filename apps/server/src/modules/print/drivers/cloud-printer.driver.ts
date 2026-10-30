import { Injectable } from '@nestjs/common';
import type { PrintJobMessage } from '@restaurant/shared';
import type { PrinterDriver } from './printer-driver';

/** 预留：云打印机驱动（未实现） */
@Injectable()
export class CloudPrinterDriver implements PrinterDriver {
  async push(_job: PrintJobMessage & { agentId: string }): Promise<boolean> {
    throw new Error('CloudPrinterDriver not implemented');
  }
}
