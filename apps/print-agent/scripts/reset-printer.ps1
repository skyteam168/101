$ErrorActionPreference = 'Continue'
$names = @('XP-58', 'Xprinter XP-58', 'XP-58 (副本 1)', 'XP-58 (副本 2)')

foreach ($name in $names) {
  $p = Get-Printer -Name $name -ErrorAction SilentlyContinue
  if (-not $p) { continue }
  Write-Output "==== $name status=$($p.PrinterStatus) jobs=$($p.JobCount) port=$($p.PortName)"
  try {
    Get-PrintJob -PrinterName $name -ErrorAction SilentlyContinue | ForEach-Object {
      Write-Output "  remove job Id=$($_.Id) Doc=$($_.DocumentName) Status=$($_.JobStatus)"
      Remove-PrintJob -InputObject $_ -ErrorAction SilentlyContinue
    }
  } catch {
    Write-Output "  clear jobs err: $($_.Exception.Message)"
  }
}

# Restart spooler usually needs admin; try anyway
try {
  Restart-Service Spooler -Force -ErrorAction Stop
  Write-Output 'Spooler restarted'
} catch {
  Write-Output "Spooler restart denied: $($_.Exception.Message)"
}

Start-Sleep -Seconds 2
foreach ($name in $names) {
  $p = Get-Printer -Name $name -ErrorAction SilentlyContinue
  if ($p) {
    Write-Output "AFTER $name status=$($p.PrinterStatus) jobs=$($p.JobCount)"
  }
}
