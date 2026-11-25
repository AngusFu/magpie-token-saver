// Magpie onRequest: RTK-local → RTK HTTP? → Headroom. bili = nginx / Magpie bili plugin (out of scope).
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
    pipeline: ["rtk-local", "rtk-http?", "headroom?"],
    optionalServices: {
      rtk: gatewayUrls.optionalRtk,
      headroom: gatewayUrls.optionalHeadroom,
    },
    bili: "nginx reverse proxy + Magpie bili plugin — not in this middleware",
    console: gatewayUrls.console,
    mode: "middleware-pipeline",
  };
}
