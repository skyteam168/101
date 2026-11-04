import { Module } from '@nestjs/common';
import { AgentDriver } from './drivers/agent.driver';
import { BrowserDriver } from './drivers/browser.driver';
import { CloudPrinterDriver } from './drivers/cloud-printer.driver';
import { PrintController } from './print.controller';
import { PrintJobService } from './print-job.service';
import { PrintListenerService } from './print-listener.service';
import { PrintService } from './print.service';

@Module({
  controllers: [PrintController],
  providers: [
    PrintService,
    PrintJobService,
    PrintListenerService,
    AgentDriver,
    BrowserDriver,
    CloudPrinterDriver,
  ],
  exports: [PrintService, PrintJobService, AgentDriver, BrowserDriver, CloudPrinterDriver],
})
export class PrintModule {}
