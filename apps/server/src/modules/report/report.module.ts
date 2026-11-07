import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { PrintModule } from '../print/print.module';
import { ReportController } from './report.controller';
import { ReportScheduler } from './report.scheduler';
import { ReportService } from './report.service';

@Module({
  imports: [PrintModule, FinanceModule],
  controllers: [ReportController],
  providers: [ReportService, ReportScheduler],
  exports: [ReportService],
})
export class ReportModule {}
