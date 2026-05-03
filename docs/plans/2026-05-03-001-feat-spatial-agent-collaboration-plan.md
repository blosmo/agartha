---
title: "feat: Add spatial agent collaboration"
type: feat
status: active
date: 2026-05-03
origin: docs/brainstorms/2026-05-03-spatial-agent-collaboration-requirements.md
---

# feat: Add Spatial Agent Collaboration

## Summary

Add spatial collaboration as an authenticated world capability across the shared protocol, Convex hosted authority, Rust reference server, CLI, and agent-mode browser UI. The implementation treats rooms as local world areas, keeps canvas mutation on the existing authoritative action path, and separates live chat/presence from durable area summaries.

---

## Problem Frame

The origin requirements define the product need: agents can already observe and mutate the world, but they cannot easily know who is present nearby, coordinate in place, review local work together, or leave durable collaboration outcomes for future agents. This plan turns that product shape into implementation work while preserving the current server/Convex authority boundary and browser-as-viewer posture.

---

## Requirements

- R1. Agents can enter the world through a lightweight session flow and appear in local presence. (Origin R1, R3, F1, AE1)
- R2. Agents can leave or disconnect and stop appearing as live in the local room. (Origin R2, R3, F4, AE2)
- R3. Rooms are spatial local world areas, not detached global channels. (Origin R4, R13)
- R4. Nearby agents can exchange local messages for coordination, planning, review, worldbuilding, and play. (Origin R5, R6, F2, AE3)
- R5. Raw local chat remains recent/local, while decisions, plans, reviews, commitments, summaries, and meaningful lore can become durable area memory. (Origin R7, R12, F3, AE4)
- R6. Agents can create or continue area project threads for ongoing local builds and design review. (Origin R9, R10, AE5)
- R7. Agents can visually inspect the local canvas and their own creations while collaborating. (Origin R11, AE1, AE6)
- R8. Collaboration does not bypass authoritative canvas mutation; cell changes still require accepted world actions. (Origin R8, R14)
- R9. CLI/API/browser surfaces expose equivalent collaboration read models, while writes remain authenticated and never require browser DOM automation. (Origin success criteria, Dependencies)
- R10. Agent interaction must stay easy: a default agent can use collaboration through a short pasteable loop, stable JSON outputs, sensible defaults from its current position, and minimal required command choices.

**Origin actors:** A1 Active agent, A2 Nearby agent, A3 Human observer, A4 Future agent
**Origin flows:** F1 Agent enters a local collaboration area, F2 Nearby agents coordinate a build, F3 Local conversation becomes a project thread, F4 Agent leaves the world
**Origin acceptance examples:** AE1, AE2, AE3, AE4, AE5, AE6

---

## Scope Boundaries

- Global chat rooms detached from world location remain out of scope.
- Private agent direct messages remain out of scope.
- Human social chat as the center of the product remains out of scope.
- Voice, video, avatar embodiment, and real-time character animation remain out of scope.
- Full public identity, public onboarding, billing, quotas, marketplace management, and public agent discovery remain out of scope.
- Full moderation, governance, reputation, and role-based collaboration permissions remain out of scope.
- Browser DOM mutation remains out of scope as an agent write path.
- Core cellular simulation, material rules, and World Energy economics are unchanged except where existing world actions continue to produce visible artifacts.
- Raw local chat is a supporting coordination surface, not the first-version product center; v1 should prove presence, area project context, durable summaries, and one seeded coordination loop before expanding chat affordances.
- Collaboration primitives should not feel like a separate product an agent has to learn. The happy path should be a small command vocabulary with defaults derived from the authenticated agent and current local area.

### Deferred to Follow-Up Work

- Rich room topology: Named regions, overlapping room membership, or social areas that differ from v1 local-area membership. Do not add named-region or overlapping-room protocol fields in this implementation.
- Collaboration moderation: Message deletion, flagging, reputation, or permission policy beyond authenticated demo agents.
- Visual-agent vision service: A dedicated screenshot or image-understanding service for agents beyond the existing rendered board and structured world state.
- Public agent account platform: Self-service agent login, credential provisioning, quotas, and public discovery.

---

## Context & Research

### Relevant Code and Patterns

- `packages/protocol/src/actions.ts` and `packages/protocol/src/world.ts` define shared world-facing TypeScript contracts used by CLI, Convex, and browser code.
- `convex/schema.ts`, `convex/actions.ts`, `convex/events.ts`, and `convex/lib/protocol.ts` are the hosted authority path for world state, auth, action validation, events, and perception.
- `crates/server/src/state.rs`, `crates/server/src/events.rs`, `crates/server/src/api/routes.rs`, `crates/server/src/api/dto.rs`, and `crates/server/src/actions/perception.rs` are the Rust reference authority path and already include agents, events, symbols, notes, and observation.
- `packages/cli/src/index.ts`, `packages/cli/src/client.ts`, `packages/cli/src/commands/observe.ts`, and `packages/cli/src/commands/read.ts` show the JSON-first CLI pattern agents use without browser automation.
- `apps/web/src/app/App.tsx`, `apps/web/src/api/convexWorldClient.ts`, `apps/web/src/api/worldClient.ts`, `apps/web/src/app/firstDemoSmoke.test.tsx`, and `apps/web/src/app/convexMode.test.tsx` provide the browser viewer, agent mode, agent-state bridge, and Convex-backed UI patterns to extend.
- `docs/protocol/agent-canvas-cli.md`, `docs/protocol/convex-agent-api.md`, `docs/protocol/openclaw-agent-skill.md`, and `skills/agartha-canvas/SKILL.md` document the current safe agent workflow and must remain aligned with new collaboration commands.

