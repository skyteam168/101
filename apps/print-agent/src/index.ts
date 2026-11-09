/**
 * index.ts
 * 打印代理入口：加载配置 → 注册字体 → 连接 Socket.IO → 启动状态页面。
 *
 * 流程：
 *  1. loadConfig()       读取 config.json
 *  2. registerFonts()    注册中越文字体
 *  3. createSocketClient() 连接云端，监听 print.job 事件
 *  4. 收到任务 → renderTicket() → buildPrintBuffer() → sendToTcpPrinter()
 *  5. emitAck() 回传 done/failed
 *  6. startStatusServer() 启动本地状态页
 */

import { loadConfig } from './config';
import { registerFonts, renderTicket, PrintJobMessage } from './render';
import { buildPrintBuffer } from './escpos';
import { sendToTcpPrinter } from './tcp-print';
import { probeWindowsPrinter, sendToWindowsPrinter } from './win-raw-print';
import {
  createSocketClient,
  emitAck,
  emitAgentHeartbeat,
  getSocketState,
  type WatchPrinter,
} from './socket';
import { startStatusServer, addJobRecord, JobRecord } from './status-server';

const watchQueueNames = new Set<string>();
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function rememberQueueName(name: string) {
  const n = name.trim();
  if (n) watchQueueNames.add(n);
}

async function runHeartbeat(socket: import('socket.io-client').Socket) {
  const names = [...watchQueueNames];
  if (!names.length || !socket.connected) return;
  const printers = [];
  for (const queueName of names) {
    const health = await probeWindowsPrinter(queueName);
    printers.push({
      queueName: health.name || queueName,
      ok: health.ok,
      detail: health.detail,
    });
    console.log(`[health] 「${queueName}」 ${health.ok ? '在线' : '离线'} — ${health.detail}`);
  }
  emitAgentHeartbeat(socket, printers);
}

// ─────────────────────────── 打印核心流程 ───────────────────────────

/**
 * 处理一个打印任务：渲染 → ESC/POS → TCP 发送 → ACK
 */
async function executePrint(msg: PrintJobMessage, agentId: string): Promise<void> {
  const startAt = Date.now();
  const conn = msg.printer.connectionType || 'network';
  const targetLabel =
    conn === 'agent_usb'
      ? `USB/RAW:${msg.printer.ip || msg.printer.name || '?'}`
      : `${msg.printer.ip || '?'}:${msg.printer.port ?? 9100}`;
  const record: JobRecord = {
    jobId: msg.jobId,
    template: msg.payload.template,
    printerIp: targetLabel,
    status: 'pending',
    at: new Date(),
  };
  addJobRecord(record);

  try {
    // 1. 渲染位图
    console.log(`[print] 渲染 jobId=${msg.jobId} template=${msg.payload.template}`);
    const { bitmap, width, height } = renderTicket(msg, agentId);
    console.log(`[print] 渲染完成 ${width}×${height}px`);

    // 厨房类模板发出蜂鸣，前台/收据不蜂鸣
    const beepTemplates: string[] = ['kitchen', 'add', 'void', 'cancel'];
    const beep = beepTemplates.includes(msg.payload.template);

    // 2. 构建 ESC/POS 缓冲
    // 切纸前再走几行，欢迎语离开撕纸口
    const printBuf = buildPrintBuffer(bitmap, width, height, { beep, feedLines: 12 });

    // 3. 发送：agent_usb → Windows RAW；否则 TCP 9100
    if (conn === 'agent_usb') {
      const queueName = (msg.printer.ip || msg.printer.name || '').trim();
      rememberQueueName(queueName);
      console.log(`[print] 发送 ${printBuf.length} 字节 → Windows RAW「${queueName}」`);
      await sendToWindowsPrinter(queueName, printBuf);
    } else {
      const { ip, port = 9100 } = msg.printer;
      if (!ip) throw new Error('PRINTER_IP_REQUIRED');
      console.log(`[print] 发送 ${printBuf.length} 字节 → ${ip}:${port}`);
      await sendToTcpPrinter(ip, port, printBuf);
    }

    record.status = 'done';
    record.durationMs = Date.now() - startAt;
    console.log(`[print] 成功 jobId=${msg.jobId} 耗时=${record.durationMs}ms`);
  } catch (err) {
    record.status = 'failed';
    record.error = String(err);
    record.durationMs = Date.now() - startAt;
    console.error(`[print] 失败 jobId=${msg.jobId}:`, err);
    throw err; // 由 socket.ts 捕获后发送 failed ack
  }
}

// ─────────────────────────── 测试打印（状态页调用） ───────────────────────────

function makeTestPrint(agentId: string) {
  return async (
    ip: string,
    port: number,
    paperWidth: 58 | 80,
    connectionType: 'network' | 'agent_usb' = 'network',
  ): Promise<void> => {
    const testMsg: PrintJobMessage = {
      jobId: `test-${Date.now()}`,
      printer: {
        ip,
        port,
        paperWidth,
        connectionType,
        name: connectionType === 'agent_usb' ? ip : undefined,
      },
      payload: {
        template: 'test',
        paperWidth,
        data: { agentId },
      },
    };
    await executePrint(testMsg, agentId);
  };
}

// ─────────────────────────── 主函数 ───────────────────────────

async function main(): Promise<void> {
  // 读取配置
  const config = loadConfig();
  console.log(`[main] 打印代理启动 agentId=${config.agentId} serverUrl=${config.serverUrl}`);

  // 注册字体（@napi-rs/canvas）
  registerFonts();

  // 连接 Socket.IO
  const socket = createSocketClient(
    config,
    async (msg: PrintJobMessage) => {
      try {
        await executePrint(msg, config.agentId);
        emitAck(socket, { jobId: msg.jobId, status: 'done' });
      } catch (err) {
        emitAck(socket, { jobId: msg.jobId, status: 'failed', error: String(err) });
      }
    },
    (printers: WatchPrinter[]) => {
      for (const p of printers) rememberQueueName(p.queueName);
      void runHeartbeat(socket);
    },
  );

  // 每 10s 探测 Windows 打印机通断电，上报管理端状态灯
  heartbeatTimer = setInterval(() => {
    void runHeartbeat(socket);
  }, 10_000);
  socket.on('connect', () => {
    void runHeartbeat(socket);
  });

  // 启动本地状态 HTTP 服务器
  startStatusServer(config, getSocketState, makeTestPrint(config.agentId));

  // 优雅退出
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      console.log(`\n[main] 收到 ${sig}，正在退出…`);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      socket.disconnect();
      process.exit(0);
    });
  }

  process.on('uncaughtException', (err) => {
    console.error('[main] 未捕获异常:', err);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[main] 未处理 Promise 拒绝:', reason);
  });
}

main().catch((err) => {
  console.error('[main] 启动失败:', err);
  process.exit(1);
});
