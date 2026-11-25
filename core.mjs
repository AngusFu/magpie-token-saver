// Service definitions, health probes, and install hints for the compress stack.

import { spawn } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  chainDiagram,
  installRecipes,
  readBillionContextConfig,
  suggestBiliUpstream,
} from "./config-hints.mjs";

const CONFIG_DIR = join(homedir(), ".config");

export const DEFAULT_SERVICES = [
  {
    id: "magpie",
    name: "Magpie gateway",
    port: 3425,
    healthPath: "/health",
    docsUrl: "https://github.com/magpie-org/magpie",
    installHint:
      "Usually already running with `magpie`. Hub addr is in ~/.config/magpie/gateway.json.",
    binary: "magpie",
    startHint: "Start Magpie from the menu bar / `magpie` CLI (not spawned by this plugin).",
    consoleLinks: [
      { label: "Open gateway (health)", url: "http://127.0.0.1:3425/health" },
      { label: "Magpie UI", url: "http://127.0.0.1:3425" },
    ],
    chainRole: "upstream",
  },
  {
    id: "bili",
    name: "billion-context (bili)",
    port: 8787,
    healthPath: "/health",
    docsUrl: "https://github.com/ranxianglei/billion-context",
    installHint: "npm i -g billion-context  OR  npx billion-context start",
    binary: "billion-context",
    startArgs: ["start", "--port", "8787"],
    consoleLinks: [
      { label: "Health", url: "http://127.0.0.1:8787/health" },
      { label: "GitHub", url: "https://github.com/ranxianglei/billion-context" },
    ],
    chainRole: "context fold (ACP)",
  },
  {
    id: "headroom",
    name: "Headroom proxy",
    port: 8788,
    healthPath: "/health",
    docsUrl: "https://github.com/headroomlabs-ai/headroom",
    installHint: "uv tool install headroom-ai  &&  headroom proxy (set upstream to Magpie)",
    binary: "headroom",
    startArgs: ["proxy", "--port", "8788"],
    consoleLinks: [
      { label: "Health", url: "http://127.0.0.1:8788/health" },
      { label: "Stats", url: "http://127.0.0.1:8788/stats" },
    ],
    chainRole: "large payload compress",
  },
  {
    id: "rtk-proxy",
    name: "RTK llm-proxy",
    port: 8789,
    healthPath: "/health",
    docsUrl: "https://github.com/rtk-ai/rtk",
    installHint:
      "Download `rtk-proxy` binary from RTK releases (not included in `brew install rtk`). See README § rtk llm-proxy.",
    binary: "rtk-proxy",
    startHint: "rtk llm-proxy start  (configure upstream to your bili or Magpie URL)",
    optional: true,
    consoleLinks: [{ label: "RTK repo", url: "https://github.com/rtk-ai/rtk" }],
    chainRole: "tool_result compress (cache-aligned)",
  },
];

