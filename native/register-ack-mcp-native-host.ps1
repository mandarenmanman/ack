$hostName = "ack_mcp_native_host"
$manifestPath = "D:\github\ack\native\ack_mcp_native_host.json"

New-Item -Path "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName" -Name "(default)" -Value $manifestPath

Write-Host "Registered Native Messaging host '$hostName' -> $manifestPath" -ForegroundColor Green

