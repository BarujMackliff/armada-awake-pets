"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseClaudeProcesses,
  parsePosixClaudeProcesses,
  parseTranscript,
  statusFromAge
} = require("../lib/sessions");

test("extracts resumed Claude session ids and ignores unresumed processes", () => {
  const raw = JSON.stringify([
    { ProcessId: 10, CommandLine: "claude.exe --resume=501f6796-7dbe-468d-8f87-60ec477673ac" },
    { ProcessId: 11, CommandLine: "claude.exe --verbose" }
  ]);
  assert.deepEqual(parseClaudeProcesses(raw), [{
    id: "501f6796-7dbe-468d-8f87-60ec477673ac",
    pid: 10,
    createdAt: null
  }]);
});

test("extracts resumed Claude sessions from macOS and Linux process listings", () => {
  const parsed = parsePosixClaudeProcesses(
    " 4812 claude --resume=501f6796-7dbe-468d-8f87-60ec477673ac\n" +
    " 4813 node unrelated.js\n"
  );
  assert.deepEqual(parsed, [{
    id: "501f6796-7dbe-468d-8f87-60ec477673ac",
    pid: 4812,
    createdAt: null
  }]);
});

test("reads AI title and latest message from JSONL", () => {
  const text = [
    JSON.stringify({ type: "ai-title", aiTitle: "Build the mission router" }),
    JSON.stringify({ type: "assistant", timestamp: "2026-07-26T12:00:00Z", message: { content: [{ type: "text", text: "Routing is ready." }] } })
  ].join("\n");
  assert.deepEqual(parseTranscript(text), {
    title: "Build the mission router",
    summary: "Routing is ready.",
    latestTimestamp: "2026-07-26T12:00:00Z"
  });
});

test("maps activity ages to visible states", () => {
  assert.equal(statusFromAge(5_000).state, "working");
  assert.equal(statusFromAge(60_000).state, "recent");
  assert.equal(statusFromAge(600_000).state, "ready");
});
