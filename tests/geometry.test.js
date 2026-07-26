"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { clampBounds, chooseRoamTarget } = require("../lib/geometry");

test("keeps the pet inside the selected monitor work area", () => {
  const displays = [{
    bounds: { x: 1000, y: 0, width: 1920, height: 1080 },
    workArea: { x: 1000, y: 0, width: 1920, height: 1040 }
  }];
  assert.deepEqual(
    clampBounds({ x: 2800, y: 1000, width: 440, height: 300 }, displays),
    { x: 2480, y: 740, width: 440, height: 300 }
  );
});

test("chooses a deterministic cross-monitor roaming target inside the destination work area", () => {
  const displays = [
    {
      bounds: { x: 0, y: 0, width: 1000, height: 800 },
      workArea: { x: 0, y: 0, width: 1000, height: 760 }
    },
    {
      bounds: { x: 1000, y: -200, width: 1200, height: 900 },
      workArea: { x: 1000, y: -200, width: 1200, height: 860 }
    }
  ];
  const values = [0, 0, 0.5, 0.5];
  const target = chooseRoamTarget(
    { x: 100, y: 100, width: 440, height: 300 },
    displays,
    { crossMonitorChance: 1, random: () => values.shift(), margin: 20 }
  );
  assert.ok(target.x >= 1000 && target.x + target.width <= 2200);
  assert.ok(target.y >= -200 && target.y + target.height <= 660);
});
