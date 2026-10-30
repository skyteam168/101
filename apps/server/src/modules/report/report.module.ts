import { Module } from '@nestjs/common';
import { PrintModule } from '../print/print.module';
import { ReportController } from './report.controller';
import { ReportScheduler } from './report.scheduler';
import { ReportService } from './report.service';

@Module({
  imports: [PrintModule],
  controllers: [ReportController],
  providers: [ReportService, ReportScheduler],
  exports: [ReportService],
})
export class ReportModule {}
