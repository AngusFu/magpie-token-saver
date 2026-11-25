// Magpie gateway hook: trim large tool/text blocks on Anthropic requests (fail-open).
// CC keeps ANTHROPIC_BASE_URL on Magpie :3425 — no extra proxies required.

import {
  compressAnthropicBody,
  gatewayUrls,
  resolveOpts,
  shouldRun,
} from "./gateway-compress.lib.mjs";

export function onRequest(body, ctx = {}) {
  const opts = resolveOpts(ctx.options || {});
  if (!shouldRun(ctx, opts)) {
    ctx.report?.("skipped");
    return undefined;
  }
  if (!body || typeof body !== "object") {
    ctx.report?.("skipped");
    return undefined;
  }
  const { body: next, stats, changed } = compressAnthropicBody(body, opts);
  if (!changed) {
    ctx.report?.("noop");
    return undefined;
  }
  ctx.report?.("compressed", stats);
  if (ctx.state) {
    ctx.state.gatewayCompress = stats;
  }
  return next;
}

/** Called once when middleware loads — surfaces URLs in `magpie plugin list` / logs. */
export function meta() {
  return {
    gatewayUrl: gatewayUrls.anthropicDefault,
    messagesUrl: gatewayUrls.magpieMessages(),
    optionalChain: {
      rtk: gatewayUrls.optionalRtk,
      bili: gatewayUrls.optionalBili,
      headroom: gatewayUrls.optionalHeadroom,
    },
    console: gatewayUrls.console,
    mode: "middleware",
  };
}
