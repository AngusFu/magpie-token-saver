// Pick Claude entry URL and upstream hops from live health — fail open to fewer layers.

const MAGPIE_FALLBACK = "http://127.0.0.1:3425";

function row(rows, id) {
  return rows.find((r) => r.id === id);
}

function isUp(id, rows) {
  const r = row(rows, id);
  return r?.status === "up";
}

/** RTK llm-proxy upstream when using optional :8789 stack (not CC default). */
export function pickAnthropicUpstream(rows, gateway) {
  const gw = (gateway || MAGPIE_FALLBACK).replace(/\/+$/, "");
  if (isUp("magpie", rows)) return { url: gw, path: ["magpie"], degraded: false };
  return { url: null, path: [], degraded: true, reason: "Magpie gateway not reachable" };
}

/** CC fixed on Magpie; middleware + optional bili on Magpie upstream (not a 3-hop CC BASE_URL). */
export function pickMiddlewareStack(rows, gateway) {
  const gw = (gateway || MAGPIE_FALLBACK).replace(/\/+$/, "");
  const warnings = [];
  const middleware = ["Magpie onRequest: RTK-local"];
  if (isUp("headroom", rows)) middleware.push("Headroom :8788");
  else middleware.push("Headroom (skip)");

  const magpieOk = isUp("magpie", rows);
  if (!magpieOk) {
    return {
      mode: "middleware",
      baseUrl: null,
      entry: null,
      hops: [],
      middleware,
      tier: "none",
      ready: false,
      warnings: ["Start Magpie gateway on :3425 first."],
    };
  }

  const hops = ["CC", ":3425 (RTK+Headroom inside)", "provider"];
  const biliRole =
    "对话：CC → :3425（middleware 在网关内）。边车 :1126 → bili → Magpie，与 BASE_URL 分开。";
  if (isUp("rtk-proxy", rows)) {
    warnings.push("RTK :8789 可选；CC 不走。Middleware 已含 rtk-local。");
  }

  return {
    mode: "middleware",
    baseUrl: gw,
    entry: gw,
    hops,
    middleware,
    biliRole,
    tier: "magpie-middleware",
    ready: magpieOk,
    warnings,
  };
}

/** Legacy CC entry picker (alternate stacks); do not use for default CC env. */
export function pickClaudeEntry(rows, gateway) {
  const upstream = pickAnthropicUpstream(rows, gateway);
  const warnings = [];

  if (!upstream.url) {
    return {
      baseUrl: null,
      hops: [],
      tier: "none",
      ready: false,
      warnings: [upstream.reason || "no upstream"],
    };
  }

  if (upstream.degraded && upstream.reason) warnings.push(upstream.reason);

  if (isUp("rtk-proxy", rows)) {
    return {
      baseUrl: "http://127.0.0.1:8789",
      hops: ["rtk-proxy", ...upstream.path],
      tier: "rtk",
      ready: true,
      upstreamForRtk: upstream.url,
      warnings,
    };
  }

  if (isUp("bili", rows)) {
    if (isUp("headroom", rows)) {
      warnings.push(
        "Headroom is up but not in this auto path — point bili upstream at :8788 manually if you want it.",
      );
    }
    return {
      baseUrl: "http://127.0.0.1:8787",
      hops: ["bili", ...upstream.path.slice(1)],
      tier: "bili",
      ready: isUp("magpie", rows),
      warnings,
    };
  }

  if (isUp("magpie", rows)) {
    warnings.push("All compress proxies down — direct Magpie only.");
    return {
      baseUrl: (gateway || MAGPIE_FALLBACK).replace(/\/+$/, ""),
      hops: ["magpie"],
      tier: "magpie",
      ready: true,
      warnings,
    };
  }

  return {
    baseUrl: null,
    hops: [],
    tier: "none",
    ready: false,
    warnings: ["Start Magpie gateway first."],
  };
}

export function describeChainGaps(rows) {
  const gaps = [];
  if (!isUp("magpie", rows))
    gaps.push({
      id: "magpie",
      severity: "error",
      text: "Gateway down — nothing works until Magpie listens on :3425.",
    });
  if (!isUp("headroom", rows) && isUp("magpie", rows)) {
    gaps.push({
      id: "headroom",
      severity: "info",
      text: "Headroom down — middleware still runs RTK-local only.",
    });
  }
  const rtkRow = row(rows, "rtk-proxy");
  if (rtkRow?.binPath && !isUp("rtk-proxy", rows)) {
    gaps.push({
      id: "rtk-proxy",
      severity: "info",
      text: "rtk-proxy installed but not running — smart stack skips it.",
    });
  }
  return gaps;
}
