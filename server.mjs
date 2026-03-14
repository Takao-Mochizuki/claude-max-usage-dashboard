#!/usr/bin/env node
// Claude Max Usage Dashboard
// Compare usage across multiple Claude Max accounts side by side.
// Usage: node server.mjs

import { createServer } from "http";
import { randomBytes } from "crypto";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 18800;
const CSRF_TOKEN = randomBytes(32).toString("hex");
const CACHE_TTL_MS = 30_000; // 30s cache — avoids redundant API calls

// In-memory cache
let usageCache = null;
let cacheTimestamp = 0;

// Load .env file
function loadEnv() {
  const envPath = join(__dirname, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

// Parse accounts from env vars: C1_TOKEN, C1_LABEL, C2_TOKEN, C2_LABEL, ...
function getAccounts() {
  const accounts = [];
  for (let i = 1; i <= 9; i++) {
    const token = process.env[`C${i}_TOKEN`]?.trim();
    if (!token) continue;
    accounts.push({
      key: `c${i}`,
      label: process.env[`C${i}_LABEL`]?.trim() || `C${i}`,
      token,
    });
  }
  return accounts;
}

async function fetchUsage(token) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1,
      messages: [{ role: "user", content: "." }],
    }),
  });

  if (!res.ok) {
    return { error: true, status: res.status };
  }

  const headers = {};
  for (const [k, v] of res.headers.entries()) {
    if (k.startsWith("anthropic-ratelimit")) headers[k] = v;
  }
  return { error: false, headers };
}

function parseUsage(headers) {
  const get = (key) => headers[`anthropic-ratelimit-unified-${key}`];
  const ts = (v) => (v ? new Date(Number(v) * 1000).toISOString() : null);
  return {
    status: get("status"),
    session: {
      utilization: parseFloat(get("5h-utilization") || "0"),
      resetAt: ts(get("5h-reset")),
      status: get("5h-status"),
    },
    weekly: {
      utilization: parseFloat(get("7d-utilization") || "0"),
      resetAt: ts(get("7d-reset")),
      status: get("7d-status"),
    },
    sonnet: {
      utilization: parseFloat(get("7d_sonnet-utilization") || "0"),
      resetAt: ts(get("7d_sonnet-reset")),
      status: get("7d_sonnet-status"),
    },
    overage: {
      utilization: parseFloat(get("overage-utilization") || "0"),
      status: get("overage-status"),
      disabledReason: get("overage-disabled-reason") || null,
    },
    fallbackPct: parseFloat(get("fallback-percentage") || "0"),
    fetchedAt: new Date().toISOString(),
  };
}

const LOCALHOST_RE = /^(localhost|127\.0\.0\.1)(:\d+)?$/;

function verifyRequest(req) {
  // CSRF token check
  if (req.headers["x-dashboard-csrf"] !== CSRF_TOKEN) return false;
  // Origin check — reject non-localhost origins
  const origin = req.headers["origin"];
  if (origin) {
    try {
      const u = new URL(origin);
      if (!LOCALHOST_RE.test(u.host)) return false;
    } catch { return false; }
  }
  // Host check — reject if Host header is not localhost
  const host = req.headers["host"];
  if (host && !LOCALHOST_RE.test(host)) return false;
  return true;
}

async function getUsageData() {
  // Return cache if fresh
  if (usageCache && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return usageCache;
  }

  const accounts = getAccounts();
  if (accounts.length === 0) {
    return { _error: "No accounts configured. Set C1_TOKEN in .env file." };
  }

  const results = {};
  await Promise.all(
    accounts.map(async (acc) => {
      const raw = await fetchUsage(acc.token);
      if (raw.error) {
        results[acc.key] = { error: `API error (status ${raw.status})`, label: acc.label };
      } else {
        results[acc.key] = { ...parseUsage(raw.headers), label: acc.label };
      }
    })
  );

  usageCache = results;
  cacheTimestamp = Date.now();
  return results;
}

const server = createServer(async (req, res) => {
  if (req.url === "/api/usage") {
    res.setHeader("Content-Type", "application/json");

    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }
    if (!verifyRequest(req)) {
      res.statusCode = 403;
      res.end(JSON.stringify({ error: "Forbidden" }));
      return;
    }

    try {
      const data = await getUsageData();
      if (data._error) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: data._error }));
        return;
      }
      res.end(JSON.stringify(data));
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
    return;
  }

  // Only serve root path
  if (req.url !== "/" && req.url !== "/index.html") {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  const html = readFileSync(join(__dirname, "index.html"), "utf-8")
    .replace("__CSRF_TOKEN__", CSRF_TOKEN);
  res.end(html);
});

server.listen(PORT, "127.0.0.1", () => {
  const accounts = getAccounts();
  console.log(`Claude Max Usage Dashboard: http://localhost:${PORT}`);
  console.log(`Accounts: ${accounts.map((a) => a.label).join(", ") || "(none — set C1_TOKEN in .env)"}`);
});
