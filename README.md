# magpie-token-saver

Magpie plugin: **`onRequest` middleware** for **RTK** + **Headroom**, plus a local console to health-check helpers.

```
Claude Code → Magpie :3425 → onRequest: RTK-local → RTK HTTP? → Headroom? → provider
```

**billion-context (bili)** is **out of scope** for this plugin:

- **Claude Code** chat: `ANTHROPIC_BASE_URL` = Magpie + your **bili Magpie plugin** as today.
- **Separate bili APIs** (compress / ACP tools / etc.): route through **nginx** to `http://127.0.0.1:8787` (or your bili listen port).

## Install

```sh
git clone https://github.com/AngusFu/magpie-token-saver.git
magpie plugin add /path/to/magpie-token-saver
```

Console: **Plugins → Token Saver** → `http://127.0.0.1:48766`.

## Gateway middleware

CC keeps:

```sh
ANTHROPIC_BASE_URL=http://127.0.0.1:3425
```

Each `/v1/messages` body is trimmed in Magpie (fail-open):

1. **RTK-local** — in-process tool_output slimming
2. **RTK HTTP** — optional if `rtk llm-proxy` exposes `/v1/compress`
3. **Headroom** — `POST :8788/v1/compress` when up

Plugin options example:

```json
{ "enabled": true, "minChars": 1200, "toolMaxChars": 12000 }
```

## Ports

| URL | Role |
|-----|------|
| `http://127.0.0.1:3425` | Magpie gateway (**CC**) |
| `http://127.0.0.1:8788` | Headroom (middleware) |
| `http://127.0.0.1:8789` | RTK llm-proxy (optional HTTP stage) |
| `http://127.0.0.1:48766` | This plugin UI |
| `http://127.0.0.1:8787` | bili — **nginx / plugin**, not this middleware |

## RTK llm-proxy

```sh
brew install rtk
rtk llm-proxy setup
rtk llm-proxy start --bind 127.0.0.1:8789
```

`syncRtkUpstream` in the console points RTK at **Magpie**, not bili.

## Headroom

```sh
uv tool install 'headroom-ai[code,ml]'
headroom proxy --port 8788
```

Set Headroom upstream to Magpie if you run it as a side proxy; middleware only needs `:8788/health` + `/v1/compress`.

## bili (nginx)

Example pattern (adjust server block to your host):

```nginx
location /bili/ {
  proxy_pass http://127.0.0.1:8787/;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
}
```

Use that URL for tool/MCP calls that target bili; keep Claude on Magpie.

## CLI

```sh
node cli.mjs --json
```

## License

MIT
