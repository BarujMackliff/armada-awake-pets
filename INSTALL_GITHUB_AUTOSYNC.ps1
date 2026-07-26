$ErrorActionPreference = "Stop"
$taskName = "PRBE CRIXUS Awake Pet GitHub Sync"
$watcher = Join-Path $PSScriptRoot "WATCH_AND_SYNC_GITHUB.ps1"
$arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$watcher`""
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Days 3650)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Safely tests and synchronizes verified CRIXUS Awake Pet changes to GitHub." -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
"GitHub auto-sync installed and running as scheduled task: $taskName"
