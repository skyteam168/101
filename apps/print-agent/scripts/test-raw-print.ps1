param(
  [string]$PrinterName = 'XP-58',
  [string]$FilePath
)

$ErrorActionPreference = 'Stop'
if (-not $FilePath) {
  $FilePath = Join-Path $env:TEMP 'escpos-probe.bin'
  # ESC @ init + simple text + feed + cut-ish
  [byte[]]$sample = 0x1B, 0x40, 0x55, 0x53, 0x42, 0x20, 0x4F, 0x4B, 0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x00
  [System.IO.File]::WriteAllBytes($FilePath, $sample)
}

Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }

  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

  [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

  [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

  public static string SendFile(string printer, string path) {
    IntPtr hPrinter;
    if (!OpenPrinter(printer, out hPrinter, IntPtr.Zero)) {
      return "OpenPrinter failed Win32=" + Marshal.GetLastWin32Error();
    }
    var di = new DOCINFOA();
    di.pDocName = "ESC POS Test";
    di.pDataType = "RAW";
    if (!StartDocPrinter(hPrinter, 1, di)) {
      int e = Marshal.GetLastWin32Error();
      ClosePrinter(hPrinter);
      return "StartDocPrinter failed Win32=" + e;
    }
    if (!StartPagePrinter(hPrinter)) {
      int e = Marshal.GetLastWin32Error();
      EndDocPrinter(hPrinter);
      ClosePrinter(hPrinter);
      return "StartPagePrinter failed Win32=" + e;
    }
    byte[] bytes = File.ReadAllBytes(path);
    IntPtr p = Marshal.AllocCoTaskMem(bytes.Length);
    Marshal.Copy(bytes, 0, p, bytes.Length);
    int written;
    bool ok = WritePrinter(hPrinter, p, bytes.Length, out written);
    int we = Marshal.GetLastWin32Error();
    Marshal.FreeCoTaskMem(p);
    EndPagePrinter(hPrinter);
    EndDocPrinter(hPrinter);
    ClosePrinter(hPrinter);
    if (!ok) return "WritePrinter failed Win32=" + we + " written=" + written;
    return "OK written=" + written + " of " + bytes.Length;
  }
}
"@

Write-Output ("Testing printer: " + $PrinterName)
Write-Output ("File: " + $FilePath)
Write-Output ([RawPrinterHelper]::SendFile($PrinterName, $FilePath))
