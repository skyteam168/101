import type { PrintJobMessage } from '@restaurant/shared';

/** 打印机驱动抽象：当前 AgentDriver，预留云打印 */
export interface PrinterDriver {
  /** 推送任务到打印机侧；离线时应返回 false 而非抛错 */
  push(job: PrintJobMessage & { agentId: string }): Promise<boolean>;
}
