"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow, ipcMain, powerMonitor, screen, shell } = require("electron");
const { discoverSessions } = require("./lib/sessions");
const { clampBounds, chooseSafeEdgeTarget } = require("./lib/geometry");
const { buildSessionRoute } = require("./lib/routes");
const { loadCharacter } = require("./lib/character");
const { queryWindow } = require("./lib/windows");

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
let obstructionTimer;
let isExpanded = false;
let isDragging = false;
let isAutoMoving = false;
let dragOrigin = null;
let suppressMoveEventsUntil = 0;
let pointerInteractive = false;
let pointerRegion = "none";
let pointerInsideSince = 0;
let ghosted = false;
let lastAction = "Started";
let lastError = "";
let config;
let character;

const defaultConfig = {
  roamEnabled: true,
  minimumIdleSeconds: 60,
  pinChoicesMinutes: [14, 34, 44],
  nextRelocationAt: 0
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
  const loaded = { ...defaultConfig, ...(readJson(configPath, {}) || {}) };
  loaded.pinChoicesMinutes = Array.isArray(loaded.pinChoicesMinutes)
    ? loaded.pinChoicesMinutes.filter((value) => [14, 34, 44].includes(Number(value)))
    : [...defaultConfig.pinChoicesMinutes];
  if (!loaded.pinChoicesMinutes.length) loaded.pinChoicesMinutes = [...defaultConfig.pinChoicesMinutes];
  return loaded;
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
    nextRelocationAt: config?.nextRelocationAt
      ? new Date(config.nextRelocationAt).toISOString()
      : null,
    pinnedForSeconds: config?.nextRelocationAt
      ? Math.max(0, Math.round((config.nextRelocationAt - Date.now()) / 1000))
      : 0,
    systemIdleSeconds: powerMonitor.getSystemIdleTime(),
    lastAction,
    lastError,
    updatedAt: new Date().toISOString()
  });
}

function nextPinDurationMs() {
  const choices = config.pinChoicesMinutes;
  return choices[Math.floor(Math.random() * choices.length)] * 60_000;
}

function pinPosition(reason = "Position pinned") {
  config.nextRelocationAt = Date.now() + nextPinDurationMs();
  lastAction = reason;
  saveConfig();
  scheduleRoam();
  writeRuntime();
}

function deferRelocation(minutes, reason) {
  config.nextRelocationAt = Date.now() + minutes * 60_000;
  lastAction = reason;
  saveConfig();
  scheduleRoam();
  writeRuntime();
}

function scheduleRoam(delay) {
  clearTimeout(roamTimer);
  if (!config?.roamEnabled) return;
  if (!Number(config.nextRelocationAt) || config.nextRelocationAt <= Date.now()) {
    config.nextRelocationAt = Date.now() + nextPinDurationMs();
    saveConfig();
  }
  const wait = delay ?? Math.max(1000, config.nextRelocationAt - Date.now());
  roamTimer = setTimeout(performRoam, wait);
}

function animateWindowTo(target, duration = 1800) {
  return new Promise((resolve) => {
    if (!win || win.isDestroyed()) return resolve(false);
    const start = win.getBounds();
    const distance = Math.hypot(target.x - start.x, target.y - start.y);
    if (distance < 24) return resolve(false);
    const steps = Math.max(24, Math.min(60, Math.round(distance / 45)));
    const interval = Math.max(24, Math.round(duration / steps));
    let step = 0;
    isAutoMoving = true;
    suppressMoveEventsUntil = Date.now() + duration + 800;
    win.webContents.send("roam-state", { active: true, duration });
    win.webContents.send("force-pose", { name: "walking", duration: duration + 600 });
    writeRuntime();
    clearInterval(roamStepTimer);
    roamStepTimer = setInterval(() => {
      if (!win || win.isDestroyed() || isDragging) {
        clearInterval(roamStepTimer);
        isAutoMoving = false;
        resolve(false);
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
        resolve(true);
      }
    }, interval);
  });
}