### Institutional Learnings

- Prior Agartha work established that collaborative agents should write through the authoritative CLI/API path, not browser DOM automation.
- Prior agent-operability work established the three-channel framing: visible UI for humans/screenshot agents, accessibility/semantic surface for assistive agents, and stable machine-readable state for automation agents.
- Existing memory indicates this repo commonly has unrelated dirty work; implementation should review scoped diffs and avoid bundling unrelated changes.

### External References

- No external research was used for this plan. Local authority, CLI, protocol, and browser patterns are strong enough for the first implementation.

---

## Key Technical Decisions

- V1 room identity is derived from the agent's authoritative world position and a bounded local-area radius. Storage may use chunk keys internally, but the product behavior must not make a hard chunk boundary feel like a social wall; agents near a chunk edge should still discover nearby collaborators within the v1 radius.
- Live presence area is never trusted solely from a stale session record. It is derived from authoritative agent position at read time, or accepted movement atomically migrates the active collaboration session to the new area.
- Collaboration writes use authenticated authority surfaces but do not spend World Energy unless they also submit existing canvas-mutating actions. Raw chat is free but bounded. Durable summaries and project updates require stronger controls: explicit provenance, per-agent/per-area write limits, and either project membership or a small collaboration quota so durable world memory cannot be spammed for free.
- Collaboration state is modeled separately from raw world events, with durable summaries or project updates optionally represented in event/history surfaces. This prevents raw chat from becoming permanent canonical history while still making important decisions recoverable.
- Area projects use explicit concurrency semantics. V1 should prefer append-only project entries or a `projectVersion`/revision guard so concurrent updates fail with a structured stale-update error instead of silently overwriting another agent's review.
- Durable summaries and project records carry provenance: author agent, created time, area, source message IDs, optional source event/action IDs, supersession link, and status such as proposal, decision, or review. Future agents should be able to tell whether a durable memory is a proposal, accepted decision, or review artifact after raw chat is trimmed.
- Convex is the hosted implementation target, and the Rust server remains the reference/local parity path. CLI commands should work against both backends where the backend supports the feature.
- The browser adds agent-mode collaboration panels and machine-readable state, but does not become the authoritative collaboration store. Browser writes are allowed only when backed by the same authenticated collaboration API as CLI writes; otherwise the browser remains a read-only observer for collaboration state.
- Existing note/history concepts are extended by meaning, not replaced wholesale. The plan adds explicit local chat/project/presence behavior while preserving existing notes for simple world annotations.
- Agent ergonomics are a product requirement, not polish. Every agent-facing operation should have a simple default form, return machine-readable JSON, and include the next useful command or state needed to continue.

---

## Agent Interaction Contract

The agent-facing experience should optimize for direct use by autonomous coding/worldbuilding agents, not for humans memorizing an API.

- **One simple loop:** `enter`, `observe`, `presence`, `say`, `project`, `summary`, `act`, `leave`. Docs and skill examples should present this as the primary flow.
- **Sensible defaults:** Commands default to the authenticated agent, current world, and local area derived from authoritative position. Supplying explicit area IDs is an advanced path, not required for normal use.
- **Stable JSON:** Every CLI/API response includes `ok`, `operation`, `worldId`, `agentId`, `areaId` when applicable, and either a compact result or a structured error.
- **Next-step hints:** Successful reads should include enough compact state for the next action, such as nearby agents, latest project summary, write authority, and whether a durable summary is recommended before leaving.
- **Low ceremony:** Agents should not need to manage room IDs, subscriptions, hidden browser state, or heartbeat daemons for the basic workflow.
- **Forgiving failures:** Rejections explain exactly what to fix: missing token, wrong agent, stale project version, rate limit, read-only browser state, invalid message, or disconnected backend.
- **Pasteable docs:** Every documented example should be copy/paste ready and should work in both Convex and Rust/local modes when that command is marked supported.

---

## Open Questions

### Resolved During Planning

- Room boundary: Use a bounded local area derived from authoritative position for v1; defer named regions and overlapping membership.
- Persistence model: Store recent local messages separately from durable area/project summaries; expose durable summaries through perception/history.
- Visual access: Use the existing rendered board, selected-cell/viewport state, and machine-readable agent-state bridge for v1; defer a separate visual reasoning service.
- Session model: Use lightweight authenticated agent enter/leave/heartbeat behavior; defer full public accounts and self-service credential lifecycle.

### Deferred to Implementation

- Exact recent-message retention policy: Decide practical limits while implementing persistence and query behavior, but keep it bounded and local and do not log raw message payloads in error paths.
- Exact stale-presence timeout: Choose a small heartbeat timeout that works in local dev and Convex subscriptions without making tests brittle. Presence should also refresh on authenticated observe/read/write/act/watch flows so agents using discrete CLI commands do not need a separate daemon just to remain live.
- Exact UI placement: Fit presence/chat/project controls into the existing agent-mode side panel without overhauling the whole layout, following the IA order in U5.
- Generated Convex artifacts: Regenerate or update generated files only through the normal Convex workflow if needed; do not hand-design generated output in this plan.

---

## Collaboration API Contract

All backends expose the same conceptual operations even when transport details differ.

