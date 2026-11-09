param(
  [string]$PrinterName = 'XP-58'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Printing

$path = Join-Path $env:TEMP 'escpos-probe.bin'
[byte[]]$sample = 0x1B, 0x40
$sample += [System.Text.Encoding]::ASCII.GetBytes("USB RAW OK`n`n`n")
$sample += 0x1D, 0x56, 0x00
[System.IO.File]::WriteAllBytes($path, $sample)
$bytes = [System.IO.File]::ReadAllBytes($path)

$server = New-Object System.Printing.LocalPrintServer
$queue = $server.GetPrintQueue($PrinterName)
Write-Output "Queue=$($queue.FullName) isRaw=$($queue.IsRawOnlyPrint) isXps=$($queue.IsXpsDevice)"

try {
  $job = $queue.AddJob('Restaurant ESC/POS', [System.Printing.PrintTicket]::new(), $false)
} catch {
  Write-Output "AddJob3 failed: $($_.Exception.Message)"
  try {
    $job = $queue.AddJob('Restaurant ESC/POS')
  } catch {
    Write-Output "AddJob1 failed: $($_.Exception.Message)"
    throw
  }
}

$stream = $job.JobStream
$stream.Write($bytes, 0, $bytes.Length)
$stream.Flush()
$stream.Close()
Write-Output "OK job submitted bytes=$($bytes.Length) status=$($job.JobStatus)"
$queue.Dispose()
$server.Dispose()
