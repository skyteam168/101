export type PrinterDeviceHealth = {
  queueName: string;
  ok: boolean;
  detail: string;
  at: number;
};

/**
 * 内存缓存：打印代理心跳上报的 Windows 打印机真实状态（关机/脱机）。
 * 使用单例，避免 Print ↔ Realtime 循环依赖。
 */
class PrinterDeviceStatusStore {
  /** agentId → queueName → health */
  private readonly byAgent = new Map<string, Map<string, PrinterDeviceHealth>>();

  upsert(
    agentId: string,
    printers: Array<{ queueName: string; ok: boolean; detail?: string }>,
  ) {
    const map = this.byAgent.get(agentId) ?? new Map<string, PrinterDeviceHealth>();
    const now = Date.now();
    for (const p of printers) {
      const queueName = (p.queueName || '').trim();
      if (!queueName) continue;
      map.set(queueName, {
        queueName,
        ok: !!p.ok,
        detail: p.detail || (p.ok ? '在线' : '离线'),
        at: now,
      });
    }
    this.byAgent.set(agentId, map);
  }

  clearAgent(agentId: string) {
    this.byAgent.delete(agentId);
  }

  getByQueueName(agentId: string | null | undefined, queueName: string | null | undefined) {
    if (!agentId || !queueName) return null;
    const map = this.byAgent.get(agentId);
    if (!map) return null;
    return map.get(queueName.trim()) ?? null;
  }

  isFresh(health: PrinterDeviceHealth | null, maxAgeMs = 45_000) {
    if (!health) return false;
    return Date.now() - health.at <= maxAgeMs;
  }
}

export const printerDeviceStatusStore = new PrinterDeviceStatusStore();
