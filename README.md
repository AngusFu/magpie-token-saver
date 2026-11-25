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
