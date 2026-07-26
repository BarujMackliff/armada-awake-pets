$ErrorActionPreference = "Continue"
$repo = $PSScriptRoot
$sync = Join-Path $repo "SYNC_TO_GITHUB.ps1"
$runtimeDir = Join-Path $env:LOCALAPPDATA "PRBE\CrixusAwakePet"
$pidPath = Join-Path $runtimeDir "github-sync.pid"

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$PID | Set-Content -LiteralPath $pidPath -Encoding ascii

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $repo
$watcher.IncludeSubdirectories = $true
$watcher.NotifyFilter = [IO.NotifyFilters]'FileName, DirectoryName, LastWrite, Size'
$watcher.EnableRaisingEvents = $true

function Is-PublishableChange([string]$name) {
  $normalized = $name.Replace('\', '/')
  return (
    $normalized -notmatch '(^|/)\.git(/|$)' -and
    $normalized -notmatch '(^|/)node_modules(/|$)' -and
    $normalized -notmatch '(^|/)work(/|$)' -and
    $normalized -notmatch '\.tmp$'
  )
}

$pending = $false
$lastChange = Get-Date
try {
  while ($true) {
    $change = $watcher.WaitForChanged([IO.WatcherChangeTypes]::All, 2000)
    if (-not $change.TimedOut -and (Is-PublishableChange $change.Name)) {
      $pending = $true
      $lastChange = Get-Date
    }
    if ($pending -and ((Get-Date) - $lastChange).TotalSeconds -ge 8) {
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $sync
      $pending = $false
    }
  }
}
finally {
  $watcher.Dispose()
  Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
}
