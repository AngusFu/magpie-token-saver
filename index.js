// magpie-token-saver: local console for compress proxies (no agent tools).

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_SERVICES,
  gatewayUrl,
  noteSpawn,
  probeAll,
  spawnService,
  syncRtkUpstream,
  writeClaudePreset,
} from "./core.mjs";
import { readBillionContextConfig, suggestBiliUpstream } from "./config-hints.mjs";

const dir = dirname(fileURLToPath(import.meta.url));
const PAGE = join(dir, "page", "index.html");
const DEFAULT_PORT = 48766;

export default async () => ({});

function json(res, code, value) {
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(value));
}

function html(res, code, body) {
  res.writeHead(code, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function page() {
  return readFileSync(PAGE, "utf8");
}

async function body(req) {
  let s = "";
  for await (const chunk of req) s += chunk;
  return s ? JSON.parse(s) : {};
}

function allowOrigin(req) {
  const o = req.headers.origin;
  if (!o) return true;
  if (o === "null") return true;
  const host = req.headers.host || "";
  return o === `http://${host}` || o === `https://${host}`;
}

function cors(req, res) {
  const o = req.headers.origin;
  if (o === "null") res.setHeader("access-control-allow-origin", "null");
  else if (o) res.setHeader("access-control-allow-origin", o);
  if (o) res.setHeader("vary", "Origin");
  res.setHeader("access-control-allow-headers", "content-type");
  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
}

async function handler(req, res) {
  try {
    cors(req, res);
    if (!allowOrigin(req)) return json(res, 403, { error: "origin not allowed" });
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      return html(res, 200, page());
    }
    if (req.method === "GET" && req.url === "/api/state") {
      return json(res, 200, await probeAll());
    }
    if (req.method === "POST" && req.url === "/api/refresh") {
      return json(res, 200, await probeAll());
    }
    if (req.method === "POST" && req.url === "/api/start") {
      const { id } = await body(req);
      const def = DEFAULT_SERVICES.find((s) => s.id === id);
      if (!def) return json(res, 404, { error: "unknown service" });
      const result = await spawnService(def);
      return json(res, 200, { ...(await probeAll()), result, startNote: noteSpawn(def) });
    }
    if (req.method === "POST" && req.url === "/api/claude-preset") {
      const { presetId } = await body(req);
      const state = await probeAll();
      const result = writeClaudePreset(presetId, state);
      return json(res, 200, { ...state, result });
    }
    if (req.method === "POST" && req.url === "/api/rtk-upstream") {
      const state = await probeAll();
      const result = await syncRtkUpstream(state.services, state.gateway);
      return json(res, 200, { ...state, result });
    }
    if (req.method === "GET" && req.url === "/api/bili-config") {
      const gateway = gatewayUrl();
      return json(res, 200, {
        current: readBillionContextConfig(),
        suggest: suggestBiliUpstream(gateway),
      });
    }
    return json(res, 404, { error: "not found" });
  } catch (e) {
    return json(res, 500, { error: String(e?.message || e) });
  }
}

let service = null;

async function listen(port) {
  for (let i = 0; i < 50; i++) {
    const s = await new Promise((resolve) => {
      const srv = createServer(handler);
      srv.once("error", () => resolve(null));
      srv.listen(port, "127.0.0.1", () => resolve(srv));
    });
    if (s) return s;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

export const PageService = async (_input, options) => {
  if (service) return {};
  const port = Number(options?.port) > 0 ? Number(options.port) : DEFAULT_PORT;
  service = await listen(port);
  if (!service) throw new Error(`could not listen on 127.0.0.1:${port}`);
  return {};
};

export { gatewayUrl };
