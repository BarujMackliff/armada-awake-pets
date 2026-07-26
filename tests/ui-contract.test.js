"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
const renderer = fs.readFileSync(path.join(root, "renderer", "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "renderer", "styles.css"), "utf8");

test("global shortcuts, right-click close, and all three sizes are wired", () => {
  assert.match(main, /CommandOrControl\+Shift\+A/);
  assert.match(main, /CommandOrControl\+Shift\+V/);
  assert.match(main, /Close avatar/);
  for (const size of ["small", "medium", "large"]) assert.match(main, new RegExp(`"${size}"`));
});

test("eyes read the pointer direction without any pointer-warp capability", () => {
  assert.match(main, /screen\.getCursorScreenPoint\(\)/);
  assert.match(renderer, /onGaze/);
  const forbidden = /\b(?:SetCursorPos|SendInput|moveMouse|robotjs|@nut-tree)\b/i;
  assert.doesNotMatch(main, forbidden);
  assert.doesNotMatch(renderer, forbidden);
});

test("renderer navigation and network egress are denied", () => {
  assert.match(main, /setWindowOpenHandler\(\(\) => \(\{ action: "deny" \}\)\)/);
  assert.match(main, /callback\(\{ cancel: true \}\)/);
  assert.match(main, /sandbox: true/);
  assert.match(main, /contextIsolation: true/);
  assert.match(main, /nodeIntegration: false/);
});

test("reduced motion, battery pause, and bounded renderer recovery are wired", () => {
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(main, /powerMonitor\.isOnBatteryPower\(\)/);
  assert.match(renderer, /energy-paused/);
  assert.match(main, /render-process-gone/);
  assert.match(main, /rendererRecoveryTimes\.length > 3/);
  assert.match(main, /renderer-diagnostic\.json/);
});
