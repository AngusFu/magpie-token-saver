// 1126-style reverse proxy → bili :8787 (/bili/<wire-url> + client path). Replaces local nginx.

import http from "node:http";
import { URL } from "node:url";

const DEFAULT_LISTEN = 1126;
const DEFAULT_BILI = "http://127.0.0.1:8787";
const DEFAULT_WIRE = "http://127.0.0.1:3425";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "upgrade",
]);

export function resolveSidecarOpts(raw = {}) {
  const wire = String(raw.biliWireTarget || DEFAULT_WIRE)
    .trim()
    .replace(/\/+$/, "");
  const listenPort =
    Number(raw.listenPort) > 0
      ? Number(raw.listenPort)
      : Number(raw.sidecarPort) > 0
        ? Number(raw.sidecarPort)
        : DEFAULT_LISTEN;
  return {
    enabled: raw.sidecar !== false,
    listenPort,
    biliTarget: String(raw.biliTarget || DEFAULT_BILI)
      .trim()
      .replace(/\/+$/, ""),
    wireTarget: wire,
  };
}

/** Same path rewrite as openresty: /bili/http://127.0.0.1:3425 + request_uri */
export function buildBiliProxyPath(clientUrl, wireTarget) {
  const parsed = new URL(clientUrl, "http://127.0.0.1");
  const wire = wireTarget.replace(/\/+$/, "");
  const path = parsed.pathname || "/";
  return `/bili/${wire}${path}${parsed.search}`;
}

export function publicSidecarUrl(opts) {
  const o = resolveSidecarOpts(opts);
  return `http://127.0.0.1:${o.listenPort}`;
}

function proxyHeaders(inHeaders, upstreamHost) {
  const out = { host: upstreamHost };
  for (const [k, v] of Object.entries(inHeaders || {})) {
    if (HOP_BY_HOP.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

export function createBiliSidecarServer(opts) {
  const o = resolveSidecarOpts(opts);
  const bili = new URL(o.biliTarget);
  if (bili.protocol !== "http:") throw new Error("sidecar biliTarget must be http:");
  const biliPort = Number(bili.port) || 8787;
  const biliHost = bili.host;

  return http.createServer((clientReq, clientRes) => {
    const upstreamPath = buildBiliProxyPath(clientReq.url || "/", o.wireTarget);
    const headers = proxyHeaders(clientReq.headers, biliHost);

    const proxyReq = http.request(
      {
        hostname: bili.hostname,
        port: biliPort,
        path: upstreamPath,
        method: clientReq.method,
        headers,
      },
      (proxyRes) => {
        clientRes.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        proxyRes.pipe(clientRes);
      },
    );
    proxyReq.on("error", (err) => {
      if (!clientRes.headersSent) {
        clientRes.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      }
      clientRes.end(`bili sidecar: ${err.message}`);
    });
    clientReq.pipe(proxyReq);
  });
}

let sidecarServer = null;

export async function startBiliSidecar(rawOpts) {
  const opts = resolveSidecarOpts(rawOpts);
  if (!opts.enabled) return { ok: true, skipped: true, reason: "sidecar disabled" };
  if (sidecarServer) {
    return {
      ok: true,
      message: "already listening",
      entry: publicSidecarUrl(opts),
      wire: opts.wireTarget,
      bili: opts.biliTarget,
    };
  }
  const srv = createBiliSidecarServer(opts);
  await new Promise((resolve, reject) => {
    srv.once("error", reject);
    srv.listen(opts.listenPort, "127.0.0.1", () => resolve());
  });
  sidecarServer = srv;
  return {
    ok: true,
    port: opts.listenPort,
    entry: publicSidecarUrl(opts),
    example: `${publicSidecarUrl(opts)}/v1/messages → ${opts.biliTarget}${buildBiliProxyPath("/v1/messages", opts.wireTarget)}`,
    wire: opts.wireTarget,
    bili: opts.biliTarget,
  };
}

export function stopBiliSidecar() {
  if (!sidecarServer) return;
  sidecarServer.close();
  sidecarServer = null;
}

export function biliSidecarStatus(rawOpts) {
  const opts = resolveSidecarOpts(rawOpts);
  return {
    enabled: opts.enabled,
    listening: Boolean(sidecarServer),
    entry: publicSidecarUrl(opts),
    port: opts.listenPort,
    biliTarget: opts.biliTarget,
    wireTarget: opts.wireTarget,
    rewrite: `/bili/<wire> + request_uri (nginx 1126 compatible)`,
  };
}
