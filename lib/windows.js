"use strict";

const { execFile } = require("node:child_process");

const aliases = new Map([
  ["obsidinna", "obsidian"],
  ["obsidian", "obsidian"],
  ["google chrome", "chrome"],
  ["chrome", "chrome"],
  ["anti gravity", "antigravity"],
  ["anti-gravity", "antigravity"],
  ["antigravity", "antigravity"]
]);

const windowScript = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class CrixusWindows {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr handle, out RECT rect);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);
}
'@
$target = $env:CRIXUS_TARGET_APP
if ($target) {
  $process = Get-Process | Where-Object {
    $_.MainWindowHandle -ne 0 -and (
      $_.ProcessName -like "*$target*" -or $_.MainWindowTitle -like "*$target*"
    )
  } | Sort-Object StartTime -Descending | Select-Object -First 1
  if (-not $process) { exit 2 }
  $handle = $process.MainWindowHandle
} else {
  $handle = [CrixusWindows]::GetForegroundWindow()
  [uint32]$pidValue = 0
  [CrixusWindows]::GetWindowThreadProcessId($handle, [ref]$pidValue) | Out-Null
  $process = Get-Process -Id $pidValue
}
$rect = New-Object CrixusWindows+RECT
[CrixusWindows]::GetWindowRect($handle, [ref]$rect) | Out-Null
[pscustomobject]@{
  processName = $process.ProcessName
  title = $process.MainWindowTitle
  x = $rect.Left
  y = $rect.Top
  width = $rect.Right - $rect.Left
  height = $rect.Bottom - $rect.Top
} | ConvertTo-Json -Compress
`;

function normalizeAppName(name) {
  const clean = String(name || "").trim().toLowerCase();
  return aliases.get(clean) || clean.replaceAll(/[^a-z0-9 ._-]/g, "");
}

function queryWindow(appName = "") {
  const target = normalizeAppName(appName);
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", windowScript],
      {
        windowsHide: true,
        timeout: 8000,
        env: { ...process.env, CRIXUS_TARGET_APP: target }
      },
      (error, stdout) => {
        if (error || !stdout.trim()) {
          reject(new Error(target ? `No open window matched "${appName}"` : "Foreground window unavailable"));
          return;
        }
        try {
          resolve(JSON.parse(stdout.replace(/^\uFEFF/, "")));
        } catch (parseError) {
          reject(parseError);
        }
      }
    );
  });
}

module.exports = { normalizeAppName, queryWindow };
