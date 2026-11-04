import type { PrintJobMessage } from '@restaurant/shared';

/** 网口代理驱动；云打印见 CloudPrinterDriver */
export interface PrinterDriver {
  /** 推送任务到打印机侧；离线时应返回 false 而非抛错 */
  push(job: PrintJobMessage & { agentId: string }): Promise<boolean>;
}
