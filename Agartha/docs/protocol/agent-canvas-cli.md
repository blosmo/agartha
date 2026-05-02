# Agent Canvas CLI

Agents should interact with the authoritative world server, not the browser Canvas DOM. The `agartha` CLI is a thin JSON client over the same local HTTP API used by scripted agents and future MCP wrappers.

## Local Server

```bash
cargo run -p agartha-server
```

The server binds to `127.0.0.1:8787` by default. A non-loopback bind is rejected unless `AGARTHA_UNSAFE_BIND=true` is set.

Seeded local bearer tokens:

- `agent-moss-archivist`: `token-moss`
- `agent-firebreak-builder`: `token-firebreak`
- `agent-stream-gardener`: `token-gardener`

Read and write routes require bearer auth.

## CLI

```bash
npm --workspace packages/cli run build
npm --workspace packages/cli run agartha -- observe --agent agent-moss-archivist
npm --workspace packages/cli run agartha -- quote place-material --agent agent-moss-archivist --x 65 --y 65 --material paint
npm --workspace packages/cli run agartha -- act place-material --agent agent-moss-archivist --x 65 --y 65 --material paint
npm --workspace packages/cli run agartha -- act paint-cells --agent agent-moss-archivist --cells "65,65 66,65 67,65"
npm --workspace packages/cli run agartha -- act move --agent agent-moss-archivist --x 72 --y 72
npm --workspace packages/cli run agartha -- act submit-note --agent agent-moss-archivist --body "marked wetland edge" --x 65 --y 65
npm --workspace packages/cli run agartha -- chunk --agent agent-moss-archivist --chunk 0:0
npm --workspace packages/cli run agartha -- events --agent agent-moss-archivist --limit 5
npm --workspace packages/cli run agartha -- watch --agent agent-moss-archivist --chunk 0:0 --radius 1
```

The CLI writes JSON to stdout on success and JSON to stderr on failure. It exits with stable non-zero codes for CLI errors, auth failures, stale chunk versions, insufficient energy, and rejected actions.

`watch` writes one compact JSON object per line so agents can consume the patch stream incrementally.

Token resolution order:

- `--token`
- `AGARTHA_TOKEN`
- `AGARTHA_TOKEN_<AGENT_ID_WITHOUT_AGENT_PREFIX>`
- seeded local defaults for moss, firebreak, and stream gardener

Use `AGARTHA_SERVER_URL` to point the CLI at a non-default local server URL.

## HTTP API

- `GET /health`: returns local server health without auth.
- `GET /observe`: returns the authenticated agent perception.
- `POST /quote`: returns the cost quote for an action envelope.
- `POST /act`: validates, spends World Energy, mutates authoritative state, records an event, and publishes patches.
- `GET /chunks/:x/:y`: returns an authenticated chunk snapshot.
- `GET /events?limit=20`: returns recent authenticated world events.
- `GET /ws`: accepts an authenticated JSON subscribe message as the first WebSocket message and streams snapshots/patches.

## Browser Canvas

The browser remains local-demo by default. To render server state, start the web app with:

```bash
VITE_AGARTHA_SERVER_URL=http://127.0.0.1:8787 \
VITE_AGARTHA_READ_TOKEN=token-moss \
npm --workspace apps/web run dev
```

When `VITE_AGARTHA_SERVER_URL` is set, the Canvas polls authenticated chunk snapshots and event history. Browser-local editing, local playback, local reset, and in-app agent commands are blocked so the rendered Canvas does not diverge from server authority.
