// Fail-open compress for Anthropic-shaped bodies at the Magpie gateway (no CC BASE_URL change).

const DEFAULT_MIN = 1200;
const DEFAULT_TOOL_CAP = 12000;
const DEFAULT_HEAD = 720;
const DEFAULT_TAIL = 360;
const MARK = "[magpie-token-saver: gateway compress — full text omitted]";

function resolveOpts(raw = {}) {
  const on = raw.enabled !== false && raw.gatewayCompress !== false;
  return {
    enabled: on,
    minChars: Math.max(200, Number(raw.minChars) || DEFAULT_MIN),
    toolCap: Math.max(800, Number(raw.toolMaxChars) || DEFAULT_TOOL_CAP),
    head: Math.max(80, Number(raw.headChars) || DEFAULT_HEAD),
    tail: Math.max(80, Number(raw.tailChars) || DEFAULT_TAIL),
    agents: Array.isArray(raw.agents)
      ? new Set(raw.agents.map((a) => String(a).trim().toLowerCase()).filter(Boolean))
      : null,
    headroomUrl:
      typeof raw.headroomUrl === "string" && raw.headroomUrl.trim()
        ? raw.headroomUrl.replace(/\/+$/, "")
        : "",
    headroomMinChars: Math.max(2000, Number(raw.headroomMinChars) || 8000),
  };
}

function shrinkText(text, opts) {
  if (typeof text !== "string" || text.length < opts.minChars) return null;
  if (text.length <= opts.toolCap) {
    const h = text.slice(0, opts.head);
    const t = text.slice(-opts.tail);
    const saved = text.length - (h.length + t.length + MARK.length + 80);
    if (saved < 200) return null;
    return `${h}\n\n… ${text.length.toLocaleString()} chars truncated …\n${MARK}\n\n${t}`;
  }
  const h = text.slice(0, opts.head);
  const t = text.slice(-opts.tail);
  return `${h}\n\n… ${text.length.toLocaleString()} chars truncated (cap ${opts.toolCap}) …\n${MARK}\n\n${t}`;
}

function applyShrinkToBlock(block, opts, stats) {
  if (!block || typeof block !== "object") return false;
  if (block.type === "text" && typeof block.text === "string") {
    const next = shrinkText(block.text, opts);
    if (!next) {
      stats.skipped += 1;
      return false;
    }
    stats.savedChars += block.text.length - next.length;
    stats.blocks += 1;
    block.text = next;
    return true;
  }
  if (block.type === "tool_result") {
    if (typeof block.content === "string") {
      const next = shrinkText(block.content, opts);
      if (!next) {
        stats.skipped += 1;
        return false;
      }
      stats.savedChars += block.content.length - next.length;
      stats.blocks += 1;
      block.content = next;
      return true;
    }
    if (Array.isArray(block.content)) {
      let touched = false;
      for (const part of block.content) {
        if (part && typeof part.text === "string") {
          const next = shrinkText(part.text, opts);
          if (next) {
            stats.savedChars += part.text.length - next.length;
            stats.blocks += 1;
            part.text = next;
            touched = true;
          }
        }
      }
      if (!touched) stats.skipped += 1;
      return touched;
    }
  }
  return false;
}

function walkContent(content, opts, stats) {
  if (typeof content === "string") {
    const next = shrinkText(content, opts);
    if (!next) return content;
    stats.savedChars += content.length - next.length;
    stats.blocks += 1;
    return next;
  }
  if (!Array.isArray(content)) return content;
  for (const block of content) {
    applyShrinkToBlock(block, opts, stats);
    if (Array.isArray(block?.content)) walkContent(block.content, opts, stats);
  }
  return content;
}

export function compressAnthropicBody(body, opts) {
  const stats = { blocks: 0, savedChars: 0, skipped: 0 };
  if (!body || typeof body !== "object") return { body, stats, changed: false };
  if (typeof body.system === "string") {
    const next = shrinkText(body.system, { ...opts, minChars: opts.minChars * 2 });
    if (next) {
      stats.savedChars += body.system.length - next.length;
      stats.blocks += 1;
      body.system = next;
    }
  } else if (Array.isArray(body.system)) {
    for (const block of body.system) {
      applyShrinkToBlock(block, opts, stats);
    }
  }
  if (Array.isArray(body.messages)) {
    for (const msg of body.messages) {
      if (!msg || typeof msg !== "object") continue;
      if (msg.content != null) {
        msg.content = walkContent(msg.content, opts, stats);
      }
    }
  }
  const changed = stats.blocks > 0;
  return { body, stats, changed };
}

export function shouldRun(ctx, opts) {
  if (!opts.enabled) return false;
  if (ctx.protocol && ctx.protocol !== "anthropic") return false;
  const agent = String(ctx.agent || "").trim().toLowerCase();
  if (opts.agents && agent && !opts.agents.has(agent)) return false;
  return true;
}

export { resolveOpts };

export const gatewayUrls = {
  anthropicDefault: "http://127.0.0.1:3425",
  magpieMessages: (base) => `${(base || "http://127.0.0.1:3425").replace(/\/+$/, "")}/v1/messages`,
  optionalBili: "http://127.0.0.1:8787",
  optionalRtk: "http://127.0.0.1:8789",
  optionalHeadroom: "http://127.0.0.1:8788",
  console: "http://127.0.0.1:48766",
};
