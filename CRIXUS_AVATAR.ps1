param(
  [ValidateSet("enable", "disable", "toggle", "quit", "status", "refresh", "pose", "route", "roam", "move-to", "animate", "yield", "size", "startup-enable", "startup-disable", "startup-status")]
  [string]$Action = "enable",
  [ValidateSet("alert", "working", "walking", "thinking", "success", "error-log", "checkpoint", "waiting", "battle-ready", "routing", "blocked", "off-duty")]
  [string]$Pose = "alert",
  [string]$SessionId = "",
  [string]$AppName = "",
  [ValidateSet("random", "jump", "sword", "scratch", "sit", "patrol-left", "patrol-right", "look", "shield", "sleep")]
  [string]$Motion = "random",
  [ValidateSet("on", "off")]
  [string]$Mode = "on",
  [ValidateSet("small", "medium", "large")]
  [string]$Size = "large",
  [int]$Duration = 5000
)

$ErrorActionPreference = "Stop"
$runtimeDir = Join-Path $env:LOCALAPPDATA "PRBE\CrixusAwakePet"
$runtimePath = Join-Path $runtimeDir "runtime.json"
$commandPath = Join-Path $runtimeDir "command.json"
$electron = Join-Path $PSScriptRoot "node_modules\electron\dist\electron.exe"
$startupDir = [Environment]::GetFolderPath("Startup")
$startupShortcut = Join-Path $startupDir "Avatar Vanguard - CRIXUS.lnk"

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

function Get-CrixusRuntime {
  if (-not (Test-Path -LiteralPath $runtimePath)) { return $null }
  try { return Get-Content -LiteralPath $runtimePath -Raw | ConvertFrom-Json } catch { return $null }
}

function Test-CrixusRunning {
  $runtime = Get-CrixusRuntime
  if (-not $runtime -or -not $runtime.pid) { return $false }
  return [bool](Get-Process -Id ([int]$runtime.pid) -ErrorAction SilentlyContinue)
}

function Send-CrixusCommand([string]$Name, [hashtable]$Extra = @{}) {
  $payload = @{
    action = $Name
    nonce = [guid]::NewGuid().ToString()
    issuedAt = (Get-Date).ToUniversalTime().ToString("o")
  }
  foreach ($key in $Extra.Keys) { $payload[$key] = $Extra[$key] }
  $temporary = "$commandPath.tmp"
  $payload | ConvertTo-Json | Set-Content -LiteralPath $temporary -Encoding UTF8
  Move-Item -LiteralPath $temporary -Destination $commandPath -Force
}

function Get-CrixusStartup {
  if (-not (Test-Path -LiteralPath $startupShortcut)) { return $null }
  try {
    $shell = New-Object -ComObject WScript.Shell
    return $shell.CreateShortcut($startupShortcut)
  } catch {
    return $null
  }
}

function Test-CrixusStartup {
  $shortcut = Get-CrixusStartup
  if (-not $shortcut) { return $false }
  $expectedScript = [System.IO.Path]::GetFullPath($PSCommandPath)
  $expectedDirectory = [System.IO.Path]::GetFullPath($PSScriptRoot)
  return (
    [System.IO.Path]::GetFullPath($shortcut.WorkingDirectory) -eq $expectedDirectory -and
    $shortcut.Arguments -like "*$expectedScript*" -and
    $shortcut.Arguments -match "(^|\s)enable(\s|$)"
  )
}

if ($Action -eq "startup-status") {
  [pscustomobject]@{
    enabled = [bool](Test-CrixusStartup)
    shortcut = $startupShortcut
    project = $PSScriptRoot
  } | ConvertTo-Json -Depth 3
  exit 0
}

