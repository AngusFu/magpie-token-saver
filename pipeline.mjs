// Magpie onRequest pipeline: mutate one Anthropic body through local + HTTP stages (fail-open).

import { compressAnthropicBody, resolveOpts } from "./gateway-compress.lib.mjs";

const DEFAULT_TIMEOUT = 12000;

export function resolvePipelineOpts(raw = {}) {
  const base = resolveOpts(raw);
  return {
    ...base,
    pipeline: raw.pipeline !== false,
    rtkUrl: (raw.rtkUrl || "http://127.0.0.1:8789").replace(/\/+$/, ""),
    headroomUrl: (raw.headroomUrl || "http://127.0.0.1:8788").replace(/\/+$/, ""),
    biliUrl: (raw.biliUrl || "http://127.0.0.1:8787").replace(/\/+$/, ""),
    biliTransformPath: raw.biliTransformPath || "/v1/compress",
    headroomTimeoutMs: Math.min(60000, Math.max(1000, Number(raw.headroomTimeoutMs) || DEFAULT_TIMEOUT)),
    rtkTimeoutMs: Math.min(30000, Math.max(500, Number(raw.rtkTimeoutMs) || 8000)),
    skipRtkIfDown: raw.skipRtkIfDown !== false,
    skipHeadroomIfDown: raw.skipHeadroomIfDown !== false,
    skipBiliIfDown: raw.skipBiliIfDown !== false,
  };
}

function cloneBody(body) {
  if (typeof structuredClone === "function") return structuredClone(body);
  return JSON.parse(JSON.stringify(body));
}

async function probeOk(url, path = "/health", ms = 600) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(`${url}${path}`, { signal: ctl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

async function postJson(url, body, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json();
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  } finally {
    clearTimeout(t);
  }
}

/** Stage 1 — RTK: local tool-output filters (same role as rtk-proxy on the wire). */
function stageRtkLocal(body, opts, trace) {
  const { body: next, stats, changed } = compressAnthropicBody(body, opts);
  trace.push({
    stage: "rtk-local",
    ok: true,
    changed,
    blocks: stats.blocks,
    savedChars: stats.savedChars,
  });
  return next;
}

/** Stage 2 — optional rtk-proxy HTTP pass (if exposes /v1/compress later; today usually skip). */
async function stageRtkHttp(body, opts, trace) {
  const up = await probeOk(opts.rtkUrl, "/health");
  if (!up) {
    trace.push({ stage: "rtk-http", ok: false, skipped: true, reason: "rtk-proxy down" });
    return body;
  }
  const url = `${opts.rtkUrl}/v1/compress`;
  const res = await postJson(url, body, opts.rtkTimeoutMs);
  if (!res.ok) {
    trace.push({ stage: "rtk-http", ok: false, skipped: true, detail: res.status || res.error });
    return body;
  }
  if (res.data?.messages) {
    body.messages = res.data.messages;
    trace.push({ stage: "rtk-http", ok: true, changed: true });
    return body;
  }
  trace.push({ stage: "rtk-http", ok: false, skipped: true, reason: "no messages in response" });
  return body;
}

/** Stage 3 — Headroom /v1/compress accepts Anthropic-shaped messages bodies. */
async function stageHeadroom(body, opts, trace) {
  const up = await probeOk(opts.headroomUrl, "/health");
  if (!up) {
    trace.push({ stage: "headroom", ok: false, skipped: true, reason: "headroom down" });
    return body;
  }
  const url = `${opts.headroomUrl}/v1/compress`;
  const res = await postJson(url, body, opts.headroomTimeoutMs);
  if (!res.ok) {
    trace.push({ stage: "headroom", ok: false, skipped: true, detail: res.status || res.error });
    return body;
  }
  const data = res.data;
  if (Array.isArray(data?.messages)) {
    body.messages = data.messages;
    trace.push({ stage: "headroom", ok: true, changed: true });
    return body;
  }
  if (data && typeof data === "object" && Array.isArray(data.body?.messages)) {
    Object.assign(body, data.body);
    trace.push({ stage: "headroom", ok: true, changed: true });
    return body;
  }
  trace.push({ stage: "headroom", ok: false, skipped: true, reason: "unexpected response shape" });
  return body;
}

/**
 * Stage 4 — bili: stateless body transform is not on /v1/compress (404).
 * Fold lives on the proxy path + session (ACP); we only call /__bili/plugin/compact when ctx carries ids.
 */
async function stageBili(body, opts, trace, ctx = {}) {
  const conv =
    ctx.session ||
    ctx.conversationId ||
    ctx.headers?.["x-bili-conversation-id"] ||
    ctx.headers?.["x-acp-session"];
  if (!conv) {
    trace.push({
      stage: "bili",
      ok: false,
      skipped: true,
      reason:
        "no conversation id on this hop — bili fold runs on the wire when Magpie upstream is :8787 (see console Wire via bili)",
    });
    return body;
  }
  const url = `${opts.biliUrl}/__bili/plugin/compact`;
  const payload = { conversationId: String(conv), body };
  const res = await postJson(url, payload, opts.headroomTimeoutMs);
  if (!res.ok) {
    trace.push({ stage: "bili", ok: false, skipped: true, detail: res.status || res.error });
    return body;
  }
  const data = res.data;
  if (data?.ok && data.body?.messages) {
    Object.assign(body, data.body);
    trace.push({ stage: "bili", ok: true, changed: true });
  } else {
    trace.push({ stage: "bili", ok: false, skipped: true, reason: data?.error || "compact returned no body" });
  }
  return body;
}

/**
 * Run pipeline on gateway request body. Order: RTK (local) → RTK HTTP (optional) → Headroom → bili try.
 * @returns {{ body: object, trace: object[], changed: boolean }}
 */
export async function runCompressPipeline(body, rawOpts = {}, ctx = {}) {
  const opts = resolvePipelineOpts(rawOpts);
  const trace = [];
  let b = cloneBody(body);
  let changed = false;

  b = stageRtkLocal(b, opts, trace);
  if (trace[0]?.changed) changed = true;

  if (opts.pipeline) {
    const before = JSON.stringify(b.messages);
    b = await stageRtkHttp(b, opts, trace);
    if (JSON.stringify(b.messages) !== before) changed = true;

    const beforeB = JSON.stringify(b.messages);
    b = await stageBili(b, opts, trace, ctx);
    if (JSON.stringify(b.messages) !== beforeB) changed = true;

    const beforeH = JSON.stringify(b.messages);
    b = await stageHeadroom(b, opts, trace);
    if (JSON.stringify(b.messages) !== beforeH) changed = true;
  }

  return { body: b, trace, changed };
}
