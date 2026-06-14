<#
.SYNOPSIS
  Install or update the Zalo Shopee Cashback Bot on a Windows VPS.

.DESCRIPTION
  Run this script from an elevated PowerShell session on the Windows VPS after copying
  the repository to the server. It validates Node.js, creates .env when missing,
  runs the test suite, registers a startup scheduled task, and starts the bot.
#>

param(
  [string]$AppDir = "C:\\zalo-shopee-cashback-bot",
  [string]$TaskName = "ZaloShopeeCashbackBot",
  [int]$Port = 3000,
  [switch]$SkipTests
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Assert-Command([string]$Name, [string]$InstallHint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is required. $InstallHint"
  }
}

$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Please run PowerShell as Administrator so the scheduled task can be created."
}

Assert-Command "node" "Install Node.js LTS from https://nodejs.org/ before running this script."
Assert-Command "npm" "Install Node.js LTS from https://nodejs.org/ before running this script."

$sourceDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Write-Step "Deploying source from $sourceDir to $AppDir"
New-Item -ItemType Directory -Force -Path $AppDir | Out-Null

robocopy $sourceDir $AppDir /MIR /XD .git node_modules /XF "cashback-store.json" | Out-Host
if ($LASTEXITCODE -gt 7) {
  throw "robocopy failed with exit code $LASTEXITCODE"
}
$global:LASTEXITCODE = 0

Push-Location $AppDir
try {
  if (-not (Test-Path ".env")) {
    Write-Step "Creating .env from .env.example"
    Copy-Item ".env.example" ".env"
  }

  Write-Step "Ensuring data directory exists"
  New-Item -ItemType Directory -Force -Path "data" | Out-Null

  if (-not $SkipTests) {
    Write-Step "Running npm test"
    npm test
    if ($LASTEXITCODE -ne 0) { throw "npm test failed" }
  }

  Write-Step "Registering Windows startup task: $TaskName"
  $nodePath = (Get-Command node).Source
  $action = New-ScheduledTaskAction -Execute $nodePath -Argument "src/server.js" -WorkingDirectory $AppDir
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -Force | Out-Null

  Write-Step "Starting bot process now"
  Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $nodePath } | Out-Null
  Start-ScheduledTask -TaskName $TaskName
  Start-Sleep -Seconds 3

  Write-Step "Health check"
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 10
  if (-not $health.ok) { throw "Health check failed" }
  Write-Host "Deploy completed. Health check OK on port $Port." -ForegroundColor Green
  Write-Host "Edit $AppDir\.env with real Zalo/Shopee tokens before enabling live webhook." -ForegroundColor Yellow
}
finally {
  Pop-Location
}
