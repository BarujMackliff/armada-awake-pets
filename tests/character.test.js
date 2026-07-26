"use strict";

const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadCharacter, requiredStates } = require("../lib/character");

test("loads a complete reusable twelve-state character pack", () => {
  const character = loadCharacter(path.resolve(__dirname, ".."));
  assert.equal(character.name, "CRIXUS");
  assert.deepEqual(Object.keys(character.assets).sort(), [...requiredStates].sort());
  assert.equal(character.eyeTracking.poses.alert.length, 2);
  assert.equal(character.eyeTracking.poses["off-duty"].length, 0);
});
