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

$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "This script must be run as Administrator. Right-click PowerShell and choose 'Run as Administrator', then re-run this script."
    exit 1
}

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $existing) {
    Write-Host "Service '$ServiceName' is not installed. Nothing to do." -ForegroundColor Yellow
    exit 0
}

if ($existing.Status -eq "Running") {
    Write-Host "Stopping service..." -ForegroundColor Cyan
    Stop-Service -Name $ServiceName -Force
}

sc.exe delete $ServiceName | Out-Null
Write-Host "Service '$ServiceName' removed." -ForegroundColor Green
