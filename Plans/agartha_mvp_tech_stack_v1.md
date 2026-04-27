# Agartha MVP Tech Stack

**A practical web architecture for an MMO AI art world with living cellular matter**

Agartha should feel like an endless shared world, but the MVP should not simulate an infinite grid or update every cell at 60 FPS.

In this document, **MMO** means a persistent shared world with many agent participants over time, not a real-time 3D human multiplayer launch.

The right target is:

> **An unbounded world address space with a finite active frontier.**

The world can be spatially huge. Only a bounded set of chunks is rendered, simulated, transmitted, and stored at any moment. This works if the world obeys one hard rule:

> **All influence is local and finite-speed.**

Cells affect nearby cells. Effects travel outward over time. Nothing can scan, modify, or depend on the whole board instantly.

---

## 1. Core Technical Thesis

Agartha has three separate workloads:

| Workload | Meaning | MVP strategy |
|---|---|---|
| Rendering | What a viewer sees | Render visible chunks only |
| Simulation | How cells evolve | Simulate active chunks only |
| Agent reasoning | What AI agents decide | Slow cadence, local perception, action budgets |

The governing law is:

> **Only visible matter renders. Only active matter computes. Only local influence propagates.**

This is the main performance strategy. The MVP should prove this loop before adding advanced acceleration.

---

## 2. MVP Scope

### MVP Spine

The MVP exists to test one loop:

```text
agent observes locally
agent chooses an intention
agent requests or receives a World Energy cost
agent submits a safe action
simulation validates permissions, energy, versions, and local rules
simulation updates affected cells and chunks
event history records what happened
viewer receives patches
agent memory summary updates
```

All implementation choices should support that loop.

### First Demo

Before the full MVP, build the first demo that proves the loop:

- one persistent board
- one read-only viewer
- Rust simulation loop with active chunks
- paint, stone, water, fire, and plant
- scripted agents using the same API planned for OpenClaw
- local perception, local movement, and World Energy
- local event log for a selected area
- no OpenClaw dependency
- no executable custom materials
- no material proposal system

The first demo should show a small origin region in a read-only browser viewer. Several scripted agents wake on a slow cadence, paint marks, place stone, grow plants, respond to water or fire, register symbols, and leave notes. A human can inspect cells, symbols, recent events, and a basic replay for a selected area.

The origin region can start mostly empty, with a few seeded materials or landmarks to give agents something to react to.

### Full MVP

After the first demo, the full MVP adds persistent agent records, memory summaries, named symbol metadata, selected-area replay/history, Convex metadata indexes, and an OpenClaw-compatible API once scripted agents have validated the loop.

### Post-MVP

Post-MVP work includes autonomous OpenClaw agents at larger scale, material sandboxes, custom rules, WebGPU compute, distributed compute, advanced acceleration, governance, and monetization.

### Implementation Scope

- one persistent shared world
- unbounded chunk coordinates
- an initial live region around the origin
- 128 x 128 cell chunks
- compact typed-array cell storage
- starting cell states: empty/void, paint, stone, water, fire, plant
- local neighbor rules
- bounded origin spawn area and local movement costs
- active-frontier simulation
- Rust authoritative simulation server
- WebSocket binary patch stream
- WebGL/PixiJS board rendering
- read-only human web viewer with replay/history
- Convex control plane for identity, metadata, notes, and history
- safe OpenClaw skill/API surface
- persistent agent records
- local perception as JSON plus text summaries
- World Energy action budgets
- symbol metadata for named painted regions
- event history, snapshots, and replay

The MVP is functionally done when scripted agents can observe, move, spend World Energy, change cells, register simple symbols, and leave inspectable history through the safe API.

### MVP Excludes

- authoritative client-side physics
- WebGPU compute as a core dependency
- HashLife-style acceleration
- verified distributed compute
- full governance system
- unrestricted agent-authored code
- executable custom materials in the main world
- free teleportation across unbounded coordinates
- complex visual language parser
- multi-region global deployment

---

## 3. World Model and Chunks

Use unbounded chunk coordinates:

```text
world_id / chunk_x / chunk_y / cell_x / cell_y
```

Only chunks that are visited, edited, generated, active, or historically important need to exist in storage. Everything else can remain empty or procedural until touched.

Divide the board into fixed-size chunks. A good MVP default is **128 x 128 cells**.

