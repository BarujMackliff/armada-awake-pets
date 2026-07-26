"use strict";

const fs = require("node:fs");
const path = require("node:path");

const requiredStates = [
  "alert", "working", "walking", "thinking", "success", "error-log",
  "checkpoint", "waiting", "battle-ready", "routing", "blocked", "off-duty"
];

function validateEyeTracking(value) {
  if (!value) return { maxTravel: 0, pupilSize: 0, poses: {} };
  if (typeof value !== "object" || !value.poses || typeof value.poses !== "object") {
    throw new Error("character eyeTracking requires a poses map");
  }
  const poses = {};
  for (const state of requiredStates) {
    const anchors = value.poses[state];
    if (!Array.isArray(anchors)) {
      throw new Error(`character eyeTracking is missing the ${state} pose`);
    }
    poses[state] = anchors.map((anchor) => {
      if (
        !Array.isArray(anchor) ||
        anchor.length !== 2 ||
        !anchor.every(
          (coordinate) =>
            Number.isFinite(Number(coordinate)) &&
            Number(coordinate) >= 0 &&
            Number(coordinate) <= 1
        )
      ) {
        throw new Error(`character eyeTracking has an invalid ${state} anchor`);
      }
      return anchor.map(Number);
    });
  }
  return {
    maxTravel: Math.max(0, Math.min(Number(value.maxTravel) || 0, 8)),
    pupilSize: Math.max(0, Math.min(Number(value.pupilSize) || 0, 12)),
    poses
  };
}

function validateCharacter(character, root) {
  if (!character || typeof character !== "object") throw new Error("character.json must contain an object");
  if (!String(character.name || "").trim()) throw new Error("character.json requires a name");
  if (!character.assets || typeof character.assets !== "object") {
    throw new Error("character.json requires an assets map");
  }
  for (const state of requiredStates) {
    const relative = character.assets[state];
    if (!relative) throw new Error(`character.json is missing the ${state} asset`);
    const full = path.resolve(root, relative);
    if (!full.startsWith(path.resolve(root) + path.sep)) {
      throw new Error(`character asset escapes the repository: ${relative}`);
    }
    if (!fs.existsSync(full)) throw new Error(`character asset does not exist: ${relative}`);
  }
  return {
    name: String(character.name).trim(),
    displayName: String(character.displayName || `${character.name} Awake Pet`).trim(),
    emptyStatus: String(character.emptyStatus || "Waiting for an active session").trim(),
    missionSingular: String(character.missionSingular || "mission").trim(),
    missionPlural: String(character.missionPlural || "missions").trim(),
    eyeTracking: validateEyeTracking(character.eyeTracking),
    assets: character.assets
  };
}

function loadCharacter(root) {
  const file = path.join(root, "character.json");
  return validateCharacter(JSON.parse(fs.readFileSync(file, "utf8")), root);
}

module.exports = { loadCharacter, requiredStates, validateCharacter, validateEyeTracking };
