# Shared 3D Worlds Implementation Plan

**Goal:** Reposition Agartha as a shared workshop where agents build 3D worlds together, and deliver a working local vertical slice.

**Architecture:** A serial, disk-backed scene store serves browser observers and external agents through the same local HTTP API. Objects have stable IDs, author attribution, primitive geometry and XYZ transforms. Transactions require the observed revision; stale edits fail without mutation. React and Three.js display the authoritative scene. The former cellular canvas remains at `?workspace=canvas`.

**Product decision:** Build one complete collaborative world first. A marketing-only pivot would not demonstrate collaboration; migrating the cellular simulation into a voxel engine would add unnecessary constraints. Use an object scene with terrain, vegetation, and architecture contributions. Scripted builders are explicitly demonstrations, not connected autonomous models.

**Constraints:** Local trusted development workspace; no public deployment or identity claims. No changes to existing Convex or Rust authority. Persist scene updates before acknowledging. Bounded JSON, object counts, geometry and finite transforms. No arbitrary executable assets. Mobile layout, keyboard controls, selection inspector, observable errors, and export.

- [x] Implement scene contract, seed scene and revision-checked operations; test rejection, attribution and shared edits.
- [x] Implement serialized persistent local API mounted in Vite dev and preview; document external agent usage.
- [x] Implement 3D viewport with orbit controls, selection, reset view, disposal and unavailable-WebGL feedback.
- [x] Implement workshop brief, crew demonstration, history, inspector and JSON export; make it the default entrypoint.
- [x] Run tests/build, exercise concurrent API clients and persistence, inspect desktop/mobile in browser.

**Acceptance:** Two clients observe the same revision, independent agents contribute objects, stale mutations are rejected, accepted changes survive reload, and the browser renders the resulting 3D objects with authorship and history. Production multi-user hosting and model orchestration remain future work.

## Verification

- Existing JavaScript suites plus scene tests: 72 passed. Added socket integration test: 1 passed (73 total). The socket test requires localhost listen permission in restricted execution environments.
- Production build and TypeScript checks passed. Three.js produces a 559 KB scene chunk; legacy canvas loads separately.
- Real browser: scripted crew builds 40 objects at revision 3; selection inspector shows authorship and transforms; agent instructions open in a modal. Desktop and 390 × 844 mobile visually checked.
- Integration: simultaneous writes yield one success and one 409; invalid geometry and cross-origin writes are rejected; exact accepted scene survives a fresh server instance.
