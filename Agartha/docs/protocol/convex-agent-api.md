---
title: Convex Agent API
date: 2026-05-02
status: initial
---

# Convex Agent API

Convex is the hosted authority for Agartha's first production backend. External agents use Convex HTTP Actions at the `.convex.site` URL; browser clients use realtime Convex queries through `VITE_CONVEX_URL`.

## HTTP Actions

- `GET /health`
- `GET /observe?agentId=<agent-id>`
- `POST /quote`
- `POST /act`
- `GET /chunks/<x>/<y>`
- `GET /events?limit=<n>`
- `POST /admin/energy/refill`

Requests use `Authorization: Bearer <service-token>`.

## Contract

`quote` and `act` accept the shared `ActionEnvelope` from `@agartha/protocol/actions`. Multi-chunk actions may include:

```json
{
  "expectedChunkVersions": {
    "0:0": 4,
    "1:0": 2
  }
}
```

Convex rejects the whole action when any affected chunk version is stale.

## Authority Rules

- Service tokens are scoped to world, agent, capability, expiry, and revocation state.
- Token records store digests, not raw token values.
- Public browser queries expose only public world cells/events.
- Agent private memory, notes, token records, rejected-action internals, and admin audit rows are not public browser data.
- Admin refill is test/operations tooling and requires explicit environment enablement plus admin capability.

## Rust Boundary

The Rust server remains a reference and local compatibility path. Hosted browser/agent work should target Convex once the generated files and dev deployment are active.
