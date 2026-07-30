<#
.SYNOPSIS
    Installs and starts the Sentinel Agent as a Windows Service.

.DESCRIPTION
    Must be run from an elevated (Administrator) PowerShell prompt.
    Builds the release binary if it doesn't already exist, registers it as
    a Windows Service that auto-starts on boot, configures automatic
    restart on failure, and starts it immediately.

    Re-running this script after the service is already installed will
    stop, reconfigure, and restart it - safe to use for upgrades.
#>

$ErrorActionPreference = "Stop"

$ServiceName = "SentinelAgent"
$ServiceDisplayName = "Sentinel Agent"
$ServiceDescription = "Reports laptop system events (boot, lock, sleep, network, battery) to the Sentinel backend."

$AgentDir = Split-Path -Parent $PSScriptRoot
$ExePath = Join-Path $AgentDir "target\release\sentinel-agent.exe"
$ConfigSource = Join-Path $AgentDir "agent.toml"
$ConfigDest = Join-Path $AgentDir "target\release\agent.toml"

# Require elevation
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "This script must be run as Administrator. Right-click PowerShell and choose 'Run as Administrator', then re-run this script."
    exit 1
}

if (-not (Test-Path $ConfigSource)) {
    Write-Error "agent.toml not found at $ConfigSource. Copy agent.toml.example to agent.toml and fill in your device token first."
    exit 1
}

if (-not (Test-Path $ExePath)) {
    Write-Host "Release binary not found, building..." -ForegroundColor Yellow
    Push-Location $AgentDir
    cargo build --release
    Pop-Location
    if (-not (Test-Path $ExePath)) {
        Write-Error "Build did not produce $ExePath"
        exit 1
    }
}

Copy-Item $ConfigSource $ConfigDest -Force
Write-Host "Copied agent.toml to $ConfigDest" -ForegroundColor Green

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Service already exists, stopping and removing before reinstall..." -ForegroundColor Yellow
    if ($existing.Status -eq "Running") {
        Stop-Service -Name $ServiceName -Force
    }
    sc.exe delete $ServiceName | Out-Null
    Start-Sleep -Seconds 1
}

Write-Host "Creating service..." -ForegroundColor Cyan
New-Service `
    -Name $ServiceName `
    -BinaryPathName "`"$ExePath`"" `
    -DisplayName $ServiceDisplayName `
    -Description $ServiceDescription `
    -StartupType Automatic

# Configure automatic restart on failure: restart after 5s on 1st and 2nd
# failure, 10s on subsequent failures, reset the failure count after 1 day.
sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/5000/restart/10000 | Out-Null

Write-Host "Starting service..." -ForegroundColor Cyan
Start-Service -Name $ServiceName

Start-Sleep -Seconds 2
$status = Get-Service -Name $ServiceName
Write-Host ""
Write-Host "Service '$ServiceDisplayName' status: $($status.Status)" -ForegroundColor Green
Write-Host "Logs: $AgentDir\target\release\sentinel-agent.log.<date>"
