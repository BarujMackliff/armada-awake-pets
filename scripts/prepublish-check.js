"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const forbiddenNames = [
  ".env",
  ".env.local",
  "auth.json",
  "credentials.json",
  "id_rsa",
  "id_ed25519"
];
const textExtensions = new Set([
  ".js", ".json", ".md", ".html", ".css", ".ps1", ".cmd", ".yml", ".yaml", ".txt"
]);
const secretPatterns = [
  { name: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  { name: "OpenAI-style key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: "private key", pattern: /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/ },
  {
    name: "assigned secret",
    pattern: /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret)\b\s*[:=]\s*["'][^"']{12,}["']/i
  }
];

function gitFiles() {
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8" }
  );
  return output.split("\0").filter(Boolean);
}

const findings = [];
for (const relative of gitFiles()) {
  const normalized = relative.replaceAll("\\", "/");
  const base = path.basename(relative).toLowerCase();
  if (
    normalized.startsWith(".git/") ||
    normalized.startsWith("node_modules/") ||
    forbiddenNames.includes(base) ||
    /\.(?:pem|p12|pfx|key)$/i.test(base)
  ) {
    if (!normalized.startsWith(".git/") && !normalized.startsWith("node_modules/")) {
      findings.push(`${relative}: forbidden credential filename`);
    }
    continue;
  }
  if (!textExtensions.has(path.extname(relative).toLowerCase())) continue;
  const full = path.join(root, relative);
  if (!fs.existsSync(full) || fs.statSync(full).size > 2 * 1024 * 1024) continue;
  const content = fs.readFileSync(full, "utf8");
  for (const check of secretPatterns) {
    if (check.pattern.test(content)) findings.push(`${relative}: possible ${check.name}`);
  }
}

if (findings.length) {
  process.stderr.write(`Publication blocked:\n${findings.map((item) => `- ${item}`).join("\n")}\n`);
  process.exit(1);
}

process.stdout.write(`Publication safety check passed for ${gitFiles().length} files.\n`);
