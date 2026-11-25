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

export function chainDiagram() {
  return [
    { step: 1, label: "Claude Code", url: null },
    { step: 2, label: "RTK llm-proxy :8789", optional: true },
    { step: 3, label: "billion-context :8787", optional: false },
    { step: 4, label: "Headroom :8788", optional: true },
    { step: 5, label: "Magpie gateway :3425", optional: false },
  ];
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
        "# from https://github.com/rtk-ai/rtk — download rtk-proxy for your OS",
        "rtk llm-proxy start",
      ],
      note: "Point upstream at http://127.0.0.1:8787 when bili is running.",
    },
  ];
}
