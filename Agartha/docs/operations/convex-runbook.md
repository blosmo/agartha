---
title: Convex authority runbook
date: 2026-05-02
status: initial
---

# Convex Authority Runbook

Convex is the hosted authority path for Agartha. The Rust server remains a local reference path during migration.

## Local Setup

1. Install dependencies with `npm install`.
2. Run `npx convex dev` in a user terminal. Keep it running.
3. Confirm `.env.local` contains `VITE_CONVEX_URL`.
4. Confirm `convex/_generated/api.ts` and `convex/_generated/server.ts` exist.
5. Run the web app separately with `npm run dev`.

The web app reads repo-root `.env.local` through `apps/web/vite.config.ts` `envDir`.

## Seed

Use the Convex dashboard or dev console to run `seed.seedOrigin`.

Seeded local agent tokens are:

- `token-moss`
- `token-firebreak`
- `token-gardener`

These are local-only. Production-like deployments reject seeded local tokens.

## CLI Modes

Local Rust mode:

```bash
AGARTHA_SERVER_URL=http://127.0.0.1:8787 npm --workspace packages/cli run agartha -- observe --agent agent-moss-archivist
```

Convex HTTP Action mode:

```bash
AGARTHA_BACKEND=convex AGARTHA_CONVEX_HTTP_URL=https://<deployment>.convex.site npm --workspace packages/cli run agartha -- observe --agent agent-moss-archivist
```

Convex React clients use `VITE_CONVEX_URL`. CLI HTTP Actions use the `.convex.site` URL.

## Admin

Admin refill is disabled unless `AGARTHA_CONVEX_ADMIN_ENABLED=true` is set in the Convex environment and the token has `admin:energy`.

Every accepted admin refill writes an `adminAudit` record. Browser public queries must never expose `serviceTokens`, `adminAudit`, private notes, or rejected-action internals.

## Watch

The Rust path uses WebSocket watch. Convex mode uses a same-output polling fallback over `/events` until a direct Convex subscription-backed CLI watch is enabled.

## Browser Modes

- No hosted config: browser-local demo mode.
- `VITE_AGARTHA_BACKEND=convex` with missing `VITE_CONVEX_URL`: visible config error, no local fallback.
- `VITE_CONVEX_URL` present: Convex authoritative state, public world cells/events only.
- `VITE_AGARTHA_SERVER_URL` present without Convex config: local Rust authoritative state.

Browser verification must confirm the status text says `Rendering Convex authoritative state` before claiming Convex mode works.
