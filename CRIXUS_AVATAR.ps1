param(
  [ValidateSet("enable", "show", "disable", "hide", "toggle", "quit", "status", "refresh", "pose", "route", "roam", "move-to", "animate", "yield", "size", "install", "uninstall", "install-status", "startup-enable", "startup-disable", "startup-status", "desktop-enable", "desktop-disable", "desktop-status")]
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
$iconPath = Join-Path $PSScriptRoot "assets\crixus.ico"
$installDir = Join-Path $env:LOCALAPPDATA "PRBE\AvatarVanguard"
$agentLauncher = Join-Path $installDir "AvatarVanguard.ps1"
$sentinelScript = Join-Path $installDir "HotkeySentinel.ps1"
$sentinelRuntime = Join-Path $installDir "sentinel-runtime.json"
$startupDir = [Environment]::GetFolderPath("Startup")
$startupShortcut = Join-Path $startupDir "Avatar Vanguard - CRIXUS.lnk"
$desktopDir = [Environment]::GetFolderPath("Desktop")
$desktopShortcut = Join-Path $desktopDir "Avatar Vanguard - CRIXUS.lnk"

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

function Assert-CrixusDependencies {
  if (-not (Test-Path -LiteralPath $electron)) {
    throw "Avatar Vanguard dependencies are not installed. Run npm.cmd install in $PSScriptRoot"
  }
  if (-not (Test-Path -LiteralPath $iconPath)) {
    throw "Avatar Vanguard icon is missing: $iconPath"
  }
}

function Install-CrixusAgentLauncher {
  Assert-CrixusDependencies
  New-Item -ItemType Directory -Path $installDir -Force | Out-Null
  $escapedSource = $PSCommandPath.Replace("'", "''")
  $content = @"
`$source = '$escapedSource'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File `$source @args
exit `$LASTEXITCODE
"@
  [System.IO.File]::WriteAllText(
    $agentLauncher,
    $content,
    [System.Text.UTF8Encoding]::new($false)
  )
}

function Test-CrixusAgentLauncher {
  if (-not (Test-Path -LiteralPath $agentLauncher)) { return $false }
  try {
    $content = Get-Content -LiteralPath $agentLauncher -Raw
    return $content.Contains($PSCommandPath)
  } catch {
    return $false
  }
}

function Install-CrixusHotkeySentinel {
  Install-CrixusAgentLauncher
  $escapedLauncher = $agentLauncher.Replace("'", "''")
  $escapedRuntime = $sentinelRuntime.Replace("'", "''")
  $template = @'
$ErrorActionPreference = "Stop"
$agentLauncher = '__AGENT_LAUNCHER__'
$runtimePath = '__SENTINEL_RUNTIME__'
$mutexName = "Local\AvatarVanguardHotkeySentinel"
$createdNew = $false
$mutex = [System.Threading.Mutex]::new($true, $mutexName, [ref]$createdNew)
if (-not $createdNew) { exit 0 }

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class AvatarVanguardHotkeyNative {
  [StructLayout(LayoutKind.Sequential)]
  public struct Point { public int X; public int Y; }
  [StructLayout(LayoutKind.Sequential)]
  public struct Message {
    public IntPtr Window;
    public uint MessageId;
    public UIntPtr HotkeyId;
    public IntPtr Data;
    public uint Time;
    public Point Cursor;
    public uint Private;
  }
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool RegisterHotKey(IntPtr window, int id, uint modifiers, uint key);
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool UnregisterHotKey(IntPtr window, int id);
  [DllImport("user32.dll")]
  public static extern int GetMessage(out Message message, IntPtr window, uint minimum, uint maximum);
}
"@

function Write-SentinelRuntime([string]$Action, [string]$ErrorText = "") {
  [ordered]@{
    pid = $PID
    running = $true
    shortcuts = @(
      "Ctrl+Shift+A (letter A, double press within 900 ms)",
      "Ctrl+Shift+B (single press)"
    )
    lastAction = $Action
    lastError = $ErrorText
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
  } | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $runtimePath -Encoding UTF8
}

function Show-Avatar {
  Write-SentinelRuntime "Summon requested by persistent hotkey sentinel"
  Start-Process -FilePath "powershell.exe" -WindowStyle Hidden -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-WindowStyle", "Hidden",
    "-File", $agentLauncher,
    "show"
  )
}

$controlAndShift = 0x0006
$registeredA = [AvatarVanguardHotkeyNative]::RegisterHotKey([IntPtr]::Zero, 1, $controlAndShift, 0x41)
$registeredB = [AvatarVanguardHotkeyNative]::RegisterHotKey([IntPtr]::Zero, 2, $controlAndShift, 0x42)
if (-not $registeredA -or -not $registeredB) {
  if ($registeredA) { [AvatarVanguardHotkeyNative]::UnregisterHotKey([IntPtr]::Zero, 1) | Out-Null }
  if ($registeredB) { [AvatarVanguardHotkeyNative]::UnregisterHotKey([IntPtr]::Zero, 2) | Out-Null }
  Write-SentinelRuntime "Hotkey registration failed" "Ctrl+Shift+A or Ctrl+Shift+B is occupied"
  exit 1
}

Write-SentinelRuntime "Persistent hotkey sentinel armed"
$lastLetterAPress = 0L
try {
  $message = New-Object AvatarVanguardHotkeyNative+Message
  while ([AvatarVanguardHotkeyNative]::GetMessage(
    [ref]$message,
    [IntPtr]::Zero,
    0,
    0
  ) -gt 0) {
    if ($message.MessageId -ne 0x0312) { continue }
    $hotkeyId = $message.HotkeyId.ToUInt32()
    if ($hotkeyId -eq 2) {
      Show-Avatar
      continue
    }
    if ($hotkeyId -eq 1) {
      $now = [long]((Get-Date).ToUniversalTime().Ticks / 10000)
      if ($now - $lastLetterAPress -le 900) {
        $lastLetterAPress = 0L
        Show-Avatar
      } else {
        $lastLetterAPress = $now
        Write-SentinelRuntime "Letter A armed; press Ctrl+Shift+A again within 900 ms"
      }
    }
  }
} finally {
  [AvatarVanguardHotkeyNative]::UnregisterHotKey([IntPtr]::Zero, 1) | Out-Null
  [AvatarVanguardHotkeyNative]::UnregisterHotKey([IntPtr]::Zero, 2) | Out-Null
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}
'@
  $content = $template.Replace(
    "__AGENT_LAUNCHER__",
    $escapedLauncher
  ).Replace(
    "__SENTINEL_RUNTIME__",
    $escapedRuntime
  )
  [System.IO.File]::WriteAllText(
    $sentinelScript,
    $content,
    [System.Text.UTF8Encoding]::new($false)
  )
}

function Get-CrixusSentinelState {
  if (-not (Test-Path -LiteralPath $sentinelRuntime)) { return $null }
  try {
    return Get-Content -LiteralPath $sentinelRuntime -Raw | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Test-CrixusSentinel {
  if ($env:OS -ne "Windows_NT") { return $false }
  $state = Get-CrixusSentinelState
  if (-not $state -or -not $state.pid) { return $false }
  try {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$state.pid)" -ErrorAction Stop
    return [bool](
      $process -and
      $process.Name -eq "powershell.exe" -and
      $process.CommandLine -like "*$sentinelScript*"
    )
  } catch {
    return $false
  }
}

function Start-CrixusSentinel {
  if ($env:OS -ne "Windows_NT") { return }
  if (Test-CrixusSentinel) { return }
  Install-CrixusHotkeySentinel
  Start-Process -FilePath "powershell.exe" -WindowStyle Hidden -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-WindowStyle", "Hidden",
    "-File", $sentinelScript
  )
  $deadline = (Get-Date).AddSeconds(8)
  do {
    Start-Sleep -Milliseconds 150
  } until ((Test-CrixusSentinel) -or (Get-Date) -gt $deadline)
  if (-not (Test-CrixusSentinel)) {
    $state = Get-CrixusSentinelState
    $detail = if ($state -and $state.lastError) { ": $($state.lastError)" } else { "" }
    throw "Avatar Vanguard hotkey sentinel did not start$detail"
  }
}

function Stop-CrixusSentinel {
  $state = Get-CrixusSentinelState
  if (-not (Test-CrixusSentinel)) { return }
  Stop-Process -Id ([int]$state.pid) -Force
  $deadline = (Get-Date).AddSeconds(5)
  do {
    Start-Sleep -Milliseconds 100
  } until ((-not (Test-CrixusSentinel)) -or (Get-Date) -gt $deadline)
  if (Test-CrixusSentinel) {
    throw "Avatar Vanguard hotkey sentinel could not be stopped."
  }
}

function Wait-CrixusStopped([int]$Seconds = 20) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  do {
    Start-Sleep -Milliseconds 200
  } until ((-not (Test-CrixusRunning)) -or (Get-Date) -gt $deadline)
  if (Test-CrixusRunning) {
    throw "Avatar Vanguard visible process did not stop within $Seconds seconds."
  }
}

function Ensure-CrixusSentinel {
  if ($env:OS -ne "Windows_NT" -or (Test-CrixusSentinel)) { return }
  if (Test-CrixusRunning) {
    Send-CrixusCommand "quit"
    Wait-CrixusStopped
  }
  Start-CrixusSentinel
}

function Get-CrixusShortcut([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  try {
    $shell = New-Object -ComObject WScript.Shell
    return $shell.CreateShortcut($Path)
  } catch {
    return $null
  }
}

function Test-CrixusShortcut([string]$Path, [string]$ExpectedAction) {
  $shortcut = Get-CrixusShortcut $Path
  if (-not $shortcut) { return $false }
  try {
    $expectedDirectory = [System.IO.Path]::GetFullPath($PSScriptRoot)
    return (
      [System.IO.Path]::GetFullPath($shortcut.WorkingDirectory) -eq $expectedDirectory -and
      $shortcut.Arguments -like "*$agentLauncher*" -and
      $shortcut.Arguments -match "(^|\s)$ExpectedAction(\s|$)" -and
      $shortcut.IconLocation -like "$iconPath,*"
    )
  } catch {
    return $false
  }
}

function Install-CrixusShortcut([string]$Path, [string]$ActionName, [string]$Description) {
  Assert-CrixusDependencies
  Install-CrixusAgentLauncher
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($Path)
  $shortcut.TargetPath = (Get-Command powershell.exe -ErrorAction Stop).Source
  $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$agentLauncher`" $ActionName"
  $shortcut.WorkingDirectory = $PSScriptRoot
  $shortcut.IconLocation = "$iconPath,0"
  $shortcut.Description = $Description
  $shortcut.Save()
  if (-not (Test-CrixusShortcut $Path $ActionName)) {
    throw "Avatar Vanguard shortcut was created but failed verification: $Path"
  }
}

function Remove-CrixusShortcut([string]$Path) {
  if (Test-Path -LiteralPath $Path) {
    Remove-Item -LiteralPath $Path -Force
  }
  if (Test-Path -LiteralPath $Path) {
    throw "Avatar Vanguard shortcut could not be removed: $Path"
  }
}

if ($Action -eq "show") { $Action = "enable" }
if ($Action -eq "hide") { $Action = "disable" }

if ($Action -in @("install-status", "startup-status", "desktop-status")) {
  $status = [pscustomobject]@{
    installed = [bool](
      (Test-CrixusAgentLauncher) -and
      (Test-CrixusSentinel) -and
      (Test-CrixusShortcut $startupShortcut "show") -and
      (Test-CrixusShortcut $desktopShortcut "show")
    )
    agentLauncher = [pscustomobject]@{
      enabled = [bool](Test-CrixusAgentLauncher)
      path = $agentLauncher
    }
    hotkeySentinel = [pscustomobject]@{
      running = [bool](Test-CrixusSentinel)
      script = $sentinelScript
      runtime = $sentinelRuntime
      state = Get-CrixusSentinelState
    }
    startup = [pscustomobject]@{
      enabled = [bool](Test-CrixusShortcut $startupShortcut "show")
      shortcut = $startupShortcut
    }
    desktop = [pscustomobject]@{
      enabled = [bool](Test-CrixusShortcut $desktopShortcut "show")
      shortcut = $desktopShortcut
      icon = $iconPath
    }
    project = $PSScriptRoot
  }
  if ($Action -eq "startup-status") {
    $status.startup | ConvertTo-Json -Depth 3
  } elseif ($Action -eq "desktop-status") {
    $status.desktop | ConvertTo-Json -Depth 3
  } else {
    $status | ConvertTo-Json -Depth 5
  }
  exit 0
}

if ($Action -eq "startup-enable") {
  Install-CrixusShortcut $startupShortcut "show" "Launch Avatar Vanguard - CRIXUS at Windows sign-in"
  Ensure-CrixusSentinel
  "Avatar Vanguard will start with Windows."
  exit 0
}

if ($Action -eq "desktop-enable") {
  Install-CrixusShortcut $desktopShortcut "show" "Show Avatar Vanguard - CRIXUS"
  Ensure-CrixusSentinel
  "Avatar Vanguard desktop launcher installed."
  exit 0
}

if ($Action -eq "startup-disable") {
  Remove-CrixusShortcut $startupShortcut
  "Avatar Vanguard will not start with Windows."
  exit 0
}

if ($Action -eq "desktop-disable") {
  Remove-CrixusShortcut $desktopShortcut
  "Avatar Vanguard desktop launcher removed."
  exit 0
}

if ($Action -eq "install") {
  Install-CrixusShortcut $startupShortcut "show" "Launch Avatar Vanguard - CRIXUS at Windows sign-in"
  Install-CrixusShortcut $desktopShortcut "show" "Show Avatar Vanguard - CRIXUS"
  Ensure-CrixusSentinel
  $Action = "enable"
}

if ($Action -eq "uninstall") {
  Stop-CrixusSentinel
  Remove-CrixusShortcut $startupShortcut
  Remove-CrixusShortcut $desktopShortcut
  foreach ($path in @($sentinelScript, $sentinelRuntime)) {
    if (Test-Path -LiteralPath $path) {
      Remove-Item -LiteralPath $path -Force
    }
  }
  if (Test-Path -LiteralPath $agentLauncher) {
    Remove-Item -LiteralPath $agentLauncher -Force
  }
  if (Test-CrixusAgentLauncher) {
    throw "Avatar Vanguard machine-level agent launcher could not be removed."
  }
  "Avatar Vanguard launchers and persistent hotkey sentinel removed. The application files and current visible process were left intact."
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
      hotkeySentinel = [pscustomobject]@{
        running = [bool](Test-CrixusSentinel)
        state = Get-CrixusSentinelState
      }
      lastAction = $runtime.lastAction
      lastError = $runtime.lastError
      updatedAt = $runtime.updatedAt
    } | ConvertTo-Json -Depth 5
    exit 0
  }
  [pscustomobject]@{
    running = $false
    visible = $false
    sessions = 0
    hotkeySentinel = [pscustomobject]@{
      running = [bool](Test-CrixusSentinel)
      state = Get-CrixusSentinelState
    }
  } | ConvertTo-Json -Depth 5
  exit 1
}

if ($Action -eq "enable") {
  Ensure-CrixusSentinel
}

if ($Action -eq "enable" -and -not (Test-CrixusRunning)) {
  Assert-CrixusDependencies
  if (Test-CrixusSentinel) {
    $env:AVATAR_VANGUARD_EXTERNAL_HOTKEYS = "1"
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
  "quit" { Send-CrixusCommand "quit"; "CRIXUS visible avatar process closing; persistent hotkeys remain armed." }
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
