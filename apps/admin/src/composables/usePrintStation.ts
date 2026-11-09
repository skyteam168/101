import { computed, onUnmounted, ref, shallowRef } from 'vue';
import { io, type Socket } from 'socket.io-client';
import { ElMessage, ElNotification } from 'element-plus';
import { Events, type PrintJobMessage } from '@restaurant/shared';
import { listPrintersApi, type Printer } from '../api/print';
import { getAccessToken } from '../utils/auth-storage';
import { encodeTicketEscPos } from '../utils/ticket-escpos';
import {
  closeSerialPort,
  isWebSerialSupported,
  loadSerialBaudRate,
  reopenGrantedPorts,
  requestSerialPort,
  saveSerialBaudRate,
  writeSerialBytes,
  type SerialBaudRate,
} from '../utils/web-serial-print';
import { i18n } from '../i18n';

const STORAGE_KEY = 'print_station_enabled';

const enabled = ref(localStorage.getItem(STORAGE_KEY) === '1');
const connecting = ref(false);
const serialReady = ref(false);
const stationClaimed = ref(false);
const lastError = ref('');
const baudRate = ref<SerialBaudRate>(loadSerialBaudRate());
const browserPrinters = ref<Printer[]>([]);
/** USB 静默代理（agent_usb）真实在线状态 */
const agentUsbConfigured = ref(false);
const agentUsbOnline = ref(false);
const agentUsbLabel = ref('');
const portRef = shallowRef<SerialPort | null>(null);
let socket: Socket | null = null;
let printing = false;
const queue: PrintJobMessage[] = [];
let agentPollTimer: ReturnType<typeof setInterval> | null = null;

function t(key: string) {
  return String(i18n.global.t(key));
}

async function refreshBrowserPrinters() {
  try {
    const list = await listPrintersApi();
    browserPrinters.value = list.filter(
      (p) => p.isActive && p.connectionType === 'browser_usb',
    );
  } catch {
    browserPrinters.value = [];
  }
}

async function refreshAgentUsbStatus() {
  if (!getAccessToken()) {
    agentUsbConfigured.value = false;
    agentUsbOnline.value = false;
    agentUsbLabel.value = '';
    return;
  }
  try {
    const list = await listPrintersApi();
    const agentUsb = list.filter((p) => p.isActive && p.connectionType === 'agent_usb');
    agentUsbConfigured.value = agentUsb.length > 0;
    // 优先看 Windows 队列真实通电状态；无心跳时再退回「仅代理进程在线」
    const deviceReady = agentUsb.filter((p) => p.deviceOnline === true);
    const deviceKnownOffline = agentUsb.some((p) => p.deviceOnline === false);
    const agentProcessOnline = agentUsb.some((p) => p.agent?.status === 'online');
    if (deviceReady.length > 0) {
      agentUsbOnline.value = true;
    } else if (deviceKnownOffline || agentUsb.some((p) => p.deviceOnline != null)) {
      agentUsbOnline.value = false;
    } else {
      // 尚无设备心跳：不谎称正常
      agentUsbOnline.value = false;
    }
    const sample = deviceReady[0] || agentUsb.find((p) => p.deviceOnline === false) || agentUsb[0];
    const detail = sample?.deviceDetail
      ? sample.deviceDetail
      : agentProcessOnline
        ? '等待打印机状态'
        : '代理离线';
    agentUsbLabel.value = sample
      ? `${sample.name}${sample.ip ? ` · ${sample.ip}` : ''} · ${detail}`
      : detail;
  } catch {
    agentUsbConfigured.value = false;
    agentUsbOnline.value = false;
    agentUsbLabel.value = '';
  }
}

function startAgentPoll() {
  if (agentPollTimer) return;
  void refreshAgentUsbStatus();
  agentPollTimer = setInterval(() => {
    void refreshAgentUsbStatus();
  }, 5000);
}

function stopAgentPoll() {
  if (agentPollTimer) {
    clearInterval(agentPollTimer);
    agentPollTimer = null;
  }
}

async function processQueue() {
  if (printing || !portRef.value) return;
  const job = queue.shift();
  if (!job) return;
  printing = true;
  try {
    const bytes = encodeTicketEscPos(job.payload);
    await writeSerialBytes(portRef.value, bytes);
    socket?.emit(Events.PRINT_ACK, { jobId: job.jobId, status: 'done' });
  } catch (e) {
    const msg = (e as Error).message || 'print failed';
    lastError.value = msg;
    socket?.emit(Events.PRINT_ACK, { jobId: job.jobId, status: 'failed', error: msg });
    ElNotification({
      type: 'error',
      title: t('print.stationPrintFailed'),
      message: msg,
      duration: 5000,
    });
  } finally {
    printing = false;
    void processQueue();
  }
}

function onBrowserJob(msg: PrintJobMessage) {
  if (!enabled.value || !portRef.value) return;
  const pid = msg.printer?.id;
  if (pid && browserPrinters.value.length) {
    const ok = browserPrinters.value.some((p) => p.id === pid);
    if (!ok) return;
  }
  queue.push(msg);
  void processQueue();
}

function connectSocket() {
  const token = getAccessToken();
  if (!token) return;
  socket?.disconnect();
  socket = io('/', {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    auth: { token },
  });
  socket.on('connect', () => {
    void claimStation();
  });
  socket.off(Events.PRINT_BROWSER_JOB);
  socket.on(Events.PRINT_BROWSER_JOB, onBrowserJob);
}

