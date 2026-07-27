"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const launcher = fs.readFileSync(path.join(root, "CRIXUS_AVATAR.ps1"), "utf8");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");

test("Windows sign-in startup is an explicit, reversible contract", () => {
  for (const action of ["startup-enable", "startup-disable", "startup-status"]) {
    assert.match(launcher, new RegExp(`"${action}"`));
    assert.match(readme, new RegExp(`CRIXUS_AVATAR\\.ps1 ${action}`));
  }
  assert.match(launcher, /\[Environment\]::GetFolderPath\("Startup"\)/);
  assert.match(launcher, /Avatar Vanguard - CRIXUS\.lnk/);
  assert.match(launcher, /-WindowStyle Hidden/);
  assert.match(launcher, /\$shortcut\.WorkingDirectory = \$PSScriptRoot/);
  assert.match(launcher, /Test-CrixusStartup/);
});

