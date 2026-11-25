# magpie-token-saver

Magpie plugin: **`onRequest` middleware** for **RTK** + **Headroom**, plus a local console to health-check helpers.

```
Claude Code → Magpie :3425 → onRequest: RTK-local → RTK HTTP? → Headroom? → provider
```

**billion-context (bili)** is not in gateway middleware:

- **Claude Code** chat: `ANTHROPIC_BASE_URL` = Magpie + **bili Magpie plugin**.
- **bili wire sidecar** (optional, replaces local **nginx :1126**): plugin listens `127.0.0.1:1126`, forwards to  
  `http://127.0.0.1:8787/bili/http://127.0.0.1:3425<request_uri>` — same rewrite as openresty.

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

## bili sidecar (:1126)

Enabled by default when the plugin page service starts (`sidecar: true`).

| Option | Default |
|--------|---------|
| `sidecarPort` | `1126` |
| `biliTarget` | `http://127.0.0.1:8787` |
| `biliWireTarget` | Magpie from `gateway.json` or `http://127.0.0.1:3425` |

Point clients that used `http://127.0.0.1:1126/...` at the same URL — traffic still hits **bili proxy**, then Magpie via the `/bili/http://…` path. Headers are forwarded as-is (only `Host` → bili and normal hop-by-hop drops).

Disable: `{ "sidecar": false }` and keep nginx if you prefer.

## CLI

```sh
node cli.mjs --json
```

## License

MIT
