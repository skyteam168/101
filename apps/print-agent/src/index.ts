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
import { createSocketClient, emitAck, getSocketState } from './socket';
import { startStatusServer, addJobRecord, JobRecord } from './status-server';

// ─────────────────────────── 打印核心流程 ───────────────────────────

/**
 * 处理一个打印任务：渲染 → ESC/POS → TCP 发送 → ACK
 */
async function executePrint(msg: PrintJobMessage, agentId: string): Promise<void> {
  const startAt = Date.now();
  const record: JobRecord = {
    jobId: msg.jobId,
    template: msg.payload.template,
    printerIp: msg.printer.ip,
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
    const printBuf = buildPrintBuffer(bitmap, width, height, { beep });

    // 3. TCP 发送
    const { ip, port = 9100 } = msg.printer;
    console.log(`[print] 发送 ${printBuf.length} 字节 → ${ip}:${port}`);
    await sendToTcpPrinter(ip, port, printBuf);

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
  return async (ip: string, port: number, paperWidth: 58 | 80): Promise<void> => {
    const testMsg: PrintJobMessage = {
      jobId: `test-${Date.now()}`,
      printer: { ip, port, paperWidth },
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
  const socket = createSocketClient(config, async (msg: PrintJobMessage) => {
    try {
      await executePrint(msg, config.agentId);
      emitAck(socket, { jobId: msg.jobId, status: 'done' });
    } catch (err) {
      emitAck(socket, { jobId: msg.jobId, status: 'failed', error: String(err) });
    }
  });

  // 启动本地状态 HTTP 服务器
  startStatusServer(config, getSocketState, makeTestPrint(config.agentId));

  // 优雅退出
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      console.log(`\n[main] 收到 ${sig}，正在退出…`);
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
