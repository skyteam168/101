/**
 * tcp-print.ts
 * 通过 TCP socket 发送 ESC/POS 数据到网络热敏打印机（端口默认 9100）。
 */
import net from 'net';

export interface TcpPrintOptions {
  /** 连接超时毫秒，默认 5000 */
  connectTimeoutMs?: number;
  /** 发送超时毫秒，默认 10000 */
  sendTimeoutMs?: number;
}

/**
 * 将 ESC/POS 数据发送到指定 IP:Port 的打印机。
 * 成功时 resolve；超时或网络错误时 reject。
 */
export function sendToTcpPrinter(
  ip: string,
  port: number,
  data: Buffer,
  opts: TcpPrintOptions = {},
): Promise<void> {
  const { connectTimeoutMs = 5000, sendTimeoutMs = 10000 } = opts;

  return new Promise<void>((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;
    let connectTimer: NodeJS.Timeout | null = null;
    let sendTimer: NodeJS.Timeout | null = null;

    function done(err?: Error): void {
      if (settled) return;
      settled = true;
      if (connectTimer) clearTimeout(connectTimer);
      if (sendTimer) clearTimeout(sendTimer);
      socket.destroy();
      if (err) reject(err);
      else resolve();
    }

    socket.on('error', (err) => {
      console.error(`[tcp-print] 打印机 ${ip}:${port} 错误: ${err.message}`);
      done(err);
    });

    // 连接超时
    connectTimer = setTimeout(() => {
      done(new Error(`连接打印机 ${ip}:${port} 超时 (${connectTimeoutMs}ms)`));
    }, connectTimeoutMs);

    socket.connect(port, ip, () => {
      if (connectTimer) clearTimeout(connectTimer);
      connectTimer = null;

      // 发送超时
      sendTimer = setTimeout(() => {
        done(new Error(`发送数据到 ${ip}:${port} 超时 (${sendTimeoutMs}ms)`));
      }, sendTimeoutMs);

      socket.write(data, (writeErr) => {
        if (writeErr) {
          done(writeErr);
          return;
        }
        // 写入完成后等待短暂时间确保数据刷新，然后关闭
        setTimeout(() => {
          socket.end(() => done());
        }, 200);
      });
    });
  });
}