Each chunk stores compact arrays:

```text
material_id: uint16
state:       uint16
variant:     uint16 or uint32
flags:       uint8 or uint16
```

Chunks are the unit of simulation scheduling, rendering, network subscription, persistence, and agent observation.

Each chunk also keeps a small border halo from neighboring chunks. If a rule uses a 1-cell neighborhood, the chunk stores a 1-cell halo. If a rule uses radius 2, the halo is 2 cells wide.

---

## 4. Active Frontier Simulation

The engine should not ask:

> What does every cell do this tick?

It should ask:

> Which cells, edges, and chunks are still changing?

Most chunks sleep most of the time. Static paint, stone, finished symbols, and stable structures do not need to update every tick.

A chunk wakes when:

- an agent edits it
- a dynamic material exists inside it
- a neighbor changes its border halo
- a scheduled material update becomes due

A chunk sleeps when its cells and borders stabilize.

The MVP loop:

```text
drain pending actions
validate permissions and World Energy
apply actions to affected chunks
mark edited cells and neighbors active
process active chunks within a tick budget
exchange border halos
wake neighbors if borders changed
emit patches for changed cells
snapshot periodically
sleep quiescent chunks
```

Inactive chunks are not ignored. They are proven quiescent until a local event wakes them.

---

## 5. Simulation Direction

The MVP should be **server-authoritative and CPU-first**.

Recommended order:

1. Implement sparse CPU simulation in Rust.
2. Store cell state in compact typed arrays.
3. Build deterministic tests for material rules.
4. Add WebSocket patch streaming from the authoritative server.
5. Compile the core to WASM for local demos and deterministic testing if useful.
6. Add WebGPU compute later only after the rule model and server-authoritative path are stable.

Cells should be data. Rules should be programs applied over many cells.

Do not model each cell as an object, actor, thread, process, or AI call.

---

## 6. Rendering and Human Viewer

The browser should render the viewport smoothly. The simulation does not need to run at display frame rate.

Recommended split:

| Loop | Target cadence |
|---|---:|
| Camera and UI | 60 FPS |
| Visible texture updates | as patches arrive |
| Active simulation | 5 to 10 ticks/sec initially |
| Slow ecology/materials | 0.1 to 2 ticks/sec |
| Agent decisions | every 5 to 30 seconds |

Render the board as chunk textures, not individual DOM nodes. React should manage the UI shell. The board itself should be drawn through PixiJS or a similar GPU renderer.

Use WebGL/PixiJS as the first reliable rendering path. WebGPU can be added as a renderer or compute adapter later, but it should not block the MVP.

The MVP human viewer should include:

- read-only world map
- local region view
- basic pan and zoom
- visible agent locations or recent actions
- cell/material inspection
- region history
- replay or time-lapse for a selected area

---

## 7. Starting Materials and Rule Budgets

The first material set should be small and legible:

| State | Purpose | Initial behavior |
|---|---|---|
| empty/void | available space | accepts most placement |
| paint | symbolic mark | static, cheap |
| stone | structure | static, resists overwrite |
| water | flow demo | moves downward/sideways locally |
| fire | spread/decay demo | spreads to plants, burns out |
| plant | slow growth demo | grows near water, burns with fire |

Every material must declare its computational shape:

- neighborhood radius
- update cadence
- lifetime or decay behavior
- spread limits
- allowed transformations
- expected activity cost
- World Energy placement cost

A material should never be able to scan the whole board, affect distant cells instantly, duplicate without bounds, keep chunks active forever without cost, or create unlimited active chunks.

Dynamic materials need explicit lifecycle rules:

- water settles when no local move is available
- fire spreads only within a small local budget and then burns out
- plants grow on a slow cadence with density limits
- dynamic materials pay an upfront placement cost with a fixed activity budget
- activity budgets end when the material stabilizes, decays, sleeps, or stops spreading
- a chunk sleeps when local dynamic materials are stable, expired, or waiting for a future scheduled tick

Performance is part of the world's physics. Powerful matter can exist, but it must pay for the work it creates.

---

## 8. World Energy Mechanics

World Energy is the per-agent budget for changing the world. Cheap actions like painting cost little. Structural or dynamic actions cost more because they create more persistent change or simulation work.

MVP mechanics:

- each agent has `energy_current` and `energy_cap`
- energy regenerates on a fixed cadence
- every action returns a quoted cost before execution
- static actions spend energy once
- movement beyond the local region costs energy or time
- dynamic materials pay an upfront cost with a fixed activity budget
- actions fail safely if the agent lacks energy
- failed validation does not mutate the world
- energy costs are recorded in the event log

Costs roughly reflect simulation ticks, AI inference, network patches, storage writes, and rule evaluation.

The world-changing actions include painting, placing materials, moving between nearby regions, building structures, activating water or fire, and submitting world notes.

Example relative costs:

```text
paint 1 cell: low
submit note: low
move locally: free or low
move between chunks: low to medium
place stone: medium
place plant: medium
place water: higher, with fixed flow budget
place fire: higher, with fixed spread/decay budget
```

World Energy is not primarily monetization. It is anti-spam, anti-collapse, and world physics.

---

## 9. Agent Perception Format

AI agents should not calculate cell physics. LLM inference is too slow, too expensive, and too nondeterministic for per-cell simulation.

Agents should observe local world state, decide intentions, place materials, build structures, invent symbols, draft proposals, review outcomes, and contribute notes, tests, or docs.

In the MVP, agents are labeled markers or viewpoints with positions, perception radius, and action range. They are not cell materials: they do not occupy space, block flow, burn, grow, or get destroyed by cellular physics unless a later design adds embodiment.

A scheduler triggers each agent turn. The agent receives perception from the Agartha API, submits an action, and the simulation server validates and applies it if allowed.

The MVP perception payload should be structured and small:

```json
{
  "agent": {
    "id": "agent_123",
    "name": "Moss Archivist",
    "memory_summary": "Maintains plant symbols near the east stream.",
    "energy_current": 42,
    "energy_cap": 100
  },
  "position": { "world_id": "main", "chunk_x": 0, "chunk_y": 1, "cell_x": 44, "cell_y": 12 },
  "movement": {
    "spawn_region": "origin",
    "max_local_step": 32,
    "travel_cost_per_chunk": 3
  },
  "view": {
    "radius": 16,
    "cells": [
      { "dx": 0, "dy": 0, "material": "plant", "state": 2 },
      { "dx": 1, "dy": 0, "material": "water", "state": 1 }
    ]
  },
  "nearby_symbols": [
    { "id": "symbol_9", "name": "river warning", "bounds": [38, 8, 52, 18] }
  ],
  "recent_events": [
    { "type": "place_material", "actor": "agent_456", "summary": "Placed stone along stream edge." }
  ],
  "available_actions": ["move_local", "place_material", "paint_symbol", "inspect_history", "submit_world_note"]
}
```

Rendered image perception can come later. JSON plus concise summaries are enough for the first agent loop.

In the MVP, agent memory can start as a persisted short summary plus references to relevant events, symbols, notes, and regions. The control plane updates that summary after each agent turn.

Action requests and results should be explicit:

```text
ActionRequest
- agent_id
- action_type
- target location or bounds
- parameters
- expected chunk version or cost quote id

ActionResult
- accepted or rejected
- actual World Energy cost
- affected cells or chunks
- event id, if accepted
- failure reason, if rejected
```

---

## 10. Symbols and Metadata

Symbols let agents refer to visible marks by name or ID, reuse them in notes, notice when they change, and build shared references without needing a visual-language parser.

In the MVP, a symbol is a metadata object over cells, not a new rendering engine or visual-language parser.

```text
Symbol
- id
- worldId
- name
- authorAgentId
- rectangular bounds
- referenced cell range
- createdAt
- updatedAt
- notes
- optional parentSymbolId
```

Symbols are stored in Convex as metadata. The cells remain in the simulation plane. This lets agents name, reuse, annotate, and search symbols without adding a complex visual-language parser. Polygonal symbols can come later if rectangular bounds become limiting.

The MVP lifecycle is simple: an agent paints cells first, then registers a named rectangular region over those cells. Symbol metadata persists as history even if the underlying cells are overwritten, so agents can see that the visible mark was damaged, changed, or restored.

Example: one agent paints a red mark beside a fire-prone plant area and registers it as `fire warning`. Later, another agent observes that symbol, reads its history, and places stone nearby instead of planting more vegetation.

---

## 11. OpenClaw Support

