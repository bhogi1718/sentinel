<#
.SYNOPSIS
    Installs and starts the Sentinel Agent as a Windows Service.

.DESCRIPTION
    Must be run from an elevated (Administrator) PowerShell prompt.
    Always rebuilds the release binary from the current source tree, then
    registers it as a Windows Service that auto-starts on boot, configures
    automatic restart on failure, and starts it immediately.

    Re-running this script after the service is already installed will
    stop it first (so the rebuild can overwrite the running exe), then
    rebuild, reconfigure, and restart it - safe to use for upgrades. Do
    not skip the rebuild: a service left pointed at a stale binary can
    silently drift from the checked-out source (this happened once
    already - see README's agent troubleshooting section).

    To add a new device, create a pairing code in the dashboard (Devices >
    Add device) and pass it with -PairingCode and -ServerUrl: the agent
    exchanges it for its token and writes agent.toml itself (creating it if
    needed). Without them, the existing agent.toml is installed as-is.

.EXAMPLE
    .\scripts\install-service.ps1 -PairingCode K7QM-3XRP -ServerUrl https://your-backend.onrender.com
#>

param(
    [string]$PairingCode,
    [string]$ServerUrl
)

$ErrorActionPreference = "Stop"

$ServiceName = "SentinelAgent"
$ServiceDisplayName = "Sentinel Agent"
$ServiceDescription = "Reports laptop system events (boot, lock, sleep, network, battery) to the Sentinel backend."
$HelperTaskName = "SentinelAgentHelper"

$AgentDir = Split-Path -Parent $PSScriptRoot
# target\ may be a junction to a folder outside OneDrive (OneDrive marks its
# folders read-only, which breaks some crates' build scripts). The service
# and the helper task are registered with the real path: Windows can't start
# a service through a junction inside a OneDrive folder ("file not found").
$TargetDir = Join-Path $AgentDir "target"
$targetItem = Get-Item $TargetDir -ErrorAction SilentlyContinue
if ($targetItem -and $targetItem.LinkType) {
    $TargetDir = @($targetItem.Target)[0]
}
$ReleaseDir = Join-Path $TargetDir "release"
$ExePath = Join-Path $ReleaseDir "sentinel-agent.exe"
$HelperExePath = Join-Path $ReleaseDir "sentinel-agent-helper.exe"
$ConfigSource = Join-Path $AgentDir "agent.toml"
$ConfigDest = Join-Path $ReleaseDir "agent.toml"
$InstallDir = Join-Path $env:ProgramFiles "Sentinel Agent"
$InstalledExePath = Join-Path $InstallDir "sentinel-agent.exe"
$InstalledHelperExePath = Join-Path $InstallDir "sentinel-agent-helper.exe"

# Require elevation
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "This script must be run as Administrator. Right-click PowerShell and choose 'Run as Administrator', then re-run this script."
    exit 1
}

if ($PairingCode -and -not $ServerUrl) {
    Write-Error "-PairingCode also needs -ServerUrl (the Sentinel backend, e.g. https://your-backend.onrender.com). The dashboard's Add device dialog shows the full command."
    exit 1
}
if (-not $PairingCode -and -not (Test-Path $ConfigSource)) {
    Write-Error "agent.toml not found at $ConfigSource. Add the device in the dashboard and re-run with the -PairingCode and -ServerUrl it shows."
    exit 1
}

# Removes the installed service and stops the helper. The installed copies
# live in Program Files, so the build below doesn't touch them - this runs
# only once the new binaries are built (and paired), so a failed build or
# pairing leaves the current install running.
function Remove-InstalledAgent {
    $existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "Service already exists, stopping and removing before reinstall..." -ForegroundColor Yellow
        if ($existing.Status -eq "Running") {
            Stop-Service -Name $ServiceName -Force
        }
        sc.exe delete $ServiceName | Out-Null
        Start-Sleep -Seconds 1
    }
    Get-Process -Name "sentinel-agent-helper" -ErrorAction SilentlyContinue | Stop-Process -Force
}

# Older installs ran the service and helper straight from the build folder,
# where they lock the exes the build is about to overwrite.
$legacyService = Get-CimInstance Win32_Service -Filter "Name='$ServiceName'" -ErrorAction SilentlyContinue
if ($legacyService -and $legacyService.PathName -notlike "*$InstallDir*") {
    Remove-InstalledAgent
}
Get-Process -Name "sentinel-agent-helper" -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -and $_.Path -notlike "$InstallDir*" } |
    Stop-Process -Force

Write-Host "Building release binaries..." -ForegroundColor Yellow
Push-Location $AgentDir
cargo build --release
$buildExitCode = $LASTEXITCODE
Pop-Location
# A failed build leaves any previous binary in place, so checking only that
# the exe exists would quietly install that stale one.
if ($buildExitCode -ne 0) {
    Write-Error "cargo build failed (exit code $buildExitCode) - nothing was installed. See the compiler output above."
    exit 1
}
if (-not (Test-Path $ExePath)) {
    Write-Error "Build did not produce $ExePath"
    exit 1
}
if (-not (Test-Path $HelperExePath)) {
    Write-Error "Build did not produce $HelperExePath"
    exit 1
}

if ($PairingCode) {
    # Exchanges the code for this device's token and writes it (with the
    # server URL) into agent.toml, keeping any other settings.
    Write-Host "Pairing with $ServerUrl..." -ForegroundColor Yellow
    & $ExePath pair $PairingCode --server $ServerUrl --config $ConfigSource
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Pairing failed (see above) - nothing was installed."
        exit 1
    }
}

Remove-InstalledAgent

Copy-Item $ConfigSource $ConfigDest -Force
Write-Host "Copied agent.toml to $ConfigDest" -ForegroundColor Green

# The service runs as LocalSystem, so its exe must live where only
# administrators can write - otherwise anything running as the logged-in
# user could replace it and get SYSTEM rights. Program Files is that place.
# The helper is installed there too (it reads agent.toml next to itself);
# it runs as the user and writes its log to %LOCALAPPDATA%\Sentinel Agent.
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item $ExePath $InstalledExePath -Force
Copy-Item $HelperExePath $InstalledHelperExePath -Force
Copy-Item $ConfigSource (Join-Path $InstallDir "agent.toml") -Force
Write-Host "Installed the agent, its helper and agent.toml to $InstallDir" -ForegroundColor Green

Write-Host "Creating service..." -ForegroundColor Cyan
New-Service `
    -Name $ServiceName `
    -BinaryPathName "`"$InstalledExePath`"" `
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
Write-Host "Logs: $InstallDir\sentinel-agent.log.<date>"

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
# Quoted: Task Scheduler splits an unquoted path at its first space (e.g. a
# user folder like C:\Users\Jane Doe) and then reports "file not found".
$action = New-ScheduledTaskAction -Execute "`"$InstalledHelperExePath`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $HelperTaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null

Write-Host "Helper task '$HelperTaskName' registered for $currentUser (starts at next logon)." -ForegroundColor Green
Write-Host "Starting it now for the current session too..." -ForegroundColor Cyan
Start-ScheduledTask -TaskName $HelperTaskName
