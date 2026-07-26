"use strict";

const BASE_WIDTH = 440;
const BASE_HEIGHT = 300;

const sizePresets = Object.freeze({
  small: Object.freeze({ name: "small", scale: 0.68, width: 299, height: 204 }),
  medium: Object.freeze({ name: "medium", scale: 0.84, width: 370, height: 252 }),
  large: Object.freeze({ name: "large", scale: 1, width: BASE_WIDTH, height: BASE_HEIGHT })
});

function normalizeSize(value) {
  const key = String(value || "").trim().toLowerCase();
  return sizePresets[key] || sizePresets.large;
}

function scalePixels(value, size) {
  return Math.round(Number(value) * normalizeSize(size).scale);
}

function dimensionsForSize(size, expandedBaseHeight = BASE_HEIGHT) {
  const preset = normalizeSize(size);
  return {
    width: preset.width,
    height: Math.round(Number(expandedBaseHeight) * preset.scale),
    scale: preset.scale,
    name: preset.name
  };
}

module.exports = {
  BASE_HEIGHT,
  BASE_WIDTH,
  dimensionsForSize,
  normalizeSize,
  scalePixels,
  sizePresets
};
