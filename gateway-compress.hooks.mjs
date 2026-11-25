// Magpie gateway: take the full Anthropic request body, run RTK→bili→Headroom pipeline, return mutated body.
// CC still uses only http://127.0.0.1:3425 — this *is* modifying the request inside Magpie (like you said).

import { gatewayUrls, resolveOpts, shouldRun } from "./gateway-compress.lib.mjs";
import { runCompressPipeline } from "./pipeline.mjs";

export async function onRequest(body, ctx = {}) {
  const opts = resolveOpts(ctx.options || {});
  if (!shouldRun(ctx, opts)) {
    ctx.report?.("skipped");
    return undefined;
  }
  if (!body || typeof body !== "object") {
    ctx.report?.("skipped");
    return undefined;
  }

  const { body: next, trace, changed } = await runCompressPipeline(body, ctx.options || {}, ctx);

  if (!changed) {
    ctx.report?.("noop", { trace });
    return undefined;
  }

  ctx.report?.("pipeline", { trace });
  if (ctx.state) {
    ctx.state.tokenSaverPipeline = trace;
  }
  return next;
}

export function meta() {
  return {
    gatewayUrl: gatewayUrls.anthropicDefault,
    messagesUrl: gatewayUrls.magpieMessages(),
    pipeline: ["rtk-local", "rtk-http?", "bili-transform?", "headroom"],
    optionalServices: {
      rtk: gatewayUrls.optionalRtk,
      bili: gatewayUrls.optionalBili,
      headroom: gatewayUrls.optionalHeadroom,
    },
    console: gatewayUrls.console,
    mode: "middleware-pipeline",
  };
}
