"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  BASE_HEIGHT,
  BASE_WIDTH,
  dimensionsForSize,
  normalizeSize,
  scalePixels
} = require("../lib/sizes");

test("keeps the existing 440 by 300 avatar as the largest size", () => {
  assert.deepEqual(dimensionsForSize("large"), {
    width: BASE_WIDTH,
    height: BASE_HEIGHT,
    scale: 1,
    name: "large"
  });
  assert.ok(dimensionsForSize("small").width < dimensionsForSize("medium").width);
  assert.ok(dimensionsForSize("medium").width < dimensionsForSize("large").width);
});

test("falls back to large and scales expanded geometry consistently", () => {
  assert.equal(normalizeSize("unknown").name, "large");
  assert.equal(dimensionsForSize("medium", 500).height, 420);
  assert.equal(scalePixels(100, "small"), 68);
});