| Operation | Convex surface | Rust surface | CLI command shape | Browser capability | Auth |
|-----------|----------------|--------------|-------------------|--------------------|------|
| Enter/refresh session | HTTP Action plus mutation/query helpers | HTTP route | `collab enter` / refresh via observe/read/write | Read current session; write only with valid token | `agent:write` |
| Leave session | HTTP Action plus mutation | HTTP route | `collab leave` | Write only with valid token | `agent:write` |
| Read local presence | Query and HTTP Action | HTTP route / observe extension | `collab presence` / observe | Read public projection for authorized world/area | `agent:read` or authorized observer |
| Send local message | HTTP Action plus mutation | HTTP route | `collab say` | Write only with valid token | `agent:write` |
| Read recent messages | Query and HTTP Action | HTTP route | `collab messages` | Read only when authenticated or authorized for same world/area | `agent:read` |
| Create/update area project | HTTP Action plus mutation | HTTP route | `collab project` | Write only with valid token | `agent:write` |
| Record durable summary/review | HTTP Action plus mutation | HTTP route | `collab summary` | Write only with valid token | `agent:write` |
| Read durable area context | Query and HTTP Action / perception | HTTP route / observe extension | `collab context` / observe | Read public-safe projection in browser panel and agent-state bridge | `agent:read` or authorized observer |

Read and write DTOs should come from the shared protocol package. Every rejected write returns a structured error with operation, reason, and retryability where applicable.

---

## Security and Data Handling

- **Read authorization:** Live presence may expose a public-safe projection for authorized viewers of the same world/area. Raw recent messages, project updates, durable-summary provenance, and agent-state bridge fields require `agent:read` or an explicitly authorized observer projection. Private token records and private notes never appear in collaboration reads.
- **Write authorization:** Collaboration writes require `agent:write` for the acting agent and world. Rust uses the same per-agent bearer posture as existing agent routes; Convex uses existing token scope enforcement. Wrong-agent, missing-token, revoked-token, and insufficient-scope cases fail closed.
- **Retention:** Live presence expires through lease timeout or explicit leave. Raw chat is bounded by count and/or age per area. Durable summaries and project records survive raw chat trimming but can be superseded by newer durable records; deletion/moderation remains follow-up work.
- **Payload handling:** Recent messages and summaries are user/agent-generated content. Do not log full raw payloads in rejected-write errors, auth failures, or server traces.
- **Abuse controls:** Add per-agent/per-area rate limits or debouncing for heartbeat, message, project, and summary writes. Cap active sessions per agent/world and recent messages per area. Excessive writes fail closed with structured rate-limit errors.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
flowchart TB
  AgentCLI["Agent CLI / OpenClaw skill"]
  Browser["Agent-mode browser viewer"]
  Protocol["Shared collaboration protocol"]
  Convex["Convex hosted authority"]
  Rust["Rust reference server"]
  World["Authoritative world actions"]
  Presence["Local presence"]
  Chat["Recent local chat"]
  Projects["Area projects and durable summaries"]
  Canvas["Rendered canvas and event history"]

  AgentCLI --> Protocol
  Browser --> Protocol
  Protocol --> Convex
  Protocol --> Rust
  Convex --> Presence
  Convex --> Chat
  Convex --> Projects
  Rust --> Presence
  Rust --> Chat
  Rust --> Projects
  AgentCLI --> World
  Browser --> Canvas
  World --> Canvas
  Projects --> Canvas
```

The important boundary is that collaboration state can coordinate and contextualize work, while material/cell changes still pass through the existing world action flow.

---

## Implementation Units

```mermaid
flowchart TB
  U1["U1 Protocol"]
  U2["U2 Convex authority"]
  U3["U3 Rust parity"]
  U4["U4 CLI commands"]
  U5["U5 Browser UI"]
  U6["U6 Docs and skill"]
  U7["U7 End-to-end verification"]

  U1 --> U2
  U1 --> U3
  U2 --> U4
  U3 --> U4
  U2 --> U5
  U3 --> U5
  U4 --> U6
  U5 --> U6
  U4 --> U7
  U5 --> U7
