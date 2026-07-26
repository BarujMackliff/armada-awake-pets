"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const args = process.argv.slice(2);
const rootIndex = args.indexOf("--root");
const root = path.resolve(
  rootIndex >= 0 && args[rootIndex + 1] ? args[rootIndex + 1] : path.resolve(__dirname, "..")
);
const stagedOnly = args.includes("--staged");
const scanHistory = args.includes("--history");

const expectedOrigin = "https://github.com/BarujMackliff/armada-awake-pets.git";
const maxFiles = 120;
const maxTotalBytes = 25 * 1024 * 1024;
const maxTextBytes = 1536 * 1024;
const maxImageBytes = 3 * 1024 * 1024;

const allowedRootFiles = new Set([
  ".gitignore",
  "AGENTS.md",
  "CLAUDE.md",
  "CRIXUS_AVATAR.ps1",
  "DISABLE_CRIXUS_AVATAR.cmd",
  "ENABLE_CRIXUS_AVATAR.cmd",
  "INSTALL_GITHUB_AUTOSYNC.ps1",
  "INSTALL_SECURITY_GATES.ps1",
  "README.md",
  "SECURITY.md",
  "START_GITHUB_AUTOSYNC.cmd",
  "SYNC_TO_GITHUB.ps1",
  "WATCH_AND_SYNC_GITHUB.ps1",
  "character.json",
  "main.js",
  "package-lock.json",
  "package.json",
  "preload.js"
]);
const allowedDirectories = new Set([
  ".githooks",
  ".github",
  "assets",
  "docs",
  "lib",
  "renderer",
  "scripts",
  "tests"
]);
const allowedExtensions = new Set([
  "",
  ".cmd",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jpg",
  ".jpeg",
  ".md",
  ".png",
  ".ps1",
  ".txt",
  ".webp",
  ".yml",
  ".yaml"
]);
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const textExtensions = new Set([
  "",
  ".cmd",
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".ps1",
  ".txt",
  ".yml",
  ".yaml"
]);
const forbiddenFileExtensions = new Set([
  ".7z",
  ".bak",
  ".csv",
  ".db",
  ".doc",
  ".docx",
  ".env",
  ".key",
  ".log",
  ".mov",
  ".mp3",
  ".mp4",
  ".p12",
  ".pdf",
  ".pem",
  ".pfx",
  ".sqlite",
  ".sqlite3",
  ".tar",
  ".xls",
  ".xlsx",
  ".zip"
]);
const forbiddenPathTerms = /(?:^|[\/_. -])(?:auth|backup|browser-profile|client|contact|credential|customer|database|export|financial|invoice|ledger|mail|payment|private|receipt|secret|statement|tax)(?:$|[\/_. -])/i;
const credentialPatterns = [
  { name: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  { name: "OpenAI-style key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/ },
  { name: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{18,}\b/ },
  { name: "Stripe secret", pattern: /\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b/ },
  { name: "private key", pattern: /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/ },
  {
    name: "assigned secret",
    pattern:
      /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|refresh[_-]?token)\b\s*[:=]\s*["'][^"']{12,}["']/i
  },
  { name: "bearer credential", pattern: /\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9._~+/-]{16,}/i }
];
const protectedContentPatterns = [
  { name: "government identity number", pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
  {
    name: "protected financial record terminology",
    pattern:
      /\b(?:consumer report|dispute letter|identity report|tradeline|bureau report|client balance|payment ledger)\b/i
  },
  {
    name: "protected report provider terminology",
    pattern: /\b(?:equifax|experian|transunion|cfpb)\b/i
  },
  {
    name: "bank or account number assignment",
    pattern: /\b(?:account|routing|card)[ _-]?(?:number|no|#)?\s*[:=]\s*\d{6,}\b/i
  },
  {
    name: "private local user path",
    pattern: /(?:[A-Za-z]:\\Users\\[^\\\r\n]+|\/(?:Users|home)\/[^\/\r\n]+)\//i
  }
];
const pointerMutationPatterns = [
  /\bSetCursorPos\b/i,
  /\bSendInput\b/i,
  /\bmoveMouse\b/i,
  /\bmouse\.move\b/i,
  /\brobotjs\b/i,
  /\b@nut-tree\b/i
];

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: options.encoding === null ? null : "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options
  });
}

function normalize(relative) {
  return String(relative || "").replaceAll("\\", "/").replace(/^\.\/+/, "");
}

function splitNull(value) {
  return String(value || "").split("\0").filter(Boolean);
}

function currentFiles() {
  if (stagedOnly) {
    return splitNull(git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]));
  }
  return splitNull(git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]));
}

function currentBuffer(relative) {
  if (stagedOnly) {
    try {
      return git(["show", `:${relative}`], { encoding: null });
    } catch {
      return null;
    }
  }
  const full = path.resolve(root, relative);
  if (!full.startsWith(root + path.sep) || !fs.existsSync(full)) return null;
  const stat = fs.lstatSync(full);
  if (stat.isSymbolicLink()) throw new Error(`${relative}: symbolic links are forbidden`);
  return fs.readFileSync(full);
}

function pathFinding(relative) {
  const clean = normalize(relative);
  const parts = clean.split("/");
  const extension = path.extname(clean).toLowerCase();
  if (!clean || clean.startsWith("../") || path.isAbsolute(clean)) return "path escapes repository";
  if (parts.includes(".git") || parts.includes("node_modules") || parts.includes("work")) {
    return "private/runtime directory is forbidden";
  }
  if (forbiddenFileExtensions.has(extension)) return `forbidden file extension ${extension}`;
  if (forbiddenPathTerms.test(clean)) return "protected-data filename or directory";
  if (!allowedExtensions.has(extension)) return `unapproved file extension ${extension || "(none)"}`;
  if (parts.length === 1) {
    if (!allowedRootFiles.has(clean)) return "unapproved root file";
  } else if (!allowedDirectories.has(parts[0])) {
    return `unapproved top-level directory ${parts[0]}`;
  }
  if (clean.startsWith(".github/workflows/")) return "remote workflows are disabled for this repository";
  return "";
}

