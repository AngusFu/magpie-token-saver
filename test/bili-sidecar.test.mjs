import test from "node:test";
import assert from "node:assert/strict";
import { buildBiliProxyPath, resolveSidecarOpts } from "../bili-sidecar.mjs";

test("rewrites like nginx 1126", () => {
  const wire = "http://127.0.0.1:3425";
  assert.equal(
    buildBiliProxyPath("/v1/messages", wire),
    "/bili/http://127.0.0.1:3425/v1/messages",
  );
  assert.equal(
    buildBiliProxyPath("/v1/messages?beta=true", wire),
    "/bili/http://127.0.0.1:3425/v1/messages?beta=true",
  );
});

test("default sidecar port 1126", () => {
  const o = resolveSidecarOpts({});
  assert.equal(o.listenPort, 1126);
  assert.equal(o.biliTarget, "http://127.0.0.1:8787");
});

test("live sidecar matches nginx 1126 body when bili up", { timeout: 15000 }, async () => {
  const { default: net } = await import("node:net");
  const biliUp = await new Promise((r) => {
    const s = net.connect(8787, "127.0.0.1", () => {
      s.destroy();
      r(true);
    });
    s.on("error", () => r(false));
  });
  if (!biliUp) return;

  const { startBiliSidecar, stopBiliSidecar, publicSidecarUrl } = await import("../bili-sidecar.mjs");
  const port = 11261;
  const opts = { sidecarPort: port, biliTarget: "http://127.0.0.1:8787", biliWireTarget: "http://127.0.0.1:3425" };
  const started = await startBiliSidecar(opts);
  assert.equal(started.ok, true);
  const resolved = resolveSidecarOpts(opts);
  assert.equal(publicSidecarUrl(resolved), `http://127.0.0.1:${port}`);

  const [a, b] = await Promise.all([
    fetch(`http://127.0.0.1:${port}/`).then((r) => r.text()),
    fetch("http://127.0.0.1:1126/").then((r) => r.text()).catch(() => ""),
  ]);
  assert.ok(a.includes("magpie"));
  if (b) assert.equal(a, b);
  stopBiliSidecar();
});
