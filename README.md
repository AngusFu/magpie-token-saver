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
- **Start** for `billion-context` / `headroom proxy` when binary is on PATH
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

## Notes

- Prefer **CC → bili → Magpie** or **RTK → bili → Magpie** over **9router** if you need correct session grouping in Magpie.
- RTK `rtk-proxy` is a separate download from [rtk-ai/rtk](https://github.com/rtk-ai/rtk) (BUSL-1.1).
- Headroom: `uv tool install 'headroom-ai[code,ml]'`; point upstream at Magpie.

## License

MIT
