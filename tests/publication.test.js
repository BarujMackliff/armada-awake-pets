"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const scanner = path.join(root, "scripts", "prepublish-check.js");
const publisher = fs.readFileSync(path.join(root, "SYNC_TO_GITHUB.ps1"), "utf8");

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function runScanner(cwd, extraArgs = []) {
  return spawnSync(process.execPath, [scanner, "--root", cwd, ...extraArgs], {
    cwd,
    encoding: "utf8"
  });
}

function fixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "awake-pet-publication-"));
  git(cwd, ["init"]);
  git(cwd, ["remote", "add", "origin", "https://github.com/BarujMackliff/armada-awake-pets.git"]);
  fs.writeFileSync(path.join(cwd, "README.md"), "# Safe avatar fixture\n");
  return cwd;
}

test("publication boundary accepts only an approved project file", () => {
  const cwd = fixture();
  try {
    const result = runScanner(cwd);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("sealed publisher compares local and remote commits before claiming synchronization", () => {
  assert.match(publisher, /\$localHead = \(& git rev-parse HEAD\)\.Trim\(\)/);
  assert.match(publisher, /\$remoteHead = \(& git rev-parse origin\/main\)\.Trim\(\)/);
  assert.match(publisher, /if \(\$localHead -eq \$remoteHead\)/);
  assert.doesNotMatch(
    publisher,
    /git diff --cached --quiet[\s\S]{0,160}GitHub already matches/
  );
});

test("publication boundary blocks credential files and protected-record paths", () => {
  const cwd = fixture();
  try {
    fs.writeFileSync(path.join(cwd, ".env"), "VALUE=not-a-real-value\n");
    let result = runScanner(cwd);
    assert.notEqual(result.status, 0);
    fs.rmSync(path.join(cwd, ".env"), { force: true });

    fs.mkdirSync(path.join(cwd, "docs"));
    fs.writeFileSync(path.join(cwd, "docs", "client-ledger.txt"), "private\n");
    result = runScanner(cwd);
    assert.notEqual(result.status, 0);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("publication boundary blocks pointer warping and disguised binary files", () => {
  const cwd = fixture();
  try {
    fs.mkdirSync(path.join(cwd, "renderer"));
    fs.writeFileSync(path.join(cwd, "renderer", "app.js"), "SetCursorPos(10, 10);\n");
    let result = runScanner(cwd);
    assert.notEqual(result.status, 0);
    fs.rmSync(path.join(cwd, "renderer", "app.js"), { force: true });

    fs.mkdirSync(path.join(cwd, "assets"));
    fs.writeFileSync(path.join(cwd, "assets", "avatar.png"), "not really an image\n");
    result = runScanner(cwd);
    assert.notEqual(result.status, 0);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("publication boundary accepts a structurally valid Windows icon", () => {
  const cwd = fixture();
  try {
    fs.mkdirSync(path.join(cwd, "assets"));
    const iconHeader = Buffer.from([0, 0, 1, 0, 1, 0]);
    fs.writeFileSync(path.join(cwd, "assets", "crixus.ico"), iconHeader);
    const result = runScanner(cwd);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("publication boundary scans image metadata and removed files in Git history", () => {
  const cwd = fixture();
  try {
    git(cwd, ["config", "user.name", "Awake Pet Test"]);
    git(cwd, ["config", "user.email", "awake-pet-test@example.invalid"]);
    fs.mkdirSync(path.join(cwd, "assets"));
    const validPngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const metadataCredential = Buffer.from(
      ["gh", "p_", "123456789012345678901234567890"].join("")
    );
    fs.writeFileSync(
      path.join(cwd, "assets", "avatar.png"),
      Buffer.concat([validPngHeader, metadataCredential])
    );
    let result = runScanner(cwd);
    assert.notEqual(result.status, 0);
    fs.rmSync(path.join(cwd, "assets", "avatar.png"), { force: true });

    git(cwd, ["add", "README.md"]);
    git(cwd, ["commit", "-m", "safe base"]);
    fs.mkdirSync(path.join(cwd, "docs"));
    fs.writeFileSync(path.join(cwd, "docs", "client-ledger.txt"), "removed later\n");
    git(cwd, ["add", "docs/client-ledger.txt"]);
    git(cwd, ["commit", "-m", "unsafe historical fixture"]);
    fs.rmSync(path.join(cwd, "docs", "client-ledger.txt"));
    git(cwd, ["add", "--all"]);
    git(cwd, ["commit", "-m", "remove fixture"]);
    result = runScanner(cwd, ["--history"]);
    assert.notEqual(result.status, 0);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