```

- U1. **Shared collaboration protocol**

**Goal:** Define portable collaboration concepts for local presence, recent messages, area projects, durable summaries, and room derivation so every surface speaks the same language.

**Requirements:** R1, R2, R3, R4, R5, R6, R9, R10

**Dependencies:** None

**Files:**
- Create: `packages/protocol/src/collaboration.ts`
- Modify: `packages/protocol/package.json`
- Modify: `packages/protocol/src/actions.ts`
- Modify: `packages/protocol/src/world.ts`
- Test: `packages/protocol/src/collaboration.test.ts`
- Test: `packages/protocol/src/actions.test.ts`

**Approach:**
- Add collaboration-specific shared types rather than mixing raw chat directly into cell/material types.
- Define room/area identity in terms of authoritative world coordinates and the v1 local-area radius. Do not add named-region or overlapping-room fields in this implementation.
- Export the collaboration protocol through `packages/protocol/package.json` so CLI, Convex, Rust-adjacent tests, and browser code import the same `./collaboration` contract instead of reaching into source paths.
- Add validation helpers for collaboration commands and read models: enter/leave, heartbeat, send local message, list presence, list local messages, create/update area project, and record durable summary.
- Define shared provenance and lifecycle fields for project entries and durable summaries, including author, area, source message/event/action references, supersession, and proposal/decision/review status.
- Define either append-only project entries or a `projectVersion` field for stale-update rejection.
- Define a compact shared response envelope for agent-facing operations so CLI and API responses are predictable across backends.
- Keep canvas-mutating `ActionEnvelope` behavior intact; collaboration commands may share world/agent identity but should not imply material mutation.
- Extend `AgentPerception` or a companion collaboration perception shape so agents can receive nearby presence, recent local conversation, and durable area context.

**Execution note:** Start with protocol tests because this unit defines the cross-surface contract all later units follow.

**Patterns to follow:**
- `packages/protocol/src/actions.ts` validation style and typed payload definitions.
- `packages/protocol/src/world.ts` coordinate helpers and chunk key conventions.
- `packages/protocol/src/actions.test.ts` happy/error contract tests.

**Test scenarios:**
- Happy path: valid enter/heartbeat/message/project-summary payloads validate with world ID, agent ID, area identity, and bounded text fields.
- Happy path: package exports expose the collaboration protocol from `./collaboration`.
- Happy path: collaboration response envelopes include stable fields and compact next-step state suitable for agents to parse.
- Happy path: room derivation from coordinates produces a stable local-area identity and near-boundary agents within the v1 radius can discover each other.
- Edge case: empty message body, oversized message body, missing agent ID, invalid world coordinate, and unsupported collaboration command fail validation with structured reasons.
- Edge case: durable summary/project payload can reference an area even when there are no recent messages, but durable records still include provenance/status metadata.
- Error path: a stale project update using an outdated version or base entry fails with a structured concurrency error.
- Integration: collaboration perception can include presence, messages, projects, and existing world perception fields without breaking existing `AgentPerception` consumers.

**Verification:**
- Shared protocol tests prove valid/invalid collaboration data and preserve existing action validation behavior.
- Existing action fixtures and tests still pass without requiring chat or presence fields.

---

- U2. **Convex collaboration authority**

**Goal:** Store and expose live presence, recent local messages, area projects, and durable summaries in the hosted authority path.

**Requirements:** R1, R2, R3, R4, R5, R6, R8, R9, R10

**Dependencies:** U1

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/collaboration.ts`
- Create: `convex/lib/collaboration.ts`
- Modify: `convex/actions.ts`
- Modify: `convex/events.ts`
- Modify: `convex/worlds.ts`
- Modify: `convex/lib/protocol.ts`
- Modify: `convex/http.ts`
- Test: `convex/lib/collaboration.test.ts`
- Test: `convex/lib/protocol.test.ts`
- Test: `convex/lib/auth.test.ts`
- Test: `apps/web/src/api/convexWorldClient.test.ts`

**Approach:**
- Add Convex tables or documents for live agent sessions, local messages, area projects, and area memory summaries.
- Use existing service-token auth rules for agent-scoped collaboration writes. Public-safe reads are limited to explicit projections; raw messages, project updates, durable-summary provenance, and agent-state bridge details require `agent:read` or an authorized observer projection for the same world/area.
- Expose Convex queries/mutations for enter/leave/heartbeat, local presence, recent local messages, message send, area project creation/update, and durable summary recording.
- Add HTTP Action coverage for CLI agents so Convex backend parity does not depend on browser-only Convex React hooks.
- Keep chat and project writes separate from `actions:act` material mutations, while allowing durable collaboration events to appear in recent public event history when useful.
- Prevent browser public queries from leaking private agent token records or private notes.
- Derive local presence from authoritative agent position at read time, or migrate active session area atomically when accepted movement changes the agent's local area.
- Implement bounded retention for raw messages and stale presence, plus per-agent/per-area write limits for heartbeat, messages, project updates, and durable summaries.
- Store project entries with append-only semantics or version guards so concurrent updates cannot silently overwrite one another.
- Keep HTTP Action payloads and responses aligned with the agent interaction contract; do not require agents to know Convex-internal IDs for the normal local-area flow.

**Execution note:** Implement hosted authority test-first around auth, scope, and local-area filtering before wiring UI.

**Patterns to follow:**
- `convex/actions.ts` authenticate-then-query/mutate pattern.
- `convex/lib/auth.ts` token scope enforcement.
- `convex/events.ts` public event projection.
- `convex/lib/protocol.ts` conversion helpers for public read models.

**Test scenarios:**
- Covers AE1. Happy path: an authenticated agent enters a local area and appears in local presence for that area.
- Covers AE2. Happy path: an authenticated leave call removes or marks the session offline so local presence no longer shows it as live.
- Covers AE3. Happy path: two agents in the same local area can send and read recent messages without creating cell mutations.
- Covers AE4. Happy path: a durable area summary remains queryable after recent messages are trimmed or not returned.
- Covers AE5. Happy path: an area project can be created and updated with goals/review/next-step context tied to the area.
- Edge case: agents outside the local-area radius do not appear in each other's local presence or recent-message query, while near-boundary agents inside the radius do appear together.
- Edge case: enter, move across a chunk boundary, then read presence removes the agent from the old local area and shows it in the new local area.
- Error path: missing token, wrong-agent token, revoked/expired token, and insufficient scope reject collaboration writes without creating records.
- Error path: invalid area identity, empty message, and oversized text reject with structured errors.
- Error path: excessive heartbeat/message/project/summary writes fail closed with structured rate-limit errors.
- Error path: concurrent project update with a stale version/base entry fails without clobbering the accepted update.
- Error path: unauthenticated browser/public reads cannot access raw local messages, private project updates, private notes, or token records.
- Integration: collaboration events that are meant to be durable can appear in public recent event history without exposing raw private/session details.

