"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  powerMonitor,
  screen,
  session: electronSession,
  shell
} = require("electron");
const { discoverSessions } = require("./lib/sessions");
const { clampBounds, chooseSafeEdgeTarget } = require("./lib/geometry");
const { buildSessionRoute } = require("./lib/routes");
const { loadCharacter } = require("./lib/character");
const { queryWindow } = require("./lib/windows");
const {
  BASE_HEIGHT,
  BASE_WIDTH,
  dimensionsForSize,
  normalizeSize,
  scalePixels
} = require("./lib/sizes");

const localData = process.env.LOCALAPPDATA || app.getPath("userData");
const runtimeDir = path.join(localData, "PRBE", "CrixusAwakePet");
app.setPath("userData", runtimeDir);

const runtimePath = path.join(runtimeDir, "runtime.json");
const commandPath = path.join(runtimeDir, "command.json");
const boundsPath = path.join(runtimeDir, "bounds.json");
const configPath = path.join(runtimeDir, "config.json");
const diagnosticPath = path.join(runtimeDir, "renderer-diagnostic.json");

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
let gazeTimer;
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
let batteryPaused = false;
let isQuitting = false;
let rendererRecoveryTimes = [];
const registeredShortcuts = [];

const defaultConfig = {
  roamEnabled: true,
  minimumIdleSeconds: 60,
  pinChoicesMinutes: [14, 34, 44],
  nextRelocationAt: 0,
  size: "large"
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
  const dimensions = dimensionsForSize(config?.size);
  return {
    width: dimensions.width,
    height: dimensions.height,
    x: primary.x + primary.width - dimensions.width - 30,
    y: primary.y + primary.height - dimensions.height - 30
  };
}

function loadBounds() {
  const saved = readJson(boundsPath, defaultBounds());
  const dimensions = dimensionsForSize(config?.size);
  const desired = {
    width: dimensions.width,
    height: dimensions.height,
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
  loaded.size = normalizeSize(loaded.size).name;
  return loaded;
}

function saveConfig() {
  writeJson(configPath, config);
}

function expandedBaseHeight(expanded = isExpanded) {
  return expanded ? Math.min(690, 315 + sessions.length * 68) : BASE_HEIGHT;
}

function currentDimensions(expanded = isExpanded) {
  return dimensionsForSize(config?.size, expandedBaseHeight(expanded));
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
    ghosted,
    pointerRegion,
    pointerInteractive,
    size: normalizeSize(config?.size).name,
    shortcuts: [...registeredShortcuts],
    batteryPaused,
    lastAction,
    lastError,
    updatedAt: new Date().toISOString()
  });
}

function updatePowerState() {
  batteryPaused = powerMonitor.isOnBatteryPower();
  if (win && !win.isDestroyed()) {
    win.webContents.send("power-state", { paused: batteryPaused });
    lastAction = batteryPaused
      ? "In-place animation paused while on battery power"
      : "Full in-place animation restored on AC power";
    writeRuntime();
  }
}

function setAvatarSize(name) {
  if (!win || win.isDestroyed()) return;
  const preset = normalizeSize(name);
  const current = win.getBounds();
  const dimensions = dimensionsForSize(preset.name, expandedBaseHeight());
  config.size = preset.name;
  saveConfig();
  win.webContents.setZoomFactor(preset.scale);
  const resized = clampBounds(
    {
      x: Math.round(current.x + (current.width - dimensions.width) / 2),
      y: Math.round(current.y + (current.height - dimensions.height) / 2),
      width: dimensions.width,
      height: dimensions.height
    },
    displaySnapshot()
  );
  suppressMoveEventsUntil = Date.now() + 600;
  win.setBounds(resized, true);
  applyWindowShape(isExpanded, dimensions.height - scalePixels(246, preset.name));
  lastAction = `Avatar size: ${preset.name}`;
  saveBounds();
  writeRuntime();
}

function closeAvatar() {
  if (!win || win.isDestroyed()) return;
  isExpanded = false;
  win.webContents.send("collapse-panel");
  win.webContents.send("force-pose", { name: "off-duty", duration: 700 });
  lastAction = "Avatar closed; global shortcut remains armed";
  setTimeout(() => {
    if (!win || win.isDestroyed()) return;
    win.hide();
    writeRuntime();
  }, 500);
}

