# magpie-token-saver

Magpie plugin (same pattern as [magpie-tools](https://github.com/AngusFu/magpie-mcp-tools)): local console for **bili**, **Headroom**, **RTK llm-proxy**, and **Magpie gateway**.

```
Claude Code → [RTK :8789] → bili :8787 → [Headroom :8788] → Magpie :3425
```

## Install

```sh
git clone https://github.com/AngusFu/magpie-token-saver.git
magpie plugin add /path/to/magpie-token-saver
```

Open **Plugins → Token Saver**. Page service: `127.0.0.1:48766` (plugin option `port`).

## Gateway middleware (no CC BASE_URL change)

This plugin registers **`onRequest` hooks** on the Magpie gateway (same pattern as `magpie-deja` / `middleware-system-prompt`). Claude Code can keep:

```sh
ANTHROPIC_BASE_URL=http://127.0.0.1:3425
```

On each `/v1/messages` call, middleware **takes the full JSON body**, runs a **pipeline** (fail-open), then sends the mutated body upstream:

1. **RTK-local** — tool output slimming (same role as RTK on the wire)
2. **bili** — `POST /__bili/plugin/compact` when `ctx.session` / conversation id is present (ACP fold needs session state); otherwise skip with reason in trace
3. **Headroom** — `POST :8788/v1/compress` with the same Anthropic-shaped body
4. CC never changes `BASE_URL`; **yes, this is modifying the request** — inside Magpie, not in CC.

Tune in **Plugin options** (JSON) or `magpie plugin options magpie-token-saver`:

```json
{ "enabled": true, "minChars": 1200, "toolMaxChars": 12000 }
```

Optional heavier stack (bili / RTK / Headroom) remains on the console for transparency — not required for basic gateway compress.

| URL | Role |
|-----|------|
| `http://127.0.0.1:3425` | **Magpie gateway** (CC default) |
| `http://127.0.0.1:3425/v1/messages` | Anthropic API |
| `http://127.0.0.1:8787` | Optional bili |
| `http://127.0.0.1:8788` | Optional Headroom |
| `http://127.0.0.1:8789` | Optional RTK llm-proxy |
| `http://127.0.0.1:48766` | This plugin console |

## CLI

```sh
node cli.mjs --json
# or after npm link:
magpie-token-saver
```

## Page features

- Health per service + links (health, stats, docs)
- **Start** for `billion-context` / `headroom proxy` / `rtk llm-proxy` when binary is on PATH
- Chain diagram + stack presets
- **Apply** Claude Code `~/.claude/settings.json` env (with `.bak-*` backup)
- Suggested `billion-context.json` upstream snippet
- Install command cheatsheet

## Ports (defaults)

| Service | Port |
|---------|------|
| Magpie | 3425 |
| billion-context | 8787 |
| Headroom | 8788 |
| RTK llm-proxy | 8789 (optional binary) |
| This plugin UI | 48766 |

## RTK llm-proxy (install vs run)

| Piece | What it is |
|-------|------------|
| `brew install rtk` | Terminal **RTK CLI** only (compress `grep`/`git` output). **Not** the Anthropic API proxy. |
| `rtk-proxy` | Separate **daemon binary** (BUSL). Fetched by `rtk llm-proxy setup` or [releases](https://github.com/rtk-ai/rtk). |
| `rtk llm-proxy …` | **Supported control plane**: `setup`, `start --bind …`, `status`, `config set …`. |

Daily commands (match the plugin UI):

```sh
rtk llm-proxy setup
rtk llm-proxy start --bind 127.0.0.1:8789
rtk llm-proxy config set anthropic_upstream http://127.0.0.1:8787 --bind 127.0.0.1:8789
```

The page **Start** button runs `rtk llm-proxy start`, not raw `rtk-proxy start`.

## Notes

- Prefer **CC → bili → Magpie** or **RTK → bili → Magpie** over **9router** if you need correct session grouping in Magpie.
- Headroom: `uv tool install 'headroom-ai[code,ml]'`; point upstream at Magpie.

## License

MIT
