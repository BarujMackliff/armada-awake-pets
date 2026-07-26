"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("crixus", {
  getSessions: () => ipcRenderer.invoke("sessions:get"),
  getCharacter: () => ipcRenderer.invoke("character:get"),
  openSession: (id) => ipcRenderer.invoke("session:open", id),
  setInteractive: (interactive) => ipcRenderer.send("window:interactive", interactive),
  setExpanded: (expanded) => ipcRenderer.send("window:expanded", expanded),
  startDrag: (point) => ipcRenderer.send("drag:start", point),
  moveDrag: (point) => ipcRenderer.send("drag:move", point),
  endDrag: () => ipcRenderer.send("drag:end"),
  onSessions: (callback) => ipcRenderer.on("sessions", (_event, sessions) => callback(sessions)),
  onPose: (callback) => ipcRenderer.on("force-pose", (_event, pose) => callback(pose)),
  onRoam: (callback) => ipcRenderer.on("roam-state", (_event, state) => callback(state)),
  onCollapse: (callback) => ipcRenderer.on("collapse-panel", () => callback()),
  onMotion: (callback) => ipcRenderer.on("run-motion", (_event, motion) => callback(motion)),
  onGhost: (callback) => ipcRenderer.on("ghost-state", (_event, state) => callback(state)),
  onGaze: (callback) => ipcRenderer.on("gaze", (_event, state) => callback(state)),
  onPowerState: (callback) => ipcRenderer.on("power-state", (_event, state) => callback(state)),
  onScannerError: (callback) => ipcRenderer.on("scanner-error", (_event, message) => callback(message))
});