export function gatewayUrl() {
  const file = join(CONFIG_DIR, "magpie", "gateway.json");
  if (!existsSync(file)) return null;
  try {
    const addr = JSON.parse(readFileSync(file, "utf8")).addr || "127.0.0.1:3425";
    const base = addr.includes("://") ? addr : `http://${addr}`;
    return base.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function which(bin) {
  return new Promise((resolve) => {
    const p = spawn("sh", ["-c", `command -v ${bin} 2>/dev/null`], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    p.stdout.on("data", (c) => (out += c));
    p.on("close", (code) => resolve(code === 0 && out.trim() ? out.trim() : null));
  });
}

function tcpOpen(host, port, ms = 400) {
  return import("node:net").then(({ connect }) => new Promise((resolve) => {
    const socket = connect({ host, port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.setTimeout(ms);
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(false));
  }));
}

async function httpOk(url, ms = 2500) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return res.ok || res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export async function probeService(def) {
  const healthUrl = `http://127.0.0.1:${def.port}${def.healthPath || ""}`;
  const [portOpen, healthOk, binPath] = await Promise.all([
    tcpOpen("127.0.0.1", def.port),
    def.healthPath ? httpOk(healthUrl) : tcpOpen("127.0.0.1", def.port),
    which(def.binary),
  ]);
  let status = "down";
  if (healthOk) status = "up";
  else if (portOpen) status = "port";
  return { ...def, binPath, portOpen, healthOk, status, healthUrl };
}

export async function probeAll(services = DEFAULT_SERVICES) {
  const rows = await Promise.all(services.map((d) => probeService(d)));
  const gateway = gatewayUrl();
  return {
    gateway,
    services: rows,
    presets: buildPresets(rows),
    claudeEnv: claudeEnvSnippets(rows, gateway),
    chain: chainDiagram(),
    install: installRecipes(),
    billionContext: readBillionContextConfig(),
    suggestBiliUpstream: suggestBiliUpstream(gateway),
  };
}

function buildPresets(rows) {
  const up = (id) => rows.find((r) => r.id === id)?.status === "up";
  return [
    { id: "minimal", title: "Magpie only", description: "No local compress proxies.", ok: up("magpie") },
    {
      id: "bili",
      title: "CC → bili → Magpie",
      description: "Fold long context via billion-context.",
      ok: up("magpie") && up("bili"),
      baseUrl: "http://127.0.0.1:8787",
    },
    {
      id: "rtk-bili",
      title: "CC → RTK → bili → Magpie",
      description: "Tool slim + context fold (recommended balance).",
      ok: up("magpie") && up("bili") && up("rtk-proxy"),
      baseUrl: "http://127.0.0.1:8789",
    },
    {
      id: "full",
      title: "CC → RTK → bili → Headroom → Magpie",
      description: "All layers; highest compress, more cache churn.",
      ok: up("magpie") && up("bili") && up("headroom"),
      baseUrl: "http://127.0.0.1:8789",
      note: "Configure rtk upstream → bili, bili upstream → headroom, headroom → Magpie :3425",
    },
  ];
}

function claudeEnvSnippets(rows, gateway) {
  const magpie = rows.find((r) => r.id === "magpie");
  const bili = rows.find((r) => r.id === "bili");
  const rtk = rows.find((r) => r.id === "rtk-proxy");
  const apiKeyPlaceholder = "magpie";
  return [
    {
      id: "bili-direct",
      title: "Claude Code → bili",
      vars: {
        ANTHROPIC_BASE_URL: "http://127.0.0.1:8787",
        ANTHROPIC_API_KEY: apiKeyPlaceholder,
      },
      ready: Boolean(bili?.healthOk && magpie?.healthOk),
      settingsFile: "~/.claude/settings.json",
    },
    {
      id: "rtk-front",
      title: "Claude Code → RTK proxy",
      vars: {
        ANTHROPIC_BASE_URL: "http://127.0.0.1:8789",
        ANTHROPIC_API_KEY: apiKeyPlaceholder,
      },
      ready: Boolean(rtk?.portOpen && magpie?.portOpen),
      settingsFile: "~/.claude/settings.json",
    },
    {
      id: "magpie-direct",
      title: "Claude Code → Magpie (no saver)",
      vars: {
        ANTHROPIC_BASE_URL: gateway ? `${gateway}` : "http://127.0.0.1:3425",
        ANTHROPIC_API_KEY: apiKeyPlaceholder,
      },
      ready: Boolean(magpie?.healthOk),
    },
  ];
}

const children = new Map();

export async function spawnService(def) {
  if (!def.startArgs?.length) {
    return { ok: false, error: "manual start only", hint: def.startHint || def.installHint };
  }
  const binPath = await which(def.binary);
  if (!binPath) {
    return { ok: false, error: `binary not found: ${def.binary}`, hint: def.installHint };
  }
  if (children.has(def.id)) return { ok: true, message: "already started by this page" };
  const portUp = await tcpOpen("127.0.0.1", def.port);
  if (portUp && def.healthPath) {
    const ok = await httpOk(`http://127.0.0.1:${def.port}${def.healthPath}`);
    if (ok) return { ok: true, message: "already running" };
  }
  try {
    const child = spawn(binPath, def.startArgs, {
      detached: true,
      stdio: "ignore",
      env: process.env,
    });
    child.unref();
    children.set(def.id, child);
    return { ok: true, message: `spawned ${def.binary}` };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

const CLAUDE_SETTINGS = join(homedir(), ".claude", "settings.json");

export function writeClaudePreset(presetId) {
  if (!existsSync(CLAUDE_SETTINGS)) {
    return { ok: false, error: "no ~/.claude/settings.json", hint: "Install Claude Code first" };
  }
  let settings;
  try {
    settings = JSON.parse(readFileSync(CLAUDE_SETTINGS, "utf8"));
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
  const env = settings.env && typeof settings.env === "object" ? { ...settings.env } : {};
  const gw = gatewayUrl() || "http://127.0.0.1:3425";
  if (presetId === "bili-direct") {
    env.ANTHROPIC_BASE_URL = "http://127.0.0.1:8787";
    env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || "magpie";
    delete env.ANTHROPIC_AUTH_TOKEN;
  } else if (presetId === "rtk-front") {
    env.ANTHROPIC_BASE_URL = "http://127.0.0.1:8789";
    env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || "magpie";
    delete env.ANTHROPIC_AUTH_TOKEN;
  } else if (presetId === "magpie-direct") {
    env.ANTHROPIC_BASE_URL = gw.replace(/\/+$/, "");
    env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || "magpie";
    delete env.ANTHROPIC_AUTH_TOKEN;
  } else {
    return { ok: false, error: "unknown preset" };
  }
  const backup = `${CLAUDE_SETTINGS}.bak-${Date.now()}`;
  copyFileSync(CLAUDE_SETTINGS, backup);
  settings.env = env;
  writeFileSync(CLAUDE_SETTINGS, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  return { ok: true, backup, env: { ANTHROPIC_BASE_URL: env.ANTHROPIC_BASE_URL } };
}

export function noteSpawn(def) {
  if (def.startHint) return def.startHint;
  if (def.startArgs?.length) return `${def.binary} ${def.startArgs.join(" ")}`;
  return def.installHint;
}
