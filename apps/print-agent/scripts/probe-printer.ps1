$names = @('XP-58', 'Xprinter XP-58', 'XP-58 (副本 1)', 'XP-58 (副本 2)')
foreach ($n in $names) {
  try {
    $p = Get-Printer -Name $n -ErrorAction Stop
    Write-Output "FOUND name=$($p.Name) driver=$($p.DriverName) port=$($p.PortName) shared=$($p.Shared)"
  } catch {
    Write-Output "MISS $n"
  }
}

foreach ($port in @('USB001', 'USB002')) {
  try {
    $fs = [System.IO.File]::Open("\\.\$port", [System.IO.FileMode]::Open, [System.IO.FileAccess]::Write)
    Write-Output "$port open OK"
    $fs.Close()
  } catch {
    Write-Output "$port open FAIL: $($_.Exception.Message)"
  }
}
