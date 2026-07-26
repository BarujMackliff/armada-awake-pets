"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
const renderer = fs.readFileSync(path.join(root, "renderer", "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "renderer", "styles.css"), "utf8");
const html = fs.readFileSync(path.join(root, "renderer", "index.html"), "utf8");
const preload = fs.readFileSync(path.join(root, "preload.js"), "utf8");

test("global shortcuts always summon, while right-click closes and sizes remain explicit", () => {
  assert.match(main, /CommandOrControl\+Shift\+A/);
  assert.match(main, /CommandOrControl\+Shift\+V/);
  assert.match(main, /globalShortcut\.register\(accelerator, summonAvatar\)/);
  assert.match(main, /repeated shortcut presses keep it visible/);
  assert.match(main, /webContents\.on\("context-menu", showAvatarContextMenu\)/);
  assert.match(main, /Close avatar/);
  assert.match(main, /click: closeAvatar/);
  for (const size of ["small", "medium", "large"]) assert.match(main, new RegExp(`"${size}"`));
});

test("synthetic moving eyes are absent and pointer-warp capability stays forbidden", () => {
  assert.doesNotMatch(main, /updateGaze|gazeTimer|webContents\.send\("gaze"/);
  assert.doesNotMatch(renderer, /gaze|eyeTracking/);
  assert.doesNotMatch(preload, /onGaze/);
  assert.doesNotMatch(html, /gaze-eyes/);
  assert.doesNotMatch(styles, /gaze-pupil|gaze-eyes/);
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
