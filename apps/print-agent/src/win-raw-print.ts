/**
 * Windows 打印机队列 RAW 静默打印（USB 热敏机装成系统打印机后，不经虚拟 COM）。
 * 使用 Unicode winspool API + DOC_INFO_1，兼容芯烨等厂商驱动。
 */
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * 将 ESC/POS 字节以 RAW 数据类型写入指定 Windows 打印机队列。
 */
export function sendToWindowsPrinter(printerName: string, data: Buffer): Promise<void> {
  if (process.platform !== 'win32') {
    return Promise.reject(new Error('WIN_RAW_PRINT_ONLY_WINDOWS'));
  }
  const name = printerName.trim();
  if (!name) {
    return Promise.reject(new Error('WINDOWS_PRINTER_NAME_REQUIRED'));
  }

  const tmp = path.join(
    os.tmpdir(),
    `escpos-${Date.now()}-${Math.random().toString(16).slice(2)}.bin`,
  );
  fs.writeFileSync(tmp, data);

  const ps = `
$ErrorActionPreference = 'Stop'
$printerName = ${JSON.stringify(name)}
$path = ${JSON.stringify(tmp)}
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;
public class EscPosRawPrintW {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct DOC_INFO_1 {
    public string pDocName;
    public string pOutputFile;
    public string pDatatype;
  }
  [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, ref DOC_INFO_1 pDocInfo);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
  public static void SendFile(string printer, string filePath) {
    IntPtr hPrinter;
    if (!OpenPrinter(printer, out hPrinter, IntPtr.Zero)) {
      throw new Exception("OpenPrinter failed Win32=" + Marshal.GetLastWin32Error());
    }
    DOC_INFO_1 di = new DOC_INFO_1();
    di.pDocName = "ESC/POS";
    di.pOutputFile = null;
    di.pDatatype = "RAW";
    if (!StartDocPrinter(hPrinter, 1, ref di)) {
      int e = Marshal.GetLastWin32Error();
      ClosePrinter(hPrinter);
      throw new Exception("StartDocPrinter failed Win32=" + e);
    }
    if (!StartPagePrinter(hPrinter)) {
      int e = Marshal.GetLastWin32Error();
      EndDocPrinter(hPrinter);
      ClosePrinter(hPrinter);
      throw new Exception("StartPagePrinter failed Win32=" + e);
    }
    byte[] payload = File.ReadAllBytes(filePath);
    IntPtr p = Marshal.AllocCoTaskMem(payload.Length);
    Marshal.Copy(payload, 0, p, payload.Length);
    int written;
    bool ok = WritePrinter(hPrinter, p, payload.Length, out written);
    int we = Marshal.GetLastWin32Error();
    Marshal.FreeCoTaskMem(p);
    EndPagePrinter(hPrinter);
    EndDocPrinter(hPrinter);
    ClosePrinter(hPrinter);
    if (!ok) throw new Exception("WritePrinter failed Win32=" + we + " written=" + written);
    if (written != payload.Length) throw new Exception("WritePrinter short write " + written + "/" + payload.Length);
  }
}
"@
[EscPosRawPrintW]::SendFile($printerName, $path)
`;

  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps],
      { windowsHide: true },
    );
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
      reject(err);
    });
    child.on('close', (code) => {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `WIN_RAW_PRINT_EXIT_${code}`));
    });
  });
}

/** 列出本机打印机队列名（状态页 / 排障） */
export function listWindowsPrinters(): Promise<string[]> {
  if (process.platform !== 'win32') return Promise.resolve([]);
  return new Promise((resolve) => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-Printer | Select-Object -ExpandProperty Name',
      ],
      { windowsHide: true },
    );
    let out = '';
    child.stdout.on('data', (c) => {
      out += c.toString();
    });
    child.on('close', () => {
      const names = out
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      resolve(names);
    });
    child.on('error', () => resolve([]));
  });
}

export type WindowsPrinterHealth = {
  name: string;
  ok: boolean;
  /** 人类可读：在线 / 脱机 / 未找到 … */
  detail: string;
  workOffline?: boolean;
  printerStatus?: number;
};

/**
 * 探测 Windows 队列真实就绪状态（关机 USB 热敏常见 WorkOffline=True）。
 */
export function probeWindowsPrinter(printerName: string): Promise<WindowsPrinterHealth> {
  const name = printerName.trim();
  if (!name) {
    return Promise.resolve({ name: '', ok: false, detail: '未配置打印机名' });
  }
  if (process.platform !== 'win32') {
    return Promise.resolve({ name, ok: false, detail: '仅 Windows 可探测' });
  }

  const ps = `
$ErrorActionPreference = 'Stop'
$name = ${JSON.stringify(name)}
$p = Get-CimInstance -ClassName Win32_Printer -Filter ("Name='" + ($name -replace "'","''") + "'") -ErrorAction SilentlyContinue
if (-not $p) {
  @{ found = $false; workOffline = $true; printerStatus = 0; detectedErrorState = 0 } | ConvertTo-Json -Compress
  exit 0
}
@{
  found = $true
  workOffline = [bool]$p.WorkOffline
  printerStatus = [int]$p.PrinterStatus
  detectedErrorState = [int]$p.DetectedErrorState
  extendedPrinterStatus = [int]$p.ExtendedPrinterStatus
} | ConvertTo-Json -Compress
`;

  return new Promise((resolve) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps],
      { windowsHide: true },
    );
    let out = '';
    let stderr = '';
    child.stdout.on('data', (c) => {
      out += c.toString();
    });
    child.stderr.on('data', (c) => {
      stderr += c.toString();
    });
    child.on('error', () => {
      resolve({ name, ok: false, detail: '探测失败' });
    });
    child.on('close', () => {
      try {
        const raw = JSON.parse(out.trim() || '{}') as {
          found?: boolean;
          workOffline?: boolean;
          printerStatus?: number;
          detectedErrorState?: number;
        };
        if (!raw.found) {
          resolve({ name, ok: false, detail: '未找到打印机队列', workOffline: true });
          return;
        }
        const workOffline = !!raw.workOffline;
        const errState = Number(raw.detectedErrorState || 0);
        // PrinterStatus: 3=Idle 正常；4=Printing；1/2 等异常；关机时常伴 WorkOffline
        const status = Number(raw.printerStatus || 0);
        const ok = !workOffline && errState === 0 && (status === 0 || status === 3 || status === 4 || status === 5);
        let detail = '在线';
        if (!raw.found) detail = '未找到';
        else if (workOffline) detail = '脱机（请检查打印机电源/USB）';
        else if (errState !== 0) detail = `异常码 ${errState}`;
        else if (!ok) detail = `状态码 ${status}`;
        resolve({
          name,
          ok,
          detail,
          workOffline,
          printerStatus: status,
        });
      } catch {
        resolve({
          name,
          ok: false,
          detail: stderr.trim() || '探测解析失败',
        });
      }
    });
  });
}
