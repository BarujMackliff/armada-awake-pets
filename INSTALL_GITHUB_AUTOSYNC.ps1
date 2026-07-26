$ErrorActionPreference = "Stop"
$taskName = "PRBE CRIXUS Awake Pet GitHub Sync"
$watcher = Join-Path $PSScriptRoot "WATCH_AND_SYNC_GITHUB.ps1"
$arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$watcher`""
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Days 3650)
try {
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Safely tests and synchronizes verified CRIXUS Awake Pet changes to GitHub." -Force | Out-Null
  Start-ScheduledTask -TaskName $taskName
  "GitHub auto-sync installed and running as scheduled task: $taskName"
}
catch {
  $startup = [Environment]::GetFolderPath("Startup")
  $shortcutPath = Join-Path $startup "$taskName.lnk"
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  $shortcut.Arguments = $arguments
  $shortcut.WorkingDirectory = $PSScriptRoot
  $shortcut.WindowStyle = 7
  $shortcut.Description = "Safely synchronize verified CRIXUS Awake Pet changes to GitHub."
  $shortcut.Save()
  Start-Process -FilePath $shortcut.TargetPath -ArgumentList $arguments -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
  "GitHub auto-sync installed in the current-user Startup folder and is running."
}
