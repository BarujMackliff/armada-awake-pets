"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeAppName } = require("../lib/windows");

test("normalizes common spoken app names without accepting shell syntax", () => {
  assert.equal(normalizeAppName("OBSIDINNA"), "obsidian");
  assert.equal(normalizeAppName("Google Chrome"), "chrome");
  assert.equal(normalizeAppName("Chrome; Remove-Item"), "chrome remove-item");
});
