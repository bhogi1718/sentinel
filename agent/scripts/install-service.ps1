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
$HelperTaskName = "SentinelAgentHelper"

$AgentDir = Split-Path -Parent $PSScriptRoot
$ExePath = Join-Path $AgentDir "target\release\sentinel-agent.exe"
$HelperExePath = Join-Path $AgentDir "target\release\sentinel-agent-helper.exe"
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

if (-not (Test-Path $ExePath) -or -not (Test-Path $HelperExePath)) {
    Write-Host "Release binaries not found, building..." -ForegroundColor Yellow
    Push-Location $AgentDir
    cargo build --release
    Pop-Location
    if (-not (Test-Path $ExePath)) {
        Write-Error "Build did not produce $ExePath"
        exit 1
    }
    if (-not (Test-Path $HelperExePath)) {
        Write-Error "Build did not produce $HelperExePath"
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

# The helper runs per-session as the interactive user (not LocalSystem) so
# it has natural, ACL-free access to the interactive desktop for window
# enumeration - see windows_apps.rs for why the service itself can't do
# this directly. A logon-triggered Scheduled Task (not the Run registry
# key) is the standard way to auto-start a per-user process without
# needing the user to be an Administrator or to manually configure
# anything - it's created here while this installer already has an
# elevated session, but runs later as the plain logged-in user.
Write-Host ""
Write-Host "Registering per-session helper task..." -ForegroundColor Cyan

$existingTask = Get-ScheduledTask -TaskName $HelperTaskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Unregister-ScheduledTask -TaskName $HelperTaskName -Confirm:$false
}

$currentUser = "$env:USERDOMAIN\$env:USERNAME"
$action = New-ScheduledTaskAction -Execute $HelperExePath
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $HelperTaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null

Write-Host "Helper task '$HelperTaskName' registered for $currentUser (starts at next logon)." -ForegroundColor Green
Write-Host "Starting it now for the current session too..." -ForegroundColor Cyan
Start-ScheduledTask -TaskName $HelperTaskName
