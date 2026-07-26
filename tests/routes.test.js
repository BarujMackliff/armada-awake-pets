"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildSessionRoute } = require("../lib/routes");

test("builds the exact Anti-Gravity Claude Code session route", () => {
  const id = "501f6796-7dbe-468d-8f87-60ec477673ac";
  assert.equal(
    buildSessionRoute(id),
    "antigravity://anthropic.claude-code/open?session=501f6796-7dbe-468d-8f87-60ec477673ac"
  );
});

test("rejects malformed session ids", () => {
  assert.throws(() => buildSessionRoute("../../bad"));
});