async function safeTargetForWindow(windowInfo) {
  const start = { ...win.getBounds(), width: 440, height: 300 };
  const activeRect = {
    x: Number(windowInfo.x),
    y: Number(windowInfo.y),
    width: Number(windowInfo.width),
    height: Number(windowInfo.height)
  };
  const display = screen.getDisplayMatching(activeRect);
  return chooseSafeEdgeTarget(display, screen.getCursorScreenPoint(), start, activeRect);
}

async function performRoam() {
  if (!win || win.isDestroyed() || !win.isVisible() || !config.roamEnabled) return;
  if (isExpanded || isDragging) {
    deferRelocation(2, "Relocation deferred while CRIXUS is being used");
    return;
  }
  const idleSeconds = powerMonitor.getSystemIdleTime();
  if (idleSeconds < Number(config.minimumIdleSeconds || 60)) {
    deferRelocation(2, `Relocation deferred: user active (${idleSeconds}s idle)`);
    return;
  }
  try {
    const foreground = await queryWindow();
    const target = await safeTargetForWindow(foreground);
    const moved = await animateWindowTo(target, 2200);
    pinPosition(
      moved
        ? `Moved to a safe edge of ${foreground.processName}`
        : `Stayed at the safe edge of ${foreground.processName}`
    );
  } catch (error) {
    lastError = String(error.message || error);
    deferRelocation(2, "Relocation deferred after window inspection error");
  }
}

async function moveToNamedApp(appName) {
  if (!win || win.isDestroyed()) return;
  try {
    const targetWindow = await queryWindow(appName);
    const target = await safeTargetForWindow(targetWindow);
    isExpanded = false;
    win.webContents.send("collapse-panel");
    win.setBounds(clampBounds({ ...win.getBounds(), height: 300 }, displaySnapshot()), true);
    await animateWindowTo(target, 1900);
    lastError = "";
    pinPosition(`Moved safely to ${targetWindow.processName}: ${targetWindow.title || appName}`);
    win.webContents.send("run-motion", { name: "look", duration: 2400 });
  } catch (error) {
    lastError = String(error.message || error);
    lastAction = `Could not find open app: ${appName}`;
    win.webContents.send("force-pose", { name: "blocked", duration: 4000 });
    writeRuntime();
  }
}

function setGhosted(next) {
  if (!win || win.isDestroyed() || ghosted === next) return;
  ghosted = next;
  win.setOpacity(next ? 0.16 : 1);
  win.webContents.send("ghost-state", { active: next });
  win.setIgnoreMouseEvents(next, { forward: true });
}

function obstructionGuard() {
  if (!win || win.isDestroyed() || !win.isVisible() || isDragging || isExpanded) {
    pointerInsideSince = 0;
    setGhosted(false);
    return;
  }
  const cursor = screen.getCursorScreenPoint();
  const bounds = win.getBounds();
  const relativeX = cursor.x - bounds.x;
  const relativeY = cursor.y - bounds.y;
  const insideAvatar =
    relativeX >= 95 && relativeX < 345 &&
    relativeY >= 0 && relativeY < 195;
  if (insideAvatar && pointerRegion === "avatar" && powerMonitor.getSystemIdleTime() < 3) {
    if (!pointerInsideSince) pointerInsideSince = Date.now();
    if (Date.now() - pointerInsideSince > 1200) setGhosted(true);
  } else {
    pointerInsideSince = 0;
    setGhosted(false);
  }
}