function validImageMagic(extension, buffer) {
  if (extension === ".png") {
    return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (extension === ".webp") {
    return buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

function scanBuffer(relative, buffer, sourceLabel, findings) {
  const clean = normalize(relative);
  const extension = path.extname(clean).toLowerCase();
  const pathError = pathFinding(clean);
  if (pathError) findings.push(`${sourceLabel}${clean}: ${pathError}`);
  if (!buffer) return 0;
  const limit = imageExtensions.has(extension) ? maxImageBytes : maxTextBytes;
  if (buffer.length > limit) {
    findings.push(`${sourceLabel}${clean}: file exceeds ${Math.round(limit / 1024)} KB publication limit`);
  }
  if (imageExtensions.has(extension)) {
    if (!validImageMagic(extension, buffer)) {
      findings.push(`${sourceLabel}${clean}: image extension does not match file signature`);
    }
    const metadataText = buffer.toString("latin1");
    for (const check of credentialPatterns) {
      if (check.pattern.test(metadataText)) {
        findings.push(`${sourceLabel}${clean}: possible ${check.name} in image metadata`);
      }
    }
    for (const check of protectedContentPatterns) {
      if (check.pattern.test(metadataText)) {
        findings.push(`${sourceLabel}${clean}: possible ${check.name} in image metadata`);
      }
    }
    return buffer.length;
  }
  if (!textExtensions.has(extension)) return buffer.length;
  if (buffer.includes(0)) {
    findings.push(`${sourceLabel}${clean}: text file contains binary data`);
    return buffer.length;
  }
  const content = buffer.toString("utf8");
  for (const check of credentialPatterns) {
    if (check.pattern.test(content)) findings.push(`${sourceLabel}${clean}: possible ${check.name}`);
  }
  if (clean !== "scripts/prepublish-check.js") {
    for (const check of protectedContentPatterns) {
      if (check.pattern.test(content)) findings.push(`${sourceLabel}${clean}: possible ${check.name}`);
    }
  }
  if (["main.js", "preload.js", "renderer/app.js", "lib/windows.js"].includes(clean)) {
    for (const pattern of pointerMutationPatterns) {
      if (pattern.test(content)) findings.push(`${sourceLabel}${clean}: forbidden pointer-warp capability`);
    }
  }
  return buffer.length;
}

function verifyRepository(findings) {
  let top;
  let origin;
  try {
    top = path.resolve(git(["rev-parse", "--show-toplevel"]).trim());
    origin = git(["remote", "get-url", "origin"]).trim();
  } catch (error) {
    findings.push(`repository verification failed: ${error.message}`);
    return;
  }
  if (top.toLowerCase() !== root.toLowerCase()) findings.push("scanner root is not the Git repository root");
  if (origin !== expectedOrigin) findings.push(`origin is not the approved public repository: ${origin}`);
  const nested = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (fs.existsSync(path.join(full, ".git"))) nested.push(path.relative(root, full));
        else stack.push(full);
      }
    }
  }
  if (nested.length) findings.push(`nested Git repository blocked: ${nested.join(", ")}`);
}

function scanCurrent(findings) {
  const files = currentFiles().map(normalize).sort();
  if (files.length > maxFiles) findings.push(`file count ${files.length} exceeds limit ${maxFiles}`);
  let totalBytes = 0;
  for (const relative of files) {
    try {
      totalBytes += scanBuffer(relative, currentBuffer(relative), "", findings);
    } catch (error) {
      findings.push(`${relative}: ${error.message}`);
    }
  }
  if (totalBytes > maxTotalBytes) {
    findings.push(`publication size ${totalBytes} exceeds ${maxTotalBytes} bytes`);
  }
  return files.length;
}

function scanAllHistory(findings) {
  const commits = git(["rev-list", "--all"]).trim().split(/\r?\n/).filter(Boolean);
  for (const commit of commits) {
    const files = splitNull(git(["ls-tree", "-r", "--name-only", "-z", commit]));
    if (files.length > maxFiles) findings.push(`history ${commit}: file count exceeds ${maxFiles}`);
    let totalBytes = 0;
    for (const relative of files) {
      try {
        const buffer = git(["show", `${commit}:${relative}`], { encoding: null });
        totalBytes += scanBuffer(relative, buffer, `history ${commit.slice(0, 12)}:`, findings);
      } catch (error) {
        findings.push(`history ${commit.slice(0, 12)}:${relative}: ${error.message}`);
      }
    }
    if (totalBytes > maxTotalBytes) {
      findings.push(`history ${commit.slice(0, 12)}: publication size exceeds ${maxTotalBytes} bytes`);
    }
  }
}

const findings = [];
verifyRepository(findings);
const fileCount = scanCurrent(findings);
if (scanHistory) scanAllHistory(findings);

if (findings.length) {
  process.stderr.write(`Publication blocked:\n${findings.map((item) => `- ${item}`).join("\n")}\n`);
  process.exit(1);
}

process.stdout.write(
  `Publication boundary passed: ${fileCount} candidate files; ` +
  `history=${scanHistory ? "checked" : "not-requested"}; source=${stagedOnly ? "staged" : "working-tree"}.\n`
);
