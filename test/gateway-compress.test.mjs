import test from "node:test";
import assert from "node:assert/strict";
import { compressAnthropicBody, resolveOpts } from "../gateway-compress.lib.mjs";
import { runCompressPipeline } from "../pipeline.mjs";

test("skips small tool results", () => {
  const body = {
    messages: [
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }],
      },
    ],
  };
  const { changed, stats } = compressAnthropicBody(body, resolveOpts({}));
  assert.equal(changed, false);
  assert.equal(stats.blocks, 0);
});

test("shrinks large tool_result string", () => {
  const big = "line\n".repeat(2000);
  const body = {
    messages: [
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t1", content: big }],
      },
    ],
  };
  const { changed, stats } = compressAnthropicBody(body, resolveOpts({ minChars: 500 }));
  assert.equal(changed, true);
  assert.ok(stats.savedChars > 1000);
  const block = body.messages[0].content[0];
  assert.ok(block.content.length < big.length);
  assert.match(block.content, /magpie-token-saver/);
});

test("pipeline has no bili stage", async () => {
  const { trace } = await runCompressPipeline(
    { messages: [{ role: "user", content: "hi" }] },
    {},
  );
  assert.equal(trace.some((t) => t.stage === "bili"), false);
});

test("pipeline runs rtk-local at minimum", async () => {
  const big = "x\n".repeat(2000);
  const body = {
    messages: [
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t1", content: big }],
      },
    ],
  };
  const { changed, trace } = await runCompressPipeline(body, { minChars: 500, pipeline: false });
  assert.equal(changed, true);
  assert.ok(trace.some((t) => t.stage === "rtk-local"));
});
