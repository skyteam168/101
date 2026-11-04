/** Web Serial 直连 USB 热敏机（虚拟串口）；Xprinter 58 常见 9600 / 115200 */

export type SerialPortLike = SerialPort;
export type SerialBaudRate = 9600 | 115200;

export const SERIAL_BAUD_OPTIONS: SerialBaudRate[] = [9600, 115200];
const BAUD_STORAGE_KEY = 'print_station_baud';

export function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.serial;
}

export function loadSerialBaudRate(): SerialBaudRate {
  const raw = Number(localStorage.getItem(BAUD_STORAGE_KEY) || 9600);
  return raw === 115200 ? 115200 : 9600;
}

export function saveSerialBaudRate(baud: SerialBaudRate) {
  localStorage.setItem(BAUD_STORAGE_KEY, String(baud));
}

export async function requestSerialPort(baudRate: SerialBaudRate = 9600): Promise<SerialPort> {
  const serial = navigator.serial;
  if (!serial) {
    throw new Error('WEB_SERIAL_UNSUPPORTED');
  }
  const port = await serial.requestPort();
  await ensurePortOpen(port, baudRate);
  return port;
}

export async function reopenGrantedPorts(
  baudRate: SerialBaudRate = 9600,
): Promise<SerialPort | null> {
  const serial = navigator.serial;
  if (!serial) return null;
  const ports = await serial.getPorts();
  const port = ports[0];
  if (!port) return null;
  await ensurePortOpen(port, baudRate);
  return port;
}

async function ensurePortOpen(port: SerialPort, baudRate: SerialBaudRate) {
  if (port.readable && port.writable) return;
  await port.open({ baudRate, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
}

export async function writeSerialBytes(port: SerialPort, data: Uint8Array): Promise<void> {
  if (!port.writable) {
    throw new Error('SERIAL_NOT_WRITABLE');
  }
  const writer = port.writable.getWriter();
  try {
    const chunk = 512;
    for (let i = 0; i < data.length; i += chunk) {
      await writer.write(data.subarray(i, Math.min(i + chunk, data.length)));
    }
  } finally {
    writer.releaseLock();
  }
}

export async function closeSerialPort(port: SerialPort | null) {
  if (!port) return;
  try {
    await port.close();
  } catch {
    /* ignore */
  }
}