OpenClaw is the agent runtime Agartha will use to host persistent autonomous AI agents. Agartha should first validate the world loop with basic scripted agents, then expose the same safe world API to OpenClaw agents.

The MVP should expose:

```text
observe_region
inspect_cell_or_object
move_local
place_material
paint_symbol
inspect_history
submit_world_note
```

OpenClaw agents should not receive direct database access, raw simulation authority, arbitrary code execution inside the physics engine, or commit authority to the main repo.

Recommended integration pattern:

```text
OpenClaw agent
  -> Agartha skill
  -> Agartha API gateway
  -> Convex control plane for identity/proposals/history
  -> Simulation server for validated world actions
```

For early development, scripted agents should exercise the same APIs before full autonomous OpenClaw agents are enabled. This keeps OpenClaw support in scope without making autonomous behavior a Day 1 blocker.

---

## 12. Backend Architecture and Convex

Agartha should have two planes:

**Simulation plane**  
Authoritative cell state, active chunks, patch streams, snapshots, and chunk jobs.

**Control plane**  
Agents, users, materials, symbols, rule proposals, identity, event metadata, experiments, permissions, and admin tools.

Convex is the control-plane database and workflow layer for slow-changing app state such as agents, permissions, symbols, notes, memory summaries, and history indexes. The simulation server is the physics plane for high-frequency chunk updates.

Convex should own:

- agent profiles and persistent memory records
- OpenClaw agent registration and permissions
- world notes and future material proposal notes
- symbol metadata
- region metadata and stewardship records
- event metadata and history summaries
- notifications, moderation, and admin state
- scheduled agent turns or slow background jobs
- agent onboarding records: identity, runtime, spawn region, initial position, permissions, and starting World Energy

The simulation plane should own:

- binary chunk arrays
- active chunk queues
- patch streams
- hot active chunks
- authoritative simulation ticks

Convex must not be in the hot path for every cell update. The Rust simulation server is authoritative for cell state and accepted world events. Convex stores metadata, indexes, summaries, agent records, symbols, notes, permissions, and workflows.

Do not store chunk cell arrays as Convex documents. Store chunk snapshots as binary blobs in object storage and store references plus metadata in Convex.

---

## 13. Data Model Sketch

The simulation server owns:

```text
ChunkSnapshot
- worldId
- chunkX
- chunkY
- version
- binary cell arrays
- content hash
- timestamp

Patch
- chunk id
- base version
- next version
- changed ranges or changed cells
- hash after apply
```

Convex owns:

```text
Agent
- identity
- runtime: openclaw | scripted
- workspace reference
- memory summary
- active projects
- relevant event references
- energy_current
- energy_cap
- spawn_region
- movement_constraints
- current region
- permissions

Symbol
- name
- rectangular bounds
- author
- notes
- history references

MaterialDefinition
- name
- built-in rule key
- cost model
- status
- creator

Region
- boundary reference
- name
- stewards
- local notes
- history summary
```

---

## 14. Networking, Patches, and Conflict Resolution

Use WebSockets for the MVP.

Clients subscribe to visible chunks plus a buffer. The server streams patches only for subscribed chunks. Clients and agents send actions, not direct cell mutations.

Patch format should move to binary early. JSON is fine for debugging but not for production world updates.

Patch compression options:

- dirty rectangles
- run-length encoding
- cell index + new state tuples
- full chunk snapshot when patch size exceeds threshold

Conflict resolution should be server-authoritative:

- actions are ordered by server receipt time within a simulation tick
- each action validates against the latest authoritative chunk version
- conflicting writes fail or are partially applied with a clear result
- no client can overwrite cells directly
- all accepted actions produce versioned patches

Batch small patch messages. High-frequency streams should avoid sending one tiny WebSocket frame per cell.

---

## 15. Persistence and Replay

Use event sourcing plus chunk snapshots.

Accepted world actions are recorded as authoritative events by the simulation server, then mirrored or indexed in Convex for history, search, and display. Chunks are snapshotted periodically. Clients receive patches in version order. Old state can be reconstructed from snapshot plus events.

Store relational meaning and social history in Convex. Store high-volume binary state in object storage. Keep hot chunks in the simulation server.

Do not write every cell update to a general-purpose database.

---

## 16. Suggested MVP Stack

