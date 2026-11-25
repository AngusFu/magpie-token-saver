// Example upstream wiring (user copies into each tool's config file).

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HOME = homedir();

export function readBillionContextConfig() {
  const path = join(HOME, ".config", "billion-context", "billion-context.json");
  if (!existsSync(path)) return { path, exists: false, sample: sampleBili(path) };
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    return { path, exists: true, upstream: raw.upstream, providers: raw.providers };
  } catch (e) {
    return { path, exists: true, parseError: String(e?.message || e), sample: sampleBili(path) };
  }
}

function sampleBili(path) {
  return {
    path,
    json: {
      port: 8787,
      upstream: "http://127.0.0.1:3425",
      providers: {
        "http://127.0.0.1:3425": { wire: "anthropic" },
      },
    },
  };
}

/** Main CC chat path; middleware runs inside Magpie before upstream. */
export function chainDiagram() {
  return {
    title: "CC 对话",
    steps: [
      { step: 1, label: "Claude Code", optional: false },
      {
        step: 2,
        label: "Magpie :3425",
        detail: "onRequest · RTK-local → Headroom?",
        optional: false,
      },
      { step: 3, label: "Provider", optional: false },
    ],
    sidecar: {
      title: "bili 边车（非 CC BASE_URL）",
      steps: [
        { step: 1, label: "Client → :1126", optional: false },
        { step: 2, label: "bili :8787", detail: "/bili/http://…3425…", optional: false },
        { step: 3, label: "Magpie → Provider", optional: false },
      ],
    },
  };
}

export function suggestBiliUpstream(gateway) {
  const up = gateway || "http://127.0.0.1:3425";
  return {
    upstream: up,
    providers: {
      [up]: { wire: "anthropic" },
    },
  };
}

export function installRecipes() {
  return [
    {
      id: "bili",
      title: "billion-context",
      commands: ["npm i -g billion-context", "billion-context start --port 8787"],
    },
    {
      id: "headroom",
      title: "Headroom (Kompress)",
      commands: ["uv tool install 'headroom-ai[code,ml]'", "headroom proxy --port 8788"],
      note: "In Headroom UI/API, set Anthropic upstream to Magpie http://127.0.0.1:3425/v1/messages",
    },
    {
      id: "rtk",
      title: "RTK llm-proxy",
      commands: [
        "brew install rtk",
        "rtk llm-proxy setup",
        "rtk llm-proxy start --bind 127.0.0.1:8789",
        "# optional alt stack only: rtk llm-proxy config set anthropic_upstream http://127.0.0.1:8787 --bind 127.0.0.1:8789",
      ],
      note:
        "`brew install rtk` is CLI only. `rtk llm-proxy setup` installs the `rtk-proxy` daemon binary. Start/status/config always go through `rtk llm-proxy`, not by hand-calling `rtk-proxy`.",
    },
  ];
}