async function claimStation() {
  if (!socket || !enabled.value) return;
  await refreshBrowserPrinters();
  const printerIds = browserPrinters.value.map((p) => p.id);
  socket.emit(
    Events.PRINT_STATION_CLAIM,
    { printerIds },
    (res: { ok?: boolean }) => {
      stationClaimed.value = !!res?.ok;
    },
  );
}

async function releaseStation() {
  socket?.emit(Events.PRINT_STATION_RELEASE);
  stationClaimed.value = false;
}

export function usePrintStation() {
  const supported = computed(() => isWebSerialSupported());
  /** 综合状态：优先反映 agent_usb 代理是否在线（真实出纸链路） */
  const printerReady = computed(() => {
    if (agentUsbConfigured.value) return agentUsbOnline.value;
    return enabled.value && serialReady.value && stationClaimed.value;
  });
  const printerStatusKind = computed<'ok' | 'warn' | 'off'>(() => {
    if (agentUsbConfigured.value) {
      return agentUsbOnline.value ? 'ok' : 'off';
    }
    if (!enabled.value) return 'off';
    if (!serialReady.value) return 'warn';
    if (stationClaimed.value) return 'ok';
    return 'warn';
  });
  const statusText = computed(() => {
    if (agentUsbConfigured.value) {
      return agentUsbOnline.value
        ? t('print.agentUsbOnline')
        : t('print.agentUsbOffline');
    }
    if (!enabled.value) return t('print.stationOff');
    if (!supported.value) return t('print.stationUnsupported');
    if (!serialReady.value) return t('print.stationNeedUsb');
    if (stationClaimed.value) return t('print.stationOnline');
    return t('print.stationConnecting');
  });
  const statusDetail = computed(() => {
    if (agentUsbConfigured.value && agentUsbLabel.value) {
      return `${statusText.value} · ${agentUsbLabel.value}`;
    }
    return statusText.value;
  });

  async function setBaudRate(next: SerialBaudRate) {
    baudRate.value = next;
    saveSerialBaudRate(next);
    if (serialReady.value) {
      await closeSerialPort(portRef.value);
      portRef.value = null;
      serialReady.value = false;
      await connectUsb();
    }
  }

  async function connectUsb() {
    if (!supported.value) {
      ElMessage.error(t('print.stationUnsupported'));
      return;
    }
    connecting.value = true;
    lastError.value = '';
    try {
      const baud = baudRate.value;
      let port = await reopenGrantedPorts(baud);
      if (!port) port = await requestSerialPort(baud);
      portRef.value = port;
      serialReady.value = true;
      ElMessage.success(t('print.stationUsbOk'));
      if (enabled.value) {
        connectSocket();
        await claimStation();
      }
    } catch (e) {
      const err = e as Error & { name?: string };
      lastError.value = err.message || String(e);
      // 用户取消选口：NotFoundError；无 COM/无兼容设备也常是 NotFoundError
      if (err.name === 'NotFoundError' || /No port selected|找不到|No compatible/i.test(err.message || '')) {
        ElMessage.warning({ message: t('print.stationUsbNoDevice'), duration: 8000, showClose: true });
      } else {
        ElMessage.error(t('print.stationUsbFail'));
      }
    } finally {
      connecting.value = false;
    }
  }

  async function setEnabled(on: boolean) {
    enabled.value = on;
    localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
    if (!on) {
      await releaseStation();
      socket?.disconnect();
      socket = null;
      return;
    }
    if (!getAccessToken()) {
      ElMessage.warning(t('print.stationNeedLogin'));
      enabled.value = false;
      localStorage.setItem(STORAGE_KEY, '0');
      return;
    }
    if (!serialReady.value) {
      await connectUsb();
    } else {
      connectSocket();
      await claimStation();
    }
  }

  async function startIfNeeded() {
    startAgentPoll();
    if (!enabled.value || !getAccessToken()) return;
    if (!serialReady.value) {
      try {
        const port = await reopenGrantedPorts(baudRate.value);
        if (port) {
          portRef.value = port;
          serialReady.value = true;
        }
      } catch {
        /* 需用户再次点连接 */
      }
    }
    if (serialReady.value) {
      connectSocket();
      await claimStation();
    }
  }

  async function stop() {
    stopAgentPoll();
    await releaseStation();
    socket?.disconnect();
    socket = null;
    await closeSerialPort(portRef.value);
    portRef.value = null;
    serialReady.value = false;
  }

  onUnmounted(() => {
    /* 全局单例不在组件卸载时关口，避免多处引用误关 */
  });

  startAgentPoll();

  return {
    enabled,
    connecting,
    serialReady,
    stationClaimed,
    supported,
    statusText,
    statusDetail,
    printerReady,
    printerStatusKind,
    agentUsbConfigured,
    agentUsbOnline,
    agentUsbLabel,
    lastError,
    baudRate,
    browserPrinters,
    setEnabled,
    setBaudRate,
    connectUsb,
    startIfNeeded,
    stop,
    refreshBrowserPrinters,
    refreshAgentUsbStatus,
  };
}

/** 布局顶栏全局单例 */
let singleton: ReturnType<typeof usePrintStation> | null = null;
export function usePrintStationGlobal() {
  if (!singleton) singleton = usePrintStation();
  return singleton;
}
