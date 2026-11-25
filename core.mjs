// Service definitions, health probes, and install hints for the compress stack.

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  chainDiagram,
  installRecipes,
  readBillionContextConfig,
  suggestBiliUpstream,
} from "./config-hints.mjs";
import { gatewayUrls } from "./gateway-compress.lib.mjs";
import {
  describeChainGaps,
  pickAnthropicUpstream,
  pickMiddlewareStack,
} from "./stack-resolver.mjs";

const CONFIG_DIR = join(homedir(), ".config");

export const MIDDLEWARE_SERVICES = ["magpie", "headroom", "rtk-proxy"];

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
      "brew install rtk → rtk llm-proxy setup (pulls rtk-proxy). Not bundled in brew alone.",
    binary: "rtk",
    binaryAlt: "rtk-proxy",
    startArgs: ["llm-proxy", "start", "--bind", "127.0.0.1:8789"],
    startHint: "Use `rtk llm-proxy start --bind 127.0.0.1:8789` (not bare rtk-proxy unless debugging)",
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
  const binProbe = def.binaryAlt
    ? Promise.all([which(def.binary), which(def.binaryAlt)]).then(([a, b]) => a || b)
    : which(def.binary);
  const [portOpen, healthOk, binPath] = await Promise.all([
    tcpOpen("127.0.0.1", def.port),
    def.healthPath ? httpOk(healthUrl) : tcpOpen("127.0.0.1", def.port),
    binProbe,
  ]);
  let status = "down";
  if (healthOk) status = "up";
  else if (portOpen) status = "port";
  return { ...def, binPath, portOpen, healthOk, status, healthUrl };
}

export async function probeAll(services = DEFAULT_SERVICES) {
  const rows = await Promise.all(services.map((d) => probeService(d)));
  const gateway = gatewayUrl();
  const smart = pickMiddlewareStack(rows, gateway);
  const chainGaps = describeChainGaps(rows);
  return {
    gateway,
    services: rows,
    smartStack: smart,
    chainGaps,
    presets: buildPresets(rows),
    claudeEnv: claudeEnvSnippets(rows, gateway, smart),
    chain: chainDiagram(),
    install: installRecipes(),
    billionContext: readBillionContextConfig(),
    suggestBiliUpstream: suggestBiliUpstream(gateway),
    middlewareMode: true,
    gatewayUrls: { ...gatewayUrls, messagesUrl: gatewayUrls.magpieMessages(gateway || gatewayUrls.anthropicDefault) },
  };
}

function buildPresets(rows) {
  const up = (id) => rows.find((r) => r.id === id)?.status === "up";
  const magpieOk = up("magpie");
  const headroomOk = up("headroom");
  return [
    {
      id: "middleware",
      title: "CC → Magpie + RTK / Headroom middleware",
      description: "固定 :3425。onRequest：RTK-local → RTK HTTP? → Headroom :8788。",
      ok: magpieOk,
    },
    {
      id: "helpers-up",
      title: "Headroom (:8788)",
      description: "Middleware 调 POST /v1/compress。RTK :8789 不必开。",
      ok: magpieOk && headroomOk,
    },
    {
      id: "bili-outside",
      title: "bili（本插件外）",
      description:
        "ACP / compress 等单独接口经 nginx 反代到 :8787；Claude Code 对话仍走 Magpie + billion-context 插件。",
      ok: true,
      note: "见 README · billion-context",
    },
  ];
}

const CLAUDE_SETTINGS = join(homedir(), ".claude", "settings.json");
const MAGPIE_FALLBACK = "http://127.0.0.1:3425";

/** Read-only: Claude Code must stay on Magpie gateway (never rewritten by this plugin). */
export function readClaudeGatewayHint(gateway) {
  const want = (gateway || MAGPIE_FALLBACK).replace(/\/+$/, "");
  let current = null;
  let mismatch = false;
  if (existsSync(CLAUDE_SETTINGS)) {
    try {
      const settings = JSON.parse(readFileSync(CLAUDE_SETTINGS, "utf8"));
      const v = settings?.env?.ANTHROPIC_BASE_URL;
      if (typeof v === "string") {
        current = v.replace(/\/+$/, "");
        mismatch = current !== want;
      }
    } catch {
      /* ignore */
    }
  }
  return {
    id: "magpie-only",
    title: "Claude Code env（只读）",
    ready: !mismatch,
    settingsFile: "~/.claude/settings.json",
    vars: {
      ANTHROPIC_BASE_URL: want,
      ANTHROPIC_API_KEY: "magpie（或你已有的 key，勿改为 8787/8789）",
    },
    current,
    mismatch,
    policy:
      "插件不会、也不应修改 ANTHROPIC_BASE_URL。禁用插件后若仍指向 RTK/bili，请求会挂。",
  };
}

function claudeEnvSnippets(rows, gateway, _smart) {
  const magpie = rows.find((r) => r.id === "magpie");
  const hint = readClaudeGatewayHint(gateway);
  hint.ready = Boolean(magpie?.healthOk) && !hint.mismatch;
  return [hint];
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

/** Deliberately disabled: CC must keep ANTHROPIC_BASE_URL on Magpie (:3425). */
export function writeClaudePreset() {
  return {
    ok: false,
    error: "disabled",
    hint:
      "插件不再写入 ~/.claude/settings.json。请手动把 ANTHROPIC_BASE_URL 设为 Magpie 网关（通常 http://127.0.0.1:3425）。",
  };
}

export async function syncRtkUpstream(rows, gateway) {
  const rtk = rows.find((r) => r.id === "rtk-proxy");
  if (rtk?.status !== "up") {
    return { ok: false, skipped: true, reason: "rtk-proxy not up" };
  }
  const up = pickAnthropicUpstream(rows, gateway);
  if (!up.url) return { ok: false, error: up.reason || "no upstream URL" };
  const bind = `127.0.0.1:${rtk.port}`;
  const rtkCli = (await which("rtk")) || (await which("rtk-proxy"));
  const useRtkCli = Boolean(await which("rtk"));
  const cmd = useRtkCli ? "rtk" : "rtk-proxy";
  const args = useRtkCli
    ? ["llm-proxy", "config", "set", "anthropic_upstream", up.url, "--bind", bind]
    : ["config", "set", "anthropic_upstream", up.url, "--bind", bind];
  if (!rtkCli) return { ok: false, error: "rtk or rtk-proxy not on PATH" };
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stderr.on("data", (c) => (err += c));
    child.on("close", (code) => {
      if (code === 0) resolve({ ok: true, upstream: up.url, degraded: up.degraded });
      else resolve({ ok: false, error: err.trim() || `exit ${code}` });
    });
  });
}

export function noteSpawn(def) {
  if (def.startHint) return def.startHint;
  if (def.startArgs?.length) return `${def.binary} ${def.startArgs.join(" ")}`;
  return def.installHint;
}