if ($Action -eq "startup-enable") {
  if (-not (Test-Path -LiteralPath $electron)) {
    throw "CRIXUS Awake Pet dependencies are not installed. Run npm.cmd install in $PSScriptRoot"
  }
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($startupShortcut)
  $shortcut.TargetPath = (Get-Command powershell.exe -ErrorAction Stop).Source
  $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`" enable"
  $shortcut.WorkingDirectory = $PSScriptRoot
  $shortcut.IconLocation = "$electron,0"
  $shortcut.Description = "Launch Avatar Vanguard - CRIXUS at Windows sign-in"
  $shortcut.Save()
  if (-not (Test-CrixusStartup)) {
    throw "Avatar Vanguard startup shortcut was created but failed verification."
  }
  "Avatar Vanguard will start with Windows."
  exit 0
}

if ($Action -eq "startup-disable") {
  if (Test-Path -LiteralPath $startupShortcut) {
    Remove-Item -LiteralPath $startupShortcut -Force
  }
  if (Test-Path -LiteralPath $startupShortcut) {
    throw "Avatar Vanguard startup shortcut could not be removed."
  }
  "Avatar Vanguard will not start with Windows."
  exit 0
}

if ($Action -eq "status") {
  $runtime = Get-CrixusRuntime
  if (Test-CrixusRunning) {
    [pscustomobject]@{
      running = $true
      visible = [bool]$runtime.visible
      pid = [int]$runtime.pid
      sessions = [int]$runtime.sessionCount
      bounds = $runtime.bounds
      roamEnabled = [bool]$runtime.roamEnabled
      roaming = [bool]$runtime.roaming
      nextRelocationAt = $runtime.nextRelocationAt
      pinnedForSeconds = [int]$runtime.pinnedForSeconds
      systemIdleSeconds = [int]$runtime.systemIdleSeconds
      ghosted = [bool]$runtime.ghosted
      pointerRegion = $runtime.pointerRegion
      size = $runtime.size
      shortcuts = $runtime.shortcuts
      lastAction = $runtime.lastAction
      lastError = $runtime.lastError
      updatedAt = $runtime.updatedAt
    } | ConvertTo-Json -Depth 5
    exit 0
  }
  '{"running":false,"visible":false,"sessions":0}'
  exit 1
}

if ($Action -eq "enable" -and -not (Test-CrixusRunning)) {
  if (-not (Test-Path -LiteralPath $electron)) {
    throw "CRIXUS Awake Pet dependencies are not installed. Run npm.cmd install in $PSScriptRoot"
  }
  Start-Process -FilePath $electron -ArgumentList "." -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
  $deadline = (Get-Date).AddSeconds(15)
  do {
    Start-Sleep -Milliseconds 250
  } until ((Test-CrixusRunning) -or (Get-Date) -gt $deadline)
  if (-not (Test-CrixusRunning)) { throw "CRIXUS Awake Pet did not start within 15 seconds." }
  Send-CrixusCommand "show"
  "CRIXUS avatar enabled."
  exit 0
}

if (-not (Test-CrixusRunning) -and $Action -ne "enable") {
  "CRIXUS avatar is not running."
  exit 1
}

switch ($Action) {
  "enable" { Send-CrixusCommand "show"; "CRIXUS avatar enabled." }
  "disable" { Send-CrixusCommand "hide"; "CRIXUS avatar disabled." }
  "toggle" { Send-CrixusCommand "toggle"; "CRIXUS avatar toggled." }
  "quit" { Send-CrixusCommand "quit"; "CRIXUS avatar process closing." }
  "refresh" { Send-CrixusCommand "refresh"; "CRIXUS sessions refreshed." }
  "route" {
    if ($SessionId -notmatch "^[0-9a-fA-F-]{36}$") { throw "A valid Claude session id is required." }
    Send-CrixusCommand "route" @{ sessionId = $SessionId }
    "CRIXUS routing to session $SessionId"
  }
  "roam" {
    Send-CrixusCommand "roam" @{ enabled = ($Mode -eq "on") }
    "CRIXUS smart relocation: $Mode"
  }
  "move-to" {
    if (-not $AppName.Trim()) { throw "AppName is required, for example: -AppName Obsidian" }
    Send-CrixusCommand "move-to" @{ appName = $AppName.Trim() }
    "CRIXUS moving to a safe edge near $AppName."
  }
  "animate" {
    Send-CrixusCommand "animate" @{ motion = $Motion; duration = [Math]::Max(900, [Math]::Min($Duration, 15000)) }
    "CRIXUS animation: $Motion"
  }
  "size" {
    Send-CrixusCommand "size" @{ size = $Size }
    "CRIXUS avatar size: $Size"
  }
  "yield" {
    Send-CrixusCommand "yield" @{ duration = [Math]::Max(5000, [Math]::Min($Duration, 600000)) }
    "CRIXUS yielding the screen."
  }
  "pose" {
    Send-CrixusCommand "pose" @{ pose = $Pose; duration = [Math]::Max(700, [Math]::Min($Duration, 60000)) }
    "CRIXUS pose: $Pose"
  }
}