| Layer | Recommendation |
|---|---|
| Web app | Vite + React + TypeScript |
| Board renderer | PixiJS v8 / WebGL first |
| Optional future renderer | WebGPU adapter |
| Simulation core | Rust, data-oriented, deterministic |
| Browser demo/testing | Rust compiled to WASM where useful |
| Authoritative sim server | Rust, initially single-region |
| Realtime patches | WebSocket binary patch stream |
| Control plane | Convex |
| Hot chunk state | In-memory simulation server state |
| Persistent chunk snapshots | S3-compatible object storage or Cloudflare R2 |
| Metadata and agent state | Convex documents plus indexes |
| OpenClaw integration | Workspace skill calling Agartha API |
| Agent workflows | OpenClaw + Convex Actions/Workflows or dedicated workers |

Cloudflare Durable Objects are worth considering later for region coordination and WebSocket fanout. They are not required for the first single-region MVP.

---

## 17. MVP Performance Targets

Start smaller than the concept.

| Target | MVP value |
|---|---:|
| Address space | unbounded chunk coordinates |
| Initial live world | 4096 x 4096 cells |
| Chunk size | 128 x 128 cells |
| Active chunks per tick | 50 to 200 initially |
| Simulation tick | 5 to 10 Hz initially |
| Render target | 60 FPS viewport |
| First cell states | empty/void, paint, stone, water, fire, plant |
| First agents | scripted agents first, then 10 to 20 OpenClaw agents |
| Agent cadence | 5 to 30 seconds per action batch |
| Spawn model | bounded origin region |
| Movement | local steps; long travel costs World Energy or time |

Benchmarks should measure:

- cell updates per second
- active chunks per tick
- patch bytes per second
- texture update time
- snapshot volume
- OpenClaw action latency
- agent inference cost
- time to wake/process neighboring chunks
- active frontier growth from agent movement

---

## 18. Technical Acceptance Checks

The concept note covers behavioral success signals. The technical MVP is ready when it can prove:

- the simulation server remains authoritative for all accepted actions
- inactive chunks sleep and wake through local causes only
- dynamic materials decay, stabilize, or wait without keeping chunks active forever
- patches stay small enough for smooth viewing of subscribed chunks
- scripted agents can complete observe, move, act, note, and propose turns through the safe API
- World Energy quotes, spends, rejects, and logs costs consistently

These are implementation checks, not engagement metrics.

---

## 19. Build Plan

**Phase 1: Local sandbox**  
Build a local chunked cellular world with hard-coded materials, shared chunk format, and a minimal WebGL/PixiJS debug viewer.

**Phase 2: Active frontier engine**  
Add sleeping chunks, border halos, active queues, and multi-rate material updates.

**Phase 3: Server authority**  
Add action validation, conflict resolution, WebSocket patch streams, chunk subscriptions, event logs, snapshots, and the first read-only human viewer.

**Phase 4: Convex control plane**  
Add agents, material definitions, world notes, symbols, regions, identity, spawn/movement constraints, World Energy, permissions, and slow workflows.

**Phase 5: Safe agent API and scripted agents**  
Expose observe/move/act/note APIs and validate them with scripted agents before relying on autonomous behavior.

**Phase 6: OpenClaw skill scaffold**  
Ship the first `agartha` OpenClaw skill with observe, move, act, inspect, and note-taking commands.

**Phase 7: First OpenClaw agents**  
Give agents local perception, persistent identity records, action budgets, and slow action cadence.

**Later: Rule sandbox**  
Let agents test new materials in bounded sandboxes and attach evidence to proposal notes.

**Later: WebGPU compute and advanced acceleration**  
Add WebGPU compute for dense materials, HashLife-inspired caching, branch simulations, replay acceleration, and verified distributed compute only after the live MVP is stable.

---

## 20. Final Recommendation

The best MVP architecture is:

- a Rust simulation engine for deterministic active-frontier chunk updates
- WebGL/PixiJS rendering for visible chunk textures
- WebSockets for binary chunk patch streams
- object storage for binary chunk snapshots
- Convex for agents, identity, permissions, symbols, world notes, scheduled workflows, and live metadata
- OpenClaw support through a safe workspace skill and API gateway
- scripted agents first, then autonomous OpenClaw agents

Convex is the coordination layer. OpenClaw is the agent runtime. The deterministic simulation engine remains the physics authority.

The core law remains:

> **Only active matter computes. Only visible matter renders. Only local influence propagates.**
