"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow, ipcMain, screen, shell } = require("electron");
const { discoverSessions } = require("./lib/sessions");
const { clampBounds, chooseRoamTarget } = require("./lib/geometry");
const { buildSessionRoute } = require("./lib/routes");
const { loadCharacter } = require("./lib/character");

const localData = process.env.LOCALAPPDATA || app.getPath("userData");
const runtimeDir = path.join(localData, "PRBE", "CrixusAwakePet");
app.setPath("userData", runtimeDir);

const runtimePath = path.join(runtimeDir, "runtime.json");
const commandPath = path.join(runtimeDir, "command.json");
const boundsPath = path.join(runtimeDir, "bounds.json");
const configPath = path.join(runtimeDir, "config.json");

let win;
let sessions = [];
let lastCommandNonce = "";
let scanBusy = false;
let sessionTimer;
let commandTimer;
let forcedPoseTimer;
let roamTimer;
let roamStepTimer;
let boundsWriteTimer;
let isExpanded = false;
let isDragging = false;
let isAutoMoving = false;
let lastManualMoveAt = 0;
let config;
let character;

const defaultConfig = {
  roamEnabled: true,
  roamMinMs: 9000,
  roamMaxMs: 17000,
  crossMonitorChance: 0.24
};

function ensureRuntimeDir() {
  fs.mkdirSync(runtimeDir, { recursive: true });
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureRuntimeDir();
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function displaySnapshot() {
  return screen.getAllDisplays().map(({ id, bounds, workArea, scaleFactor }) => ({
    id,
    bounds,
    workArea,
    scaleFactor
  }));
}

function defaultBounds() {
  const primary = screen.getPrimaryDisplay().workArea;
  return {
    width: 440,
    height: 300,
    x: primary.x + primary.width - 470,
    y: primary.y + primary.height - 330
  };
}

function loadBounds() {
  const saved = readJson(boundsPath, defaultBounds());
  const desired = {
    width: 440,
    height: 300,
    x: Number(saved.x),
    y: Number(saved.y)
  };
  return clampBounds(desired, displaySnapshot());
}

function saveBounds() {
  if (!win || win.isDestroyed()) return;
  writeJson(boundsPath, win.getBounds());
  writeRuntime();
}

function loadConfig() {
  return { ...defaultConfig, ...(readJson(configPath, {}) || {}) };
}

function saveConfig() {
  writeJson(configPath, config);
}

function writeRuntime() {
  if (!win || win.isDestroyed()) return;
  writeJson(runtimePath, {
    pid: process.pid,
    visible: win.isVisible(),
    sessionCount: sessions.length,
    sessions: sessions.map(({ id, pid, title, status, updatedAt }) => ({
      id,
      pid,
      title,
      status,
      updatedAt
    })),
    bounds: win.getBounds(),
    displays: displaySnapshot(),
    roamEnabled: Boolean(config?.roamEnabled),
    roaming: isAutoMoving,
    updatedAt: new Date().toISOString()
  });
}

function scheduleRoam(delay) {
  clearTimeout(roamTimer);
  if (!config?.roamEnabled) return;
  const min = Math.max(5000, Number(config.roamMinMs) || defaultConfig.roamMinMs);
  const max = Math.max(min, Number(config.roamMaxMs) || defaultConfig.roamMaxMs);
  const wait = delay ?? Math.round(min + Math.random() * (max - min));
  roamTimer = setTimeout(performRoam, wait);
}

function performRoam() {
  if (
    !win || win.isDestroyed() || !win.isVisible() || isExpanded || isDragging ||
    Date.now() - lastManualMoveAt < 6000
  ) {
    scheduleRoam(5000);
    return;
  }
  const start = win.getBounds();
  const target = chooseRoamTarget(start, displaySnapshot(), {
    crossMonitorChance: Number(config.crossMonitorChance) || defaultConfig.crossMonitorChance
  });
  const distance = Math.hypot(target.x - start.x, target.y - start.y);
  if (distance < 30) {
    scheduleRoam();
    return;
  }
  const steps = Math.max(24, Math.min(55, Math.round(distance / 55)));
  const duration = Math.max(1400, Math.min(3200, distance * 0.9));
  const interval = Math.max(24, Math.round(duration / steps));
  let step = 0;
  isAutoMoving = true;
  win.webContents.send("roam-state", { active: true, duration });
  win.webContents.send("force-pose", { name: "walking", duration: duration + 500 });
  writeRuntime();
  clearInterval(roamStepTimer);
  roamStepTimer = setInterval(() => {
    if (!win || win.isDestroyed() || isDragging) {
      clearInterval(roamStepTimer);
      isAutoMoving = false;
      scheduleRoam();
      return;
    }
    step += 1;
    const progress = step / steps;
    const eased = progress < 0.5
      ? 2 * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    win.setPosition(
      Math.round(start.x + (target.x - start.x) * eased),
      Math.round(start.y + (target.y - start.y) * eased),
      false
    );
    if (step >= steps) {
      clearInterval(roamStepTimer);
      isAutoMoving = false;
      win.webContents.send("roam-state", { active: false });
      saveBounds();
      scheduleRoam();
    }
  }, interval);
}

function createWindow() {
  const bounds = loadBounds();
  win = new BrowserWindow({
    ...bounds,
    transparent: true,
    frame: false,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setAlwaysOnTop(true, "floating");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  win.once("ready-to-show", () => {
    win.showInactive();
    writeRuntime();
    refreshSessions();
    scheduleRoam(6000);
  });
  win.on("move", () => {
    if (!isAutoMoving) lastManualMoveAt = Date.now();
    clearTimeout(boundsWriteTimer);
    boundsWriteTimer = setTimeout(saveBounds, 240);
  });
  win.on("closed", () => {
    win = null;
  });
}

async function refreshSessions() {
  if (scanBusy || !win || win.isDestroyed()) return;
  scanBusy = true;
  try {
    sessions = await discoverSessions();
    win.webContents.send("sessions", sessions);
    writeRuntime();
  } catch (error) {
    win.webContents.send("scanner-error", String(error.message || error));
  } finally {
    scanBusy = false;
  }
}

function routeToSession(id) {
  let route;
  try {
    route = buildSessionRoute(id);
  } catch {
    return;
  }
  win?.webContents.send("force-pose", { name: "routing", duration: 1800 });
  shell.openExternal(route);
}

function applyCommand(command) {
  if (!command || !win || win.isDestroyed()) return;
  if (command.action === "show") {
    win.showInactive();
    win.setAlwaysOnTop(true, "floating");
  } else if (command.action === "hide") {
    win.webContents.send("force-pose", { name: "off-duty", duration: 900 });
    setTimeout(() => win && !win.isDestroyed() && win.hide(), 700);
  } else if (command.action === "toggle") {
    if (win.isVisible()) win.hide();
    else win.showInactive();
  } else if (command.action === "quit") {
    app.quit();
  } else if (command.action === "pose") {
    const valid = new Set([
      "alert", "working", "walking", "thinking", "success", "error-log",
      "checkpoint", "waiting", "battle-ready", "routing", "blocked", "off-duty"
    ]);
    if (valid.has(command.pose)) {
      clearTimeout(forcedPoseTimer);
      win.showInactive();
      win.webContents.send("force-pose", {
        name: command.pose,
        duration: Math.max(700, Math.min(Number(command.duration) || 5000, 60_000))
      });
    }
  } else if (command.action === "refresh") {
    refreshSessions();
  } else if (command.action === "route") {
    routeToSession(command.sessionId);
  } else if (command.action === "roam") {
    config.roamEnabled = Boolean(command.enabled);
    saveConfig();
    if (config.roamEnabled) {
      isExpanded = false;
      win.webContents.send("collapse-panel");
      const current = win.getBounds();
      win.setBounds(clampBounds({ ...current, height: 300 }, displaySnapshot()), true);
      scheduleRoam(1200);
    }
    else {
      clearTimeout(roamTimer);
      clearInterval(roamStepTimer);
      isAutoMoving = false;
      win.webContents.send("roam-state", { active: false });
    }
  }
  writeRuntime();
}

function pollCommands() {
  const command = readJson(commandPath);
  if (!command || !command.nonce || command.nonce === lastCommandNonce) return;
  lastCommandNonce = command.nonce;
  applyCommand(command);
}

ipcMain.handle("sessions:get", () => sessions);
ipcMain.handle("character:get", () => character);
ipcMain.handle("session:open", (_event, id) => routeToSession(id));
ipcMain.on("window:interactive", (_event, interactive) => {
  if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(!interactive, { forward: true });
});
ipcMain.on("window:expanded", (_event, expanded) => {
  if (!win || win.isDestroyed()) return;
  isExpanded = Boolean(expanded);
  const current = win.getBounds();
  const desiredHeight = expanded ? Math.min(690, 315 + sessions.length * 68) : 300;
  const next = clampBounds({ ...current, height: desiredHeight }, displaySnapshot());
  win.setBounds(next, true);
});
ipcMain.on("window:dragging", (_event, dragging) => {
  isDragging = Boolean(dragging);
  if (isDragging) {
    clearInterval(roamStepTimer);
    isAutoMoving = false;
    win?.webContents.send("roam-state", { active: false });
  } else {
    lastManualMoveAt = Date.now();
    scheduleRoam();
  }
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      win.showInactive();
      win.setAlwaysOnTop(true, "floating");
    }
  });
  app.whenReady().then(() => {
    ensureRuntimeDir();
    config = loadConfig();
    character = loadCharacter(__dirname);
    lastCommandNonce = readJson(commandPath)?.nonce || "";
    createWindow();
    sessionTimer = setInterval(refreshSessions, 3000);
    commandTimer = setInterval(pollCommands, 350);
  });
}

app.on("before-quit", () => {
  clearInterval(sessionTimer);
  clearInterval(commandTimer);
  clearTimeout(forcedPoseTimer);
  clearTimeout(roamTimer);
  clearInterval(roamStepTimer);
  clearTimeout(boundsWriteTimer);
  try {
    fs.unlinkSync(runtimePath);
  } catch {
    // The runtime file is best-effort state, not user data.
  }
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});
