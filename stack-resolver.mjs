// Pick Claude entry URL and upstream hops from live health — fail open to fewer layers.

const MAGPIE_FALLBACK = "http://127.0.0.1:3425";

function row(rows, id) {
  return rows.find((r) => r.id === id);
}

function isUp(id, rows) {
  const r = row(rows, id);
  return r?.status === "up";
}

/** Next hop after RTK (or direct entry if no RTK). */
export function pickAnthropicUpstream(rows, gateway) {
  const gw = (gateway || MAGPIE_FALLBACK).replace(/\/+$/, "");
  if (isUp("bili", rows)) return { url: "http://127.0.0.1:8787", path: ["bili"], degraded: false };
  if (isUp("magpie", rows))
    return { url: gw, path: ["magpie"], degraded: true, reason: "bili down — skipping context fold" };
  return { url: null, path: [], degraded: true, reason: "Magpie gateway not reachable" };
}

/** Best ANTHROPIC_BASE_URL for Claude Code (never through a down proxy). */
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
  if (isUp("rtk-proxy", rows) && !isUp("bili", rows) && isUp("magpie", rows)) {
    gaps.push({
      id: "rtk-upstream",
      severity: "warn",
      text: "RTK is up but bili is down — RTK should forward straight to Magpie (no fold).",
    });
  }
  if (isUp("bili", rows) && !isUp("magpie", rows)) {
    gaps.push({
      id: "bili-upstream",
      severity: "error",
      text: "bili is up but Magpie is down — requests will fail at bili.",
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
