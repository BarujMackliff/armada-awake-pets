"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");

const SESSION_ID = /--resume(?:=|\s+)([0-9a-f-]{36})/i;
const sessionPathCache = new Map();

function normalizeProcesses(raw) {
  if (!raw || !String(raw).trim()) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function parseClaudeProcesses(raw) {
  return normalizeProcesses(raw)
    .map((process) => {
      const match = String(process.CommandLine || "").match(SESSION_ID);
      if (!match) return null;
      return {
        id: match[1].toLowerCase(),
        pid: Number(process.ProcessId),
        createdAt: process.CreationDate || null
      };
    })
    .filter(Boolean);
}

function findFileRecursive(root, fileName) {
  if (!fs.existsSync(root)) return null;
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) return full;
    }
  }
  return null;
}

function findSessionFile(id, projectsRoot = path.join(os.homedir(), ".claude", "projects")) {
  const cached = sessionPathCache.get(id);
  if (cached && fs.existsSync(cached)) return cached;
  const found = findFileRecursive(projectsRoot, `${id}.jsonl`);
  if (found) sessionPathCache.set(id, found);
  return found;
}

function readTail(filePath, maxBytes = 1024 * 1024) {
  const stat = fs.statSync(filePath);
  const length = Math.min(stat.size, maxBytes);
  const buffer = Buffer.alloc(length);
  const handle = fs.openSync(filePath, "r");
  try {
    fs.readSync(handle, buffer, 0, length, stat.size - length);
  } finally {
    fs.closeSync(handle);
  }
  return { text: buffer.toString("utf8"), stat };
}

function textFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((item) => item && item.type === "text")
    .map((item) => item.text || "")
    .join(" ");
}

function cleanSummary(value) {
  return String(value || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_`>\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 116);
}

function parseTranscript(text) {
  let title = "";
  let summary = "";
  let latestTimestamp = "";
  const lines = String(text || "").split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.type === "ai-title" && entry.aiTitle) title = cleanSummary(entry.aiTitle);
    const messageText = textFromContent(entry.message?.content);
    if ((entry.type === "assistant" || entry.type === "user") && messageText) {
      summary = cleanSummary(messageText);
      latestTimestamp = entry.timestamp || latestTimestamp;
    }
    const stopMessage = entry.attachment?.content;
    if (entry.attachment?.hookName === "Stop" && stopMessage) {
      const match = String(stopMessage).match(/"last_assistant_message":"((?:\\.|[^"])*)"/);
      if (match) {
        try {
          summary = cleanSummary(JSON.parse(`"${match[1]}"`));
        } catch {
          // Keep the last clean message if the embedded JSON is malformed.
        }
      }
    }
  }
  return { title, summary, latestTimestamp };
}

function statusFromAge(ageMs) {
  if (ageMs < 20_000) return { state: "working", label: "Working now" };
  if (ageMs < 120_000) return { state: "recent", label: "Recently active" };
  return { state: "ready", label: "Ready" };
}

function enrichSession(process, now = Date.now()) {
  const transcriptPath = findSessionFile(process.id);
  if (!transcriptPath) {
    return {
      ...process,
      title: "CRIXUS Session",
      summary: "Live Anti-Gravity task",
      state: "ready",
      status: "Ready",
      transcriptPath: null,
      updatedAt: null
    };
  }
  const { text, stat } = readTail(transcriptPath);
  const parsed = parseTranscript(text);
  const status = statusFromAge(now - stat.mtimeMs);
  return {
    ...process,
    title: parsed.title || "CRIXUS Session",
    summary: parsed.summary || status.label,
    state: status.state,
    status: status.label,
    transcriptPath,
    updatedAt: stat.mtime.toISOString()
  };
}

function queryClaudeProcesses() {
  const script = [
    "$ErrorActionPreference='SilentlyContinue';",
    "Get-CimInstance Win32_Process -Filter \"Name='claude.exe'\"",
    "| Select-Object ProcessId,CreationDate,CommandLine",
    "| ConvertTo-Json -Compress -Depth 3"
  ].join(" ");
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true, maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        if (error && !stdout.trim()) return reject(error);
        try {
          resolve(parseClaudeProcesses(stdout));
        } catch (parseError) {
          reject(parseError);
        }
      }
    );
  });
}

async function discoverSessions(now = Date.now()) {
  const processes = await queryClaudeProcesses();
  const unique = new Map();
  for (const process of processes) unique.set(process.id, process);
  return [...unique.values()]
    .map((process) => enrichSession(process, now))
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

module.exports = {
  cleanSummary,
  discoverSessions,
  findSessionFile,
  parseClaudeProcesses,
  parseTranscript,
  statusFromAge
};
