$ErrorActionPreference = 'Stop'
$name = 'XP-58'
$path = Join-Path $env:TEMP 'escpos-probe.bin'
[byte[]]$sample = 0x1B, 0x40
$sample += [System.Text.Encoding]::ASCII.GetBytes("SHARE COPY OK`n`n`n")
$sample += 0x1D, 0x56, 0x00
[System.IO.File]::WriteAllBytes($path, $sample)

$p = Get-Printer -Name $name
Write-Output "Before: Shared=$($p.Shared) ShareName=$($p.ShareName) JobCount=$($p.JobCount) PrinterStatus=$($p.PrinterStatus)"

if (-not $p.Shared) {
  Set-Printer -Name $name -Shared $true -ShareName 'XP58RAW'
  Write-Output 'Shared as XP58RAW'
}

$share = '\\localhost\XP58RAW'
if (-not (Test-Path $share)) {
  # share name may equal printer name when Shared
  $share = "\\localhost\$name"
}
Write-Output "Copy target: $share"
cmd /c "copy /b `"$path`" `"$share`""
Write-Output "cmd exit=$LASTEXITCODE"

Get-PrintJob -PrinterName $name | Format-Table Id, DocumentName, JobStatus, Size -AutoSize
Get-Printer -Name $name | Format-List Name, PrinterStatus, JobCount, Shared, ShareName