function toggleAvatar() {
  if (!win || win.isDestroyed()) return;
  if (win.isVisible()) closeAvatar();
  else {
    win.showInactive();
    win.setAlwaysOnTop(true, "floating");
    lastAction = "Avatar opened from global shortcut";
    writeRuntime();
  }
}

function showAvatarContextMenu() {
  if (!win || win.isDestroyed()) return;
  const activeSize = normalizeSize(config.size).name;
  const menu = Menu.buildFromTemplate([
    {
      label: "Avatar size",
      submenu: ["small", "medium", "large"].map((name) => ({
        label: name[0].toUpperCase() + name.slice(1),
        type: "radio",
        checked: activeSize === name,
        click: () => setAvatarSize(name)
      }))
    },
    {
      label: "Smart relocation",
      type: "checkbox",
      checked: Boolean(config.roamEnabled),
      click: ({ checked }) => applyCommand({ action: "roam", enabled: checked })
    },
    { type: "separator" },
    {
      label: "Close avatar",
      accelerator: "CommandOrControl+Shift+A",
      click: closeAvatar
    },
    {
      label: "Quit Awake Pet",
      click: () => app.quit()
    }
  ]);
  menu.popup({ window: win });
}

function registerAvatarShortcuts() {
  for (const accelerator of ["CommandOrControl+Shift+A", "CommandOrControl+Shift+V"]) {
    if (globalShortcut.register(accelerator, toggleAvatar)) {
      registeredShortcuts.push(accelerator);
    }
  }
  if (!registeredShortcuts.length) {
    lastError = "Global avatar shortcuts are occupied by another application";
  }
}

function recoverRenderer(createdWindow, details = {}) {
  if (isQuitting || win !== createdWindow) return;
  const now = Date.now();
  rendererRecoveryTimes = rendererRecoveryTimes.filter((stamp) => now - stamp < 60_000);
  rendererRecoveryTimes.push(now);
  const receipt = {
    occurredAt: new Date(now).toISOString(),
    reason: String(details.reason || "unknown"),
    exitCode: Number(details.exitCode || 0),
    recoveryAttempt: rendererRecoveryTimes.length
  };
  writeJson(diagnosticPath, receipt);
  if (rendererRecoveryTimes.length > 3) {
    lastError = "Renderer recovery stopped after three crashes in one minute";
    writeRuntime();
    return;
  }
  lastError = `Renderer ${receipt.reason}; recovering automatically`;
  clearInterval(obstructionTimer);
  clearInterval(gazeTimer);
  obstructionTimer = null;
  gazeTimer = null;
  try {
    createdWindow.destroy();
  } catch {
    // A crashed renderer may already have torn down its native window.
  }
  if (win === createdWindow) win = null;
  setTimeout(() => {
    if (!isQuitting && !win) createWindow();
  }, 750);
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
  const start = win.getBounds();
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
  const scale = normalizeSize(config?.size).scale;
  const relativeX = cursor.x - bounds.x;
  const relativeY = cursor.y - bounds.y;
  const insideAvatar =
    relativeX >= 95 * scale && relativeX < 345 * scale &&
    relativeY >= 0 && relativeY < 195 * scale;
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
  const size = normalizeSize(config?.size).name;
  const rectangles = [
    {
      x: scalePixels(95, size),
      y: 0,
      width: scalePixels(250, size),
      height: scalePixels(195, size)
    },
    {
      x: scalePixels(15, size),
      y: scalePixels(164, size),
      width: scalePixels(410, size),
      height: scalePixels(90, size)
    }
  ];
  if (expanded) {
    rectangles.push({
      x: scalePixels(15, size),
      y: scalePixels(246, size),
      width: scalePixels(410, size),
      height: Math.max(
        scalePixels(80, size),
        Number(heightOverride) || win.getBounds().height - scalePixels(246, size)
      )
    });
  }
  win.setShape(rectangles);
}

