# magpie-token-saver

Magpie plugin (same shape as **magpie-tools**): a local console page to **probe**, **start** (where safe), and **link** to token-saving proxies around Magpie.

| Layer | Default port | Role |
|-------|--------------|------|
| Magpie gateway | 3425 | Billing / upstream |
| billion-context (bili) | 8787 | ACP context fold |
| Headroom | 8788 | Large payload compress |
| RTK llm-proxy | 8789 | Tool output compress (optional binary) |

**Recommended chain (manual upstream config):**  
`Claude Code → RTK (8789) → bili (8787) → Headroom (8788) → Magpie (3425)`

Simpler: **CC → bili → Magpie** (set `ANTHROPIC_BASE_URL=http://127.0.0.1:8787`).

## Install

```sh
git clone https://github.com/<you>/magpie-token-saver.git
magpie plugin add /path/to/magpie-token-saver
```

Open **Plugins → Token Saver** in Magpie. The page service listens on `127.0.0.1:48766` (override with plugin option `port`).

## What the page does

- Health check each service (HTTP `/health` or TCP).
- Show install / start hints.
- Open **Health / Stats / docs** links.
- **Start** spawns detached `billion-context` or `headroom proxy` when binaries exist (Magpie and RTK are manual).
- Presets + sample `export ANTHROPIC_*` snippets.

## GitHub

Create a new repo and push this directory:

```sh
cd magpie-token-saver
git init
git add -A
git commit -m "feat: initial magpie-token-saver plugin"
gh repo create magpie-token-saver --public --source=. --push
```

## Notes

- Do not stack **9router** on this path if you care about Claude Code session grouping in Magpie.
- Port **8787** is often already used by bili; **8788** for Headroom — same as in earlier local setup.
- RTK `rtk-proxy` is a separate release artifact; install before expecting port 8789 to be up.
