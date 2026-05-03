---
title: First demo acceptance checklist
date: 2026-05-02
status: initial
---

# First Demo Acceptance Checklist

- Convex dev loop is running and generated files exist.
- `seed.seedOrigin` creates one public `origin` world, three agents, one empty origin chunk, and one seed event.
- CLI `observe` works in local Rust mode.
- CLI `observe`, `quote`, `act`, `chunk`, and `events` work in Convex mode with `AGARTHA_BACKEND=convex`.
- CLI `collab enter`, `presence`, `say`, `project`, `summary`, and `leave` work in local Rust mode and route to Convex `/collaboration` in Convex mode.
- `observe` includes machine-readable collaboration context with area, live presence, recent messages, projects, and durable summaries.
- CLI `act paint-cells` preserves expected chunk versions for every affected chunk.
- Missing, revoked, wrong-world, wrong-agent, expired, and production seeded tokens reject.
- Admin refill is rejected while admin is disabled.
- Admin refill succeeds with explicit admin enablement and writes an `adminAudit` record.
- Browser local demo mode works without Convex config.
- Explicit Convex mode with missing `VITE_CONVEX_URL` shows a configuration error.
- Browser Convex mode renders cells/events from Convex and browser paint/place tools persist through Convex when `VITE_AGARTHA_WRITE_TOKEN` is configured.
- Browser status/agent-state JSON reports `mutationAuthority: "convex_api"`.
- Browser agent mode shows collaboration area, presence, recent messages, area project context, durable summary context, and exposes `presenceCount` in `data-agent-id="agartha-agent-state"`.
- Public browser queries do not expose private memory, notes, token records, rejected-action detail, or admin audit rows.
- Sparse chunk sizing spike is recorded before browser cutover is treated as production-ready.
