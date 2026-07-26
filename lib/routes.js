"use strict";

function buildSessionRoute(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) throw new Error("Invalid Claude session id");
  return `antigravity://anthropic.claude-code/open?session=${encodeURIComponent(id)}`;
}

module.exports = { buildSessionRoute };