function updateGaze() {
  if (!win || win.isDestroyed() || !win.isVisible()) return;
  const cursor = screen.getCursorScreenPoint();
  const bounds = win.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const scale = normalizeSize(config?.size).scale;
  const faceCenter = {
    x: bounds.x + BASE_WIDTH * scale * 0.5,
    y: bounds.y + BASE_HEIGHT * scale * 0.28
  };
  const horizontalRange = Math.max(180, display.workArea.width * 0.24);
  const verticalRange = Math.max(140, display.workArea.height * 0.22);
  win.webContents.send("gaze", {
    x: Math.max(-1, Math.min(1, (cursor.x - faceCenter.x) / horizontalRange)),
    y: Math.max(-1, Math.min(1, (cursor.y - faceCenter.y) / verticalRange))
  });
}

function createWindow() {
  const bounds = loadBounds();
  const createdWindow = new BrowserWindow({
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
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  win = createdWindow;
  createdWindow.webContents.setZoomFactor(normalizeSize(config.size).scale);
  createdWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  createdWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  createdWindow.webContents.on("will-attach-webview", (event) => event.preventDefault());
  createdWindow.webContents.on("context-menu", showAvatarContextMenu);
  createdWindow.webContents.on("render-process-gone", (_event, details) => {
    recoverRenderer(createdWindow, details);
  });
  createdWindow.setAlwaysOnTop(true, "floating");
  createdWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  createdWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  createdWindow.once("ready-to-show", () => {
    if (win !== createdWindow) return;
    createdWindow.setIgnoreMouseEvents(false);
    applyWindowShape(false);
    createdWindow.showInactive();
    writeRuntime();
    refreshSessions();
    scheduleRoam();
    clearInterval(obstructionTimer);
    clearInterval(gazeTimer);
    obstructionTimer = setInterval(obstructionGuard, 180);
    gazeTimer = setInterval(updateGaze, 80);
    updateGaze();
    updatePowerState();
  });
  createdWindow.on("move", () => {
    clearTimeout(boundsWriteTimer);
    boundsWriteTimer = setTimeout(saveBounds, 240);
  });
  createdWindow.on("closed", () => {
    if (win === createdWindow) win = null;
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
    lastAction = "Avatar opened";
  } else if (command.action === "hide") {
    closeAvatar();
  } else if (command.action === "toggle") {
    toggleAvatar();
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
      lastAction = `Pose: ${command.pose}`;
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
  } else if (command.action === "size") {
    setAvatarSize(command.size);
  } else if (command.action === "animate") {
    lastAction = `In-place motion: ${command.motion || "random"}`;
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
      const dimensions = dimensionsForSize(config.size);
      win.setBounds(
        clampBounds({ ...current, width: dimensions.width, height: dimensions.height }, displaySnapshot()),
        true
      );
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
  if (pointerRegion !== "avatar") {
    pointerInsideSince = 0;
    setGhosted(false);
  }
});
ipcMain.on("window:expanded", (_event, expanded) => {
  if (!win || win.isDestroyed()) return;
  isExpanded = Boolean(expanded);
  const current = win.getBounds();
  const dimensions = currentDimensions(isExpanded);
  const next = clampBounds(
    { ...current, width: dimensions.width, height: dimensions.height },
    displaySnapshot()
  );
  win.setBounds(next, true);
  applyWindowShape(isExpanded, dimensions.height - scalePixels(246, config.size));
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
    electronSession.defaultSession.webRequest.onBeforeRequest(
      { urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] },
      (_details, callback) => callback({ cancel: true })
    );
    createWindow();
    registerAvatarShortcuts();
    powerMonitor.on("on-battery", updatePowerState);
    powerMonitor.on("on-ac", updatePowerState);
    sessionTimer = setInterval(refreshSessions, 3000);
    commandTimer = setInterval(pollCommands, 350);
  });
}

app.on("before-quit", () => {
  isQuitting = true;
  clearInterval(sessionTimer);
  clearInterval(commandTimer);
  clearTimeout(forcedPoseTimer);
  clearTimeout(roamTimer);
  clearInterval(roamStepTimer);
  clearTimeout(boundsWriteTimer);
  clearInterval(obstructionTimer);
  clearInterval(gazeTimer);
  powerMonitor.removeListener("on-battery", updatePowerState);
  powerMonitor.removeListener("on-ac", updatePowerState);
  globalShortcut.unregisterAll();
  try {
    fs.unlinkSync(runtimePath);
  } catch {
    // The runtime file is best-effort state, not user data.
  }
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});
