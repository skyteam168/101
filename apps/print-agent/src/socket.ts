import { io, Socket } from 'socket.io-client';
import { Events } from '@restaurant/shared';
import { AgentConfig } from './config';
import { PrintJobMessage } from './render';

export type WatchPrinter = { id?: string; queueName: string };

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface SocketState {
  status: ConnectionState;
  since: Date;
  reconnectAttempts: number;
  error?: string;
}

export type AckStatus = 'done' | 'failed';

export interface PrintAckPayload {
  jobId: string;
  status: AckStatus;
  error?: string;
}

/** 打印任务处理回调 */
export type PrintJobHandler = (msg: PrintJobMessage) => Promise<void>;
export type WatchPrinterHandler = (printers: WatchPrinter[]) => void;

let _socket: Socket | null = null;
let _state: SocketState = {
  status: 'disconnected',
  since: new Date(),
  reconnectAttempts: 0,
};

/** 获取当前 Socket 连接状态（供状态页展示） */
export function getSocketState(): SocketState {
  return { ..._state };
}

/**
 * 创建并启动 Socket.IO 客户端。
 * 使用 auth { typ:'agent', agentId, secret } 向服务端鉴权。
 * 自动重连；最大重试间隔 30 秒。
 */
export function createSocketClient(
  config: AgentConfig,
  onPrintJob: PrintJobHandler,
  onWatchPrinters?: WatchPrinterHandler,
): Socket {
  if (_socket) {
    _socket.disconnect();
    _socket = null;
  }

  _state = { status: 'connecting', since: new Date(), reconnectAttempts: 0 };

  const socket = io(config.serverUrl, {
    auth: {
      typ: 'agent',
      agentId: config.agentId,
      secret: config.agentSecret,
    },
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 30_000,
    reconnectionAttempts: Infinity,
    transports: ['websocket'],
  });

  socket.on('connect', () => {
    console.log(`[socket] 已连接 ${config.serverUrl}  id=${socket.id}`);
    _state = { status: 'connected', since: new Date(), reconnectAttempts: 0 };
  });

  socket.on('print.agent.watch', (payload: { printers?: WatchPrinter[] }) => {
    const list = Array.isArray(payload?.printers) ? payload.printers : [];
    console.log(`[socket] 监控打印机 ${list.map((p) => p.queueName).join(', ') || '(无)'}`);
    onWatchPrinters?.(list);
  });

  socket.on('disconnect', (reason) => {
    console.warn(`[socket] 断开连接: ${reason}`);
    _state = { status: 'disconnected', since: new Date(), reconnectAttempts: _state.reconnectAttempts };
  });

  socket.on('connect_error', (err) => {
    console.error(`[socket] 连接错误: ${err.message}`);
    _state = {
      status: 'error',
      since: new Date(),
      reconnectAttempts: _state.reconnectAttempts + 1,
      error: err.message,
    };
  });

  socket.io.on('reconnect_attempt', (attempt) => {
    console.log(`[socket] 重连尝试 #${attempt}`);
    _state = { ..._state, status: 'connecting', reconnectAttempts: attempt };
  });

  socket.io.on('reconnect', () => {
    console.log('[socket] 重连成功');
    _state = { status: 'connected', since: new Date(), reconnectAttempts: 0 };
  });

  // 监听打印任务
  socket.on(Events.PRINT_JOB, async (msg: PrintJobMessage) => {
    console.log(`[socket] 收到打印任务 jobId=${msg.jobId} template=${msg.payload.template}`);
    try {
      await onPrintJob(msg);
    } catch (err) {
      console.error(`[socket] 打印任务处理异常 jobId=${msg.jobId}:`, err);
      emitAck(socket, { jobId: msg.jobId, status: 'failed', error: String(err) });
    }
  });

  _socket = socket;
  return socket;
}

/** 发送打印确认应答 */
export function emitAck(socket: Socket, payload: PrintAckPayload): void {
  if (socket.connected) {
    socket.emit(Events.PRINT_ACK, payload);
    console.log(`[socket] ack jobId=${payload.jobId} status=${payload.status}`);
  } else {
    console.warn(`[socket] 无法发送 ack（未连接），jobId=${payload.jobId}`);
  }
}

/** 上报本机 Windows 打印机真实状态 */
export function emitAgentHeartbeat(
  socket: Socket,
  printers: Array<{ queueName: string; ok: boolean; detail: string }>,
): void {
  if (!socket.connected) return;
  socket.emit(Events.PRINT_AGENT_HEARTBEAT, { printers });
}
