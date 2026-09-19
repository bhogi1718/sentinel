<#
.SYNOPSIS
    Stops and removes the Sentinel Agent Windows Service.

.DESCRIPTION
    Must be run from an elevated (Administrator) PowerShell prompt.
    Does not delete the executable, agent.toml, or log files - only
    unregisters the service itself.
#>

$ErrorActionPreference = "Stop"
$ServiceName = "SentinelAgent"
$HelperTaskName = "SentinelAgentHelper"

$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "This script must be run as Administrator. Right-click PowerShell and choose 'Run as Administrator', then re-run this script."
    exit 1
}

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    if ($existing.Status -eq "Running") {
        Write-Host "Stopping service..." -ForegroundColor Cyan
        Stop-Service -Name $ServiceName -Force
    }
    sc.exe delete $ServiceName | Out-Null
    Write-Host "Service '$ServiceName' removed." -ForegroundColor Green
} else {
    Write-Host "Service '$ServiceName' is not installed." -ForegroundColor Yellow
}

$existingTask = Get-ScheduledTask -TaskName $HelperTaskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Stop-ScheduledTask -TaskName $HelperTaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $HelperTaskName -Confirm:$false
    Write-Host "Helper task '$HelperTaskName' removed." -ForegroundColor Green
    Get-Process -Name "sentinel-agent-helper" -ErrorAction SilentlyContinue | Stop-Process -Force
} else {
    Write-Host "Helper task '$HelperTaskName' is not registered." -ForegroundColor Yellow
}
