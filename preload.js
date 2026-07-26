"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("crixus", {
  getSessions: () => ipcRenderer.invoke("sessions:get"),
  getCharacter: () => ipcRenderer.invoke("character:get"),
  openSession: (id) => ipcRenderer.invoke("session:open", id),
  setInteractive: (interactive) => ipcRenderer.send("window:interactive", interactive),
  setExpanded: (expanded) => ipcRenderer.send("window:expanded", expanded),
  setDragging: (dragging) => ipcRenderer.send("window:dragging", dragging),
  onSessions: (callback) => ipcRenderer.on("sessions", (_event, sessions) => callback(sessions)),
  onPose: (callback) => ipcRenderer.on("force-pose", (_event, pose) => callback(pose)),
  onRoam: (callback) => ipcRenderer.on("roam-state", (_event, state) => callback(state)),
  onScannerError: (callback) => ipcRenderer.on("scanner-error", (_event, message) => callback(message))
});
