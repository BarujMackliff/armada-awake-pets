"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const launcher = fs.readFileSync(path.join(root, "CRIXUS_AVATAR.ps1"), "utf8");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");

test("installation provides hotkeys, Desktop icon, and a machine-level agent command", () => {
  for (const action of [
    "install",
    "uninstall",
    "install-status",
    "startup-enable",
    "startup-disable",
    "startup-status",
    "desktop-enable",
    "desktop-disable",
    "desktop-status"
  ]) {
    assert.match(launcher, new RegExp(`"${action}"`));
  }
  for (const action of ["install", "install-status", "uninstall"]) {
    assert.match(readme, new RegExp(`CRIXUS_AVATAR\\.ps1 ${action}`));
  }
  assert.match(launcher, /\[Environment\]::GetFolderPath\("Startup"\)/);
  assert.match(launcher, /\[Environment\]::GetFolderPath\("Desktop"\)/);
  assert.match(launcher, /Avatar Vanguard - CRIXUS\.lnk/);
  assert.match(launcher, /PRBE\\AvatarVanguard/);
  assert.match(launcher, /AvatarVanguard\.ps1/);
  assert.match(launcher, /assets\\crixus\.ico/);
  assert.match(launcher, /-WindowStyle Hidden/);
  assert.match(launcher, /\$shortcut\.WorkingDirectory = \$PSScriptRoot/);
  assert.match(launcher, /Test-CrixusAgentLauncher/);
  assert.match(launcher, /Test-CrixusShortcut/);
  assert.match(readme, /Desktop launcher with the CRIXUS icon/);
  assert.match(readme, /Any local agent can show the installed avatar/);
});