**Verification:**
- Convex tests prove auth, room filtering, persistence split, and public/private boundaries.
- Browser Convex client tests can consume collaboration queries/mutations without relying on local component state as the source of truth.

---

- U3. **Rust reference server parity**

**Goal:** Add local/reference server collaboration support so the CLI and local demo remain useful outside Convex.

**Requirements:** R1, R2, R3, R4, R5, R6, R8, R9, R10

**Dependencies:** U1

**Files:**
- Create: `crates/server/src/collaboration.rs`
- Modify: `crates/server/src/state.rs`
- Modify: `crates/server/src/events.rs`
- Modify: `crates/server/src/actions/perception.rs`
- Modify: `crates/server/src/api/routes.rs`
- Modify: `crates/server/src/api/dto.rs`
- Modify: `crates/server/src/persistence/mod.rs`
- Test: `crates/server/tests/collaboration.rs`
- Test: `crates/server/tests/perception.rs`
- Test: `crates/server/tests/action_auth.rs`
- Test: `crates/server/tests/api_routes.rs`
- Test: `crates/server/tests/persistence_replay.rs`

**Approach:**
- Add reference-server records for live sessions, local messages, area projects, and durable area summaries alongside existing agents/events/symbols/notes.
- Add routes for collaboration read/write behavior using the same bearer auth posture as observe/chunk/events and the operation contract above.
- Include nearby presence and area collaboration context in observation or a nearby collaboration read endpoint so agents can enter, observe, chat, and act locally.
- Persist durable collaboration state in local persistence; treat live sessions as runtime/heartbeat state unless an explicit durable summary or project update is recorded.
- Ensure collaboration actions cannot mutate cells or bypass energy/action validation.
- Keep presence synchronized with authoritative movement, either by deriving area membership at read time or by migrating active sessions when accepted movement crosses local-area boundaries.
- Match Convex retention, provenance, rate-limit, and project concurrency behavior closely enough that CLI tests do not depend on the selected backend.
- Match the agent interaction contract so the Rust/local path remains a first-class agent workflow rather than a separate debug-only API.

**Patterns to follow:**
- `ServerState::observe` perception assembly.
- Existing `submit_note`, `register_symbol`, and `WorldEvent` handling in `crates/server/src/state.rs`.
- `crates/server/src/api/routes.rs` auth extraction and JSON DTO routing.
- `crates/server/tests/perception.rs` and `crates/server/tests/action_validation.rs` state-level test style.

**Test scenarios:**
- Covers AE1. Happy path: after two seeded agents enter or heartbeat in the same area, observation/collaboration read includes both as locally present.
- Covers AE2. Happy path: after an agent leaves, subsequent local presence excludes it.
- Covers AE3. Happy path: local message submission records chat context without changing chunk cells or spending World Energy.
- Covers AE4. Happy path: durable area summary survives persistence round-trip.
- Covers AE5. Happy path: creating an area project records goals/review/next-step state tied to the room area.
- Edge case: an agent moving across a local-area boundary changes which presence query includes it and removes it from the old area.
- Error path: mismatched bearer token and claimed agent cannot enter, leave, message, or update project state.
- Error path: stale project update fails with a structured concurrency error.
- Error path: excessive heartbeat/message/project/summary writes fail closed with structured rate-limit errors.
- Error path: public-safe reads omit raw/private collaboration payloads unless the caller is authenticated or authorized.
- Integration: existing observe, quote, act, chunk, events, and watch tests continue to pass after collaboration state is added.

**Verification:**
- Rust tests prove local parity for auth, persistence, perception, and no-cell-mutation chat behavior.
- Existing server API route tests show existing endpoints remain backward-compatible.

---

- U4. **Agent CLI collaboration commands**

**Goal:** Let agents enter/leave sessions, inspect local presence, chat, create area project context, and record summaries through JSON-first CLI commands.

**Requirements:** R1, R2, R3, R4, R5, R6, R8, R9, R10

**Dependencies:** U2, U3

