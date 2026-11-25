#!/usr/bin/env node
// magpie-token-saver status --json

import { probeAll } from "./core.mjs";
import { installRecipes, readBillionContextConfig } from "./config-hints.mjs";

const args = process.argv.slice(2);
const json = args.includes("--json");

if (args.includes("-h") || args.includes("--help")) {
  console.log(`usage: node cli.mjs [--json]\n       magpie-token-saver status [--json]`);
  process.exit(0);
}

const data = await probeAll();
const cfg = readBillionContextConfig();
const out = { ...data, billionContext: cfg, install: installRecipes() };

if (json) console.log(JSON.stringify(out, null, 2));
else {
  console.log("magpie-token-saver");
  console.log("gateway:", data.gateway || "(none)");
  for (const s of data.services) {
    console.log(`  ${s.id.padEnd(12)} ${s.status.padEnd(5)} :${s.port}  ${s.binPath || "(no binary)"}`);
  }
}
