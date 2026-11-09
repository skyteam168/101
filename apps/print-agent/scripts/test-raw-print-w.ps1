param(
  [string]$PrinterName = 'XP-58',
  [string]$DataType = 'RAW',
  [string]$FilePath
)

$ErrorActionPreference = 'Stop'
if (-not $FilePath) {
  $FilePath = Join-Path $env:TEMP 'escpos-probe.bin'
  [byte[]]$sample = 0x1B, 0x40, 0x55, 0x53, 0x42, 0x20, 0x4F, 0x4B, 0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x00
  [System.IO.File]::WriteAllBytes($FilePath, $sample)
}

Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinterHelperW {
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

  public static string SendFile(string printer, string path, string datatype) {
    IntPtr hPrinter;
    if (!OpenPrinter(printer, out hPrinter, IntPtr.Zero)) {
      return "OpenPrinter failed Win32=" + Marshal.GetLastWin32Error();
    }
    DOC_INFO_1 di = new DOC_INFO_1();
    di.pDocName = "ESC POS Test";
    di.pOutputFile = null;
    di.pDatatype = datatype;
    if (!StartDocPrinter(hPrinter, 1, ref di)) {
      int e = Marshal.GetLastWin32Error();
      ClosePrinter(hPrinter);
      return "StartDocPrinter failed Win32=" + e + " datatype=" + datatype;
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

Write-Output ("Testing printer=$PrinterName datatype=$DataType")
Write-Output ([RawPrinterHelperW]::SendFile($PrinterName, $FilePath, $DataType))
