# 为 USB001 创建 Generic / Text Only 队列，便于 ESC/POS RAW 静默打印
$ErrorActionPreference = 'Stop'
$port = 'USB001'
$name = 'Restaurant ESC POS'

$existing = Get-Printer -Name $name -ErrorAction SilentlyContinue
if ($existing) {
  Write-Output "ALREADY $name port=$($existing.PortName) driver=$($existing.DriverName)"
  exit 0
}

# Windows 自带 Generic / Text Only
Add-Printer -Name $name -DriverName 'Generic / Text Only' -PortName $port
Write-Output "CREATED $name on $port"
Get-Printer -Name $name | Format-List Name, DriverName, PortName