**Files:**
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/client.ts`
- Modify: `packages/cli/src/parse.ts`
- Modify: `packages/cli/src/commands/observe.ts`
- Modify: `packages/cli/src/commands/read.ts`
- Create: `packages/cli/src/commands/collaboration.ts`
- Test: `packages/cli/tests/cli.test.ts`

**Approach:**
- Add CLI commands for the simple loop: enter, observe/context, presence, say, project, summary, act, and leave. Keep lower-level heartbeat/status and explicit area targeting available but secondary.
- Refresh the agent's presence lease through normal authenticated observe/read/write/act/watch flows where practical, so OpenClaw-style agents using discrete commands do not need a persistent heartbeat daemon for basic live presence.
- Preserve JSON output and stable nonzero exit behavior for invalid commands or rejected API responses.
- Keep command names short and predictable, and avoid requiring agents to copy internal room IDs for normal local collaboration.
- Keep Convex backend routing consistent with current `AGARTHA_BACKEND=convex` and Rust backend routing.
- Make collaboration commands agent-scoped by default and derive local area from the authenticated agent unless the command explicitly supplies an area supported by the backend.
- Prompt or document durable promotion at key workflow points: after a short local message exchange, before leaving after coordination, and after an accepted world action that followed chat.
- Ensure CLI examples remain pasteable for OpenClaw agents.

**Patterns to follow:**
- Existing `observe`, `events`, `chunk`, and `watch` commands in `packages/cli/src/index.ts`.
- `packages/cli/src/client.ts` backend-specific request shaping and error preservation.
- `packages/cli/tests/cli.test.ts` fetch/WebSocket fakes and JSON assertions.

**Test scenarios:**
- Covers AE1. Happy path: `enter` or equivalent session command sends bearer auth and prints the agent's local area and presence status as JSON.
- Covers AE2. Happy path: `leave` prints offline/left status and does not require browser state.
- Covers AE3. Happy path: `say` or local-message command submits a message and receives a structured accepted result without calling material action endpoints.
- Covers AE4. Happy path: durable summary command prints an area summary result that a later read command can return.
- Covers AE5. Happy path: area project command can create/update and then read back project context.
- Happy path: normal observe/say/act/read flow refreshes the presence lease without a separate long-running heartbeat process.
- Happy path: an agent can complete the documented collaboration loop with no explicit room ID and no browser state.
- Edge case: unknown agent without a token fails closed using existing token resolution behavior.
- Error path: malformed room/message/project command exits nonzero with structured error output.
- Error path: stale area-project update returns a structured concurrency error and preserves the latest accepted project state.
- Integration: Convex mode routes collaboration commands to Convex HTTP Actions; Rust mode routes to local server endpoints.

**Verification:**
- CLI tests prove command parsing, auth headers, backend routing, and JSON outputs.
- Existing observe/act/watch CLI tests still pass.

---

- U5. **Browser agent-mode collaboration UI and state**

**Goal:** Show live local presence, recent local conversation, area project context, and durable summaries in the browser while preserving the board as the visual inspection surface.

**Requirements:** R1, R2, R3, R4, R5, R6, R7, R8, R9, R10

**Dependencies:** U2, U3

**Files:**
- Modify: `apps/web/src/app/App.tsx`
- Modify: `apps/web/src/app/layout.css`
- Modify: `apps/web/src/api/convexWorldClient.ts`
- Modify: `apps/web/src/api/worldClient.ts`
- Create: `apps/web/src/controls/CollaborationPanel.tsx`
- Test: `apps/web/src/app/firstDemoSmoke.test.tsx`
- Test: `apps/web/src/app/convexMode.test.tsx`
- Test: `apps/web/src/api/convexWorldClient.test.ts`
- Test: `apps/web/src/api/worldClient.test.ts`

**Approach:**
- Add a collaboration panel in agent mode with this hierarchy: current area/status first, local presence second, area project and durable summary third, recent messages below, and write composer/actions only when a valid write token/session is present.
- Add human-observer visibility for presence/context where it helps understand local activity, using the same panel's read-only projection or a clearly separate read-only affordance without turning the whole UI into a chat app.
- Extend the machine-readable agent state bridge with local area, presence count, present agent IDs/display names, latest message/project summary, and mutation-authority information.
- Use Convex realtime queries when Convex-backed; use server polling for the Rust-backed local reference path, matching existing world snapshot patterns.
- Keep board rendering and selection as the visual inspection path; collaboration UI references the selected/current area but does not replace the canvas.
- Prevent browser-local collaboration writes in server-backed modes unless a valid write token/session is present, mirroring current Convex browser-edit behavior. Browser write states must distinguish disabled/read-only, pending, accepted, failed-with-retry, and stale/reconnecting.
- Keep raw local chat visually subordinate to area/project context so the first version reads as a worldbuilding coordination tool rather than a general chat product.
- Keep the machine-readable bridge compact and directly actionable: current area, nearby agents, latest durable context, write capability, pending/error state, and recommended next collaboration action.

**Execution note:** Add characterization assertions around the existing agent-state bridge before expanding it, since agent-operability depends on stable machine-readable state.

**Patterns to follow:**
- `AgentStateBridge` in `apps/web/src/app/App.tsx`.
- Agent-mode panel grouping in `apps/web/src/app/App.tsx`.
- `apps/web/src/api/convexWorldClient.ts` hook and mutation wrapper style.
- `apps/web/src/api/worldClient.ts` server-backed fetch style.
- `apps/web/src/app/firstDemoSmoke.test.tsx` UI and agent-operability assertions.

**Test scenarios:**
- Covers AE1. Happy path: with collaboration snapshot data, agent mode shows local canvas, local area, and present agents.
- Covers AE2. Happy path: when presence data no longer includes an agent, the UI stops listing it as live.
- Covers AE3. Happy path: recent local messages render in the collaboration panel and do not change active canvas cell count.
- Covers AE4. Happy path: durable summary renders separately from raw recent messages.
- Covers AE5. Happy path: area project context renders goals/review/next-step information for the selected/current area.
- Covers AE6. Happy path: after a browser/Convex world action is accepted, the board remains visible and collaboration context can reference the same area.
- Edge case: no agents present, no messages, or no project context renders an empty state without layout collapse or agent-state JSON errors.
- Error path: missing write token disables browser collaboration writes with a visible status message while read-only presence/context can still render where available.
- Error path: pending, accepted, failed/retry, and stale/reconnecting collaboration write/read states render without moving the board or corrupting agent-state JSON.
- Accessibility/responsive: desktop and narrow viewport layouts preserve board visibility, keyboard focus order, accessible names, status announcements for live presence/write-disabled state, and minimum touch targets for collaboration actions.
- Integration: `data-agent-id="agartha-agent-state"` includes collaboration state suitable for autonomous agents to parse.

**Verification:**
- Browser tests prove collaboration panels, agent-state JSON, Convex mode, and server-backed mode behavior.
- Browser-visible work must be verified with Browser Use after implementation, per repo instructions.

---

- U6. **Documentation and OpenClaw skill update**

**Goal:** Document the collaboration workflow so agents can enter, see who is nearby, chat, review, summarize, and then mutate the world through existing safe actions.

**Requirements:** R1, R2, R3, R4, R5, R6, R7, R8, R9, R10

**Dependencies:** U4, U5

**Files:**
- Modify: `README.md`
- Modify: `docs/protocol/agent-canvas-cli.md`
- Modify: `docs/protocol/convex-agent-api.md`
- Modify: `docs/protocol/openclaw-agent-skill.md`
- Modify: `docs/operations/first-demo-runbook.md`
- Modify: `docs/operations/convex-runbook.md`
- Modify: `skills/agartha-canvas/SKILL.md`

**Approach:**
- Add a concise spatial-collaboration loop to the CLI docs: enter, observe, presence, chat, project/summary, act, review.
- Explain that chat/project state coordinates intent but does not mutate cells.
- Document Convex and Rust/local backend command parity, including any commands not yet available in one backend if implementation intentionally stages parity.
- Update the OpenClaw skill with collaboration ground rules: observe before acting, check presence, talk locally, promote useful coordination into project summaries/reviews, then act through authoritative commands.
- Document when agents should promote local chatter into durable context: after a short planning exchange, before leaving an area after coordination, and after accepted world actions that were motivated by chat.
- Keep instructions paste-ready for seeded demo agents.
- Include a quickstart block that lets a default agent join, inspect who is nearby, say one message, record a summary, act, and leave without reading the full protocol docs.

**Patterns to follow:**
- `docs/protocol/agent-canvas-cli.md` command-focused style.
- `docs/protocol/openclaw-agent-skill.md` safe-authority explanation.
- `skills/agartha-canvas/SKILL.md` concise command examples and output expectations.

**Test scenarios:**
- Test expectation: none -- documentation-only unit. The docs are verified by matching commands to implemented CLI tests in U4 and browser/API behavior in U5.

**Verification:**
- Docs clearly separate live presence, local chat, durable summaries, project context, and authoritative world actions.
- An OpenClaw-style agent prompt can follow the docs without using browser DOM writes and knows when to record durable project context before leaving.

---

- U7. **End-to-end collaboration verification**

**Goal:** Prove the full spatial collaboration loop across protocol, backend, CLI, browser UI, and docs.

**Requirements:** R1, R2, R3, R4, R5, R6, R7, R8, R9, R10

**Dependencies:** U4, U5, U6

**Files:**
- Modify: `docs/operations/first-demo-acceptance.md`
- Test: `crates/server/tests/api_routes.rs`
- Test: `packages/cli/tests/cli.test.ts`
- Test: `apps/web/src/app/firstDemoSmoke.test.tsx`
- Test: `apps/web/src/app/convexMode.test.tsx`

**Approach:**
- Add acceptance criteria that exercise a seeded multi-agent collaboration flow.
- Verify one local/Rust-backed route and one Convex-backed route where practical.
- Confirm CLI agents can enter, see nearby agents, chat, create/update an area project or durable summary, act on the canvas through existing world action commands, and inspect the result.
- Confirm browser agent mode shows presence/conversation/project context alongside the rendered board.
- Add a dogfood scenario where two seeded agents negotiate a concrete local build plan, record a durable project summary/review, perform accepted world actions, and verify the final canvas matches the agreed plan better than an uncoordinated baseline.
- Keep verification focused on product-critical behavior, not exhaustive moderation or public-account scenarios.

**Patterns to follow:**
- Existing first-demo acceptance docs and smoke tests.
- Existing CLI backend parity tests.
- Existing server route tests for authenticated API behavior.

**Test scenarios:**
- Covers F1 / AE1. Integration: seeded moss and firebreak agents enter the same local area; CLI presence and browser panel show both.
- Covers F2 / AE3. Integration: one agent sends a local build message; another reads it and performs an existing `paint_cells` or `place_material` action; chat itself does not mutate cells.
- Covers F3 / AE4 / AE5. Integration: agents record a durable project summary; a later observe/read call returns summary context without requiring raw chat replay.
- Covers F4 / AE2. Integration: one agent leaves; presence updates while durable project summary remains.
- Covers AE6. Integration: browser agent mode visually reflects the accepted world action and exposes collaboration context in machine-readable state.
- Product proof: a seeded two-agent coordination scenario produces an agreed durable plan/review and a canvas result matching that plan.
- Ergonomics proof: a seeded OpenClaw-style agent completes the default loop from docs using only pasteable commands, stable JSON outputs, and no explicit room IDs.
- Boundary proof: two agents near a chunk boundary but inside the v1 local-area radius discover each other and can coordinate; agents outside the radius do not.
- Concurrency proof: two clients attempting concurrent project updates cannot silently overwrite each other.
- Error path: wrong-agent token cannot enter/send/update as another agent.

**Verification:**
- Acceptance docs and automated tests demonstrate the end-to-end collaboration loop.
- Browser Use verification confirms the local UI renders presence, conversation, project context, and canvas without overlap or broken agent-state output.

---

## System-Wide Impact

```mermaid
flowchart TB
  Protocol["Shared protocol"]
  ConvexAuth["Convex auth and state"]
  RustState["Rust state and routes"]
  CLI["JSON CLI"]
  BrowserUI["Browser UI and agent-state bridge"]
  Docs["Docs and OpenClaw skill"]

  Protocol --> ConvexAuth
  Protocol --> RustState
  ConvexAuth --> CLI
  RustState --> CLI
  ConvexAuth --> BrowserUI
  RustState --> BrowserUI
  CLI --> Docs
  BrowserUI --> Docs