function applyWindowShape(expanded = isExpanded, heightOverride = null) {
  if (!win || win.isDestroyed() || typeof win.setShape !== "function") return;
  const rectangles = [
    { x: 95, y: 0, width: 250, height: 195 },
    { x: 15, y: 164, width: 410, height: 90 }
  ];
  if (expanded) {
    rectangles.push({
      x: 15,
      y: 246,
      width: 410,
      height: Math.max(80, Number(heightOverride) || win.getBounds().height - 246)
    });
  }
  win.setShape(rectangles);
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
    win.setIgnoreMouseEvents(false);
    applyWindowShape(false);
    win.showInactive();
    writeRuntime();
    refreshSessions();
    scheduleRoam();
    obstructionTimer = setInterval(obstructionGuard, 180);
  });
  win.on("move", () => {
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
  } else if (command.action === "move-to") {
    moveToNamedApp(command.appName);
  } else if (command.action === "animate") {
    win.webContents.send("run-motion", {
      name: command.motion || "random",
      duration: Math.max(900, Math.min(Number(command.duration) || 3000, 15_000))
    });
  } else if (command.action === "yield") {
    const duration = Math.max(5_000, Math.min(Number(command.duration) || 30_000, 10 * 60_000));
    lastAction = `Yielding for ${Math.round(duration / 1000)} seconds`;
    win.webContents.send("force-pose", { name: "off-duty", duration: 700 });
    setTimeout(() => win && !win.isDestroyed() && win.hide(), 500);
    setTimeout(() => {
      if (!win || win.isDestroyed()) return;
      win.showInactive();
      lastAction = "Returned after yielding";
      writeRuntime();
    }, duration);
  } else if (command.action === "roam") {
    config.roamEnabled = Boolean(command.enabled);
    if (config.roamEnabled) {
      isExpanded = false;
      win.webContents.send("collapse-panel");
      const current = win.getBounds();
      win.setBounds(clampBounds({ ...current, height: 300 }, displaySnapshot()), true);
      config.nextRelocationAt = Date.now() + nextPinDurationMs();
      lastAction = "Smart relocation enabled; position pinned until the next long cooldown";
      saveConfig();
      scheduleRoam();
    }
    else {
      clearTimeout(roamTimer);
      clearInterval(roamStepTimer);
      isAutoMoving = false;
      config.nextRelocationAt = 0;
      lastAction = "Window relocation disabled; in-place animations remain active";
      saveConfig();
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
ipcMain.on("window:interactive", (_event, detail) => {
  pointerInteractive = typeof detail === "object" ? Boolean(detail.interactive) : Boolean(detail);
  pointerRegion = typeof detail === "object" ? String(detail.region || "none") : "unknown";
});
ipcMain.on("window:expanded", (_event, expanded) => {
  if (!win || win.isDestroyed()) return;
  isExpanded = Boolean(expanded);
  const current = win.getBounds();
  const desiredHeight = expanded ? Math.min(690, 315 + sessions.length * 68) : 300;
  const next = clampBounds({ ...current, height: desiredHeight }, displaySnapshot());
  win.setBounds(next, true);
  applyWindowShape(isExpanded, desiredHeight - 246);
});
ipcMain.on("drag:start", (_event, point) => {
  if (!win || win.isDestroyed()) return;
  isDragging = true;
  setGhosted(false);
  clearInterval(roamStepTimer);
  clearTimeout(roamTimer);
  isAutoMoving = false;
  dragOrigin = {
    pointerX: Number(point.screenX),
    pointerY: Number(point.screenY),
    bounds: win.getBounds()
  };
  lastAction = "Manual drag started";
  win.webContents.send("roam-state", { active: false });
});
ipcMain.on("drag:move", (_event, point) => {
  if (!win || win.isDestroyed() || !isDragging || !dragOrigin) return;
  suppressMoveEventsUntil = Date.now() + 500;
  win.setPosition(
    Math.round(dragOrigin.bounds.x + Number(point.screenX) - dragOrigin.pointerX),
    Math.round(dragOrigin.bounds.y + Number(point.screenY) - dragOrigin.pointerY),
    false
  );
});
ipcMain.on("drag:end", () => {
  if (!win || win.isDestroyed() || !isDragging) return;
  isDragging = false;
  dragOrigin = null;
  const clamped = clampBounds(win.getBounds(), displaySnapshot());
  suppressMoveEventsUntil = Date.now() + 500;
  win.setBounds(clamped, true);
  saveBounds();
  pinPosition("Manual drop pinned for a long cooldown");
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
  clearInterval(obstructionTimer);
  try {
    fs.unlinkSync(runtimePath);
  } catch {
    // The runtime file is best-effort state, not user data.
  }
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});
