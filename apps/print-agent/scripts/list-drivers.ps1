Get-PrinterDriver | Select-Object Name, Manufacturer | Sort-Object Name | Format-Table -AutoSize
Write-Output '---'
Get-PrinterPort | Where-Object { $_.Name -like 'USB*' } | Format-Table Name, Description -AutoSize
