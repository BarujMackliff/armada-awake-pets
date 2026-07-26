param(
  [ValidateSet("enable", "disable", "toggle", "quit", "status", "refresh", "pose", "route", "roam")]
  [string]$Action = "enable",
  [ValidateSet("alert", "working", "walking", "thinking", "success", "error-log", "checkpoint", "waiting", "battle-ready", "routing", "blocked", "off-duty")]
  [string]$Pose = "alert",
  [string]$SessionId = "",
  [ValidateSet("on", "off")]
  [string]$Mode = "on",
  [int]$Duration = 5000
)

$ErrorActionPreference = "Stop"
$runtimeDir = Join-Path $env:LOCALAPPDATA "PRBE\CrixusAwakePet"
$runtimePath = Join-Path $runtimeDir "runtime.json"
$commandPath = Join-Path $runtimeDir "command.json"
$electron = Join-Path $PSScriptRoot "node_modules\electron\dist\electron.exe"

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
    "CRIXUS autonomous roaming: $Mode"
  }
  "pose" {
    Send-CrixusCommand "pose" @{ pose = $Pose; duration = [Math]::Max(700, [Math]::Min($Duration, 60000)) }
    "CRIXUS pose: $Pose"
  }
}
