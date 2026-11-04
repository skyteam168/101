import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PrintJobMessage } from '@restaurant/shared';
import { isSafeExternalHttpUrl } from '@restaurant/shared';

/**
 * 云打印 MVP：将 PrintJobMessage POST 到打印机配置的 Webhook URL（printer.ip）。
 * 可选请求头 X-Print-Secret（CLOUD_PRINT_WEBHOOK_SECRET）。
 * 2xx 视为投递成功；后续可扩展飞鹅/易联云等厂商协议。
 */
@Injectable()
export class CloudPrinterDriver {
  private readonly logger = new Logger(CloudPrinterDriver.name);
  private readonly secret: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.secret = (this.config.get<string>('CLOUD_PRINT_WEBHOOK_SECRET') || '').trim();
    const raw = Number(this.config.get<string>('CLOUD_PRINT_WEBHOOK_TIMEOUT_MS') || '8000');
    this.timeoutMs = Number.isFinite(raw) && raw > 0 ? raw : 8000;
  }

  async push(job: PrintJobMessage): Promise<boolean> {
    const url = (job.printer.ip || '').trim();
    if (!url || !isSafeExternalHttpUrl(url)) {
      this.logger.warn(`cloud job ${job.jobId}: invalid webhook url`);
      return false;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (this.secret) {
      headers['X-Print-Secret'] = this.secret;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jobId: job.jobId,
          printer: job.printer,
          payload: job.payload,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.warn(
          `cloud job ${job.jobId}: webhook ${res.status} ${text.slice(0, 200)}`,
        );
        return false;
      }
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`cloud job ${job.jobId}: ${msg}`);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