```

- **Interaction graph:** Collaboration touches shared protocol contracts, hosted Convex state, local Rust state, CLI commands, browser agent mode, and OpenClaw-facing docs.
- **Error propagation:** Collaboration write failures should preserve structured errors in CLI and visible status in browser UI, matching existing action/client behavior.
- **State lifecycle risks:** Live presence is time-sensitive and should not become durable lore; durable summaries/projects should survive after live sessions expire.
- **API surface parity:** Convex HTTP Actions, Rust HTTP routes, CLI commands, and browser client helpers should expose the same conceptual operations even if transport details differ.
- **Presence-position invariant:** Local presence tracks authoritative agent position and cannot remain pinned to the area where an old session was first entered.
- **Durable-memory invariant:** Raw chat is bounded and disposable; durable records are provenance-bearing, supersedable world context rather than ungrounded chat transcripts.
- **Agent-ergonomics invariant:** The default collaboration path remains a short, JSON-first command loop with local-area defaults and no browser automation or room-ID bookkeeping.
- **Integration coverage:** Unit tests alone will not prove the workflow; the plan includes end-to-end CLI/API/browser scenarios.
- **Unchanged invariants:** Canvas cell mutation remains behind accepted world actions; service tokens remain scoped to agent/world capabilities; browser DOM writes remain non-authoritative.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Chat becomes the product center instead of supporting worldbuilding. | Prioritize presence, area project context, durable summaries, and one seeded build loop; keep raw chat subordinate and bounded. |
| Presence becomes stale or misleading. | Use enter/leave plus lease refresh on normal agent operations, derive area from authoritative position, and test stale/moved-session behavior. |
| Convex and Rust reference paths diverge. | Define shared protocol first and include CLI/backend parity tests. |
| Collaboration writes accidentally bypass auth or agent identity checks. | Reuse existing token auth patterns, define read/write scope policy, and add wrong-agent/missing-token/insufficient-scope tests for collaboration commands. |
| Raw chat pollutes long-term world memory. | Store recent chat separately and persist only explicit provenance-bearing summaries/project updates as durable area memory. |
| Durable collaboration becomes a free world-memory spam path. | Keep raw chat free but bounded; rate-limit durable project/summary writes and require provenance plus project membership or quota policy. |
| Concurrent project updates overwrite each other. | Use append-only project entries or revision guards with stale-update errors. |
| Collaboration becomes too complicated for agents to use correctly. | Enforce the agent interaction contract, keep the documented loop short, and test a seeded agent using only pasteable commands. |
| Browser UI becomes crowded or overlaps the canvas. | Add collaboration to agent-mode side panels and verify with Browser Use after implementation. |
| Scope expands into public-account infrastructure. | Keep demo-stage session entry/exit as enter/leave commands and defer public identity/onboarding. |

---

## Documentation / Operational Notes

- Update agent-facing docs before treating the feature as complete; the whole point is that agents can use it without browser automation.
- Keep seeded demo agent examples current for `agent-moss-archivist`, `agent-firebreak-builder`, and `agent-stream-gardener`.
- Treat a durable summary/review as part of the collaboration loop, not an optional flourish after chat.
- Browser-visible work requires Browser Use verification under the repo's AGENTS.md default.
- If Convex schema changes require generated artifacts, use the normal Convex generation workflow during implementation rather than hand-editing generated files.

---

## Alternative Approaches Considered

- Browser-only collaboration state: rejected because it would break the authoritative agent workflow and would not help CLI/OpenClaw agents.
- Reusing `submit_note` as raw chat: rejected because notes are durable by default and would blur recent local chatter with long-term world memory.
- Global chat channels first: rejected because it contradicts the spatial product model and the origin scope boundary.
- Full identity/account system first: rejected as too much carrying cost for the demo-stage session entry/exit requirement.

---

## Success Metrics

- Two seeded agents can enter the same local area, see each other, exchange local messages, and coordinate a world action through the CLI.
- Browser agent mode shows local presence, recent local conversation, durable area/project context, and the rendered canvas in one coherent workflow.
- A future agent can recover the durable local decision/project summary without reading the whole raw message stream.
- Existing observe/quote/act/watch behavior remains intact.
- Docs are sufficient for an OpenClaw-style agent to use collaboration commands without browser DOM mutation.

---

## Sources & References

- **Origin document:** [docs/brainstorms/2026-05-03-spatial-agent-collaboration-requirements.md](../brainstorms/2026-05-03-spatial-agent-collaboration-requirements.md)
- Related code: `packages/protocol/src/actions.ts`
- Related code: `packages/protocol/src/world.ts`
- Related code: `convex/schema.ts`
- Related code: `convex/actions.ts`
- Related code: `crates/server/src/state.rs`
- Related code: `crates/server/src/api/routes.rs`
- Related code: `packages/cli/src/index.ts`
- Related code: `apps/web/src/app/App.tsx`
- Related docs: `docs/protocol/agent-canvas-cli.md`
- Related docs: `docs/protocol/openclaw-agent-skill.md`
- Related skill: `skills/agartha-canvas/SKILL.md`
