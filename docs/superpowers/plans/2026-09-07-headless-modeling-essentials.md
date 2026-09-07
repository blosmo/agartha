# Headless Modeling Essentials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Implement the user-approved small headless construction toolkit and multi-angle inspection loop.

**Architecture:** Extend deterministic mesh recipes, normalize through the existing shared geometry contract, and use the existing library/placement API. Keep geometry construction separate from room placement. Extend the existing renderer camera and preview payload; preserve current API defaults.

**Tech Stack:** TypeScript, existing protocol geometry functions, Three.js viewer, vgpu PNG renderer, Convex, Vercel.

## Global Constraints

- Inputs must be deterministic and bounded before allocating geometry.
- A rejected recipe must not publish partial state.
- Existing lathe/extrude inputs remain compatible.
- Geometry editing must not require a browser gizmo.
- The tool catalog must describe actual deployed capabilities.
- Reuse existing mesh/storage/render budgets. Do not add a modeling UI or a remote CAD dependency.
- Physical mobile-device performance is unmeasured; a narrow desktop viewport is not device evidence.
- Preserve other workspace changes. The repository has no initial commit; use focused file snapshots for review rather than treating all untracked files as this feature.

## Task 1: Rounded forms and sweeps

**Files:** Create `packages/protocol/src/geometry/essentialForms.ts`, `packages/protocol/src/geometry/essentialForms.test.ts`.

**Interfaces:** Export `essentialForm(recipe: Record<string, unknown>): MeshGeometry` for `roundedBox`, `torus`, and `sweep`. It returns geometry normalized with `normalizeMesh`; source dimensions remain in `bounds`. The orchestrator integrates the dispatch into `modelGeometry`.

- [x] Write tests that initially fail because the function is absent. Check dimensions, finite normalized vertices, unit normals, valid UVs, triangle winding, deterministic output, and rejected invalid/oversized inputs. Example contract:
  ```ts
  const g=essentialForm({kind:'roundedBox',size:[4,2,3],radius:.2,segments:3});
  expect(g.bounds).toEqual([4,2,3]);
  expect(g.normals.every(Number.isFinite)).toBe(true);
  expect(()=>essentialForm({kind:'roundedBox',size:[1,1,1],radius:1})).toThrow();
  ```
- [x] Implement rounded boxes by projecting subdivided box-face vertices from an inner box onto the rounding radius. Use face grids concentrated along each rounded edge, preserve planar face centers, outward winding and face UVs. `size`: positive XYZ dimensions up to 60; `radius` and the remaining inner half-extents: at least 0.0001 source units; `segments`: 1–8 per curved region.
- [x] Implement torus in XZ with Y-up tube cross-section. `radius` is the major radius, `tube` and the major-minus-tube gap are at least 0.0001 source units; expose bounded ring `segments` and `tubeSegments`. Use shared seams with matching normals/UV wrap. Core position equation:
  ```ts
  const p=[(R+r*Math.cos(v))*Math.cos(u),r*Math.sin(v),(R+r*Math.cos(v))*Math.sin(u)];
  ```
- [x] Implement circular-section sweep along an open 3D path. `path`: 2–128 finite XYZ points, absolute coordinates ≤30; `radius`: 0.0001–10; path/sample-ring spacing at least 0.0001 source units; `segments`: 3–32 around the section; `steps`: 1–8 subdivisions per path interval, with total rings ≤256. `smooth` boolean controls Catmull-Rom interpolation versus linear interpolation. `capStart`/`capEnd` default true. Reject duplicate consecutive points, reversals that leave no tangent, and invalid booleans. Use transported frames to avoid abrupt flips; do not divide by a zero cross product. Orient side and cap winding outward; UV longitudinal distance follows the path. Self-intersection from overly thick/tightly bent paths must be stated as a geometry limitation, not silently repaired.
- [x] Preflight vertex/triangle counts against `MESH_LIMITS`, then use `normalizeMesh` for final serialized/storage enforcement. Run `npx vitest run packages/protocol/src/geometry/essentialForms.test.ts` and report exact results.

## Task 2: Full-axis construction transforms and dispatch

**Files:** Create `packages/protocol/src/geometry/modelTransform.ts` and tests; modify `packages/protocol/src/geometry/modeling.ts`, `packages/protocol/src/worldbuilding.ts`, `apps/web/public/agents/modeling.md`.

**Interfaces:** `transformModeledMesh(mesh: MeshGeometry, transform: unknown): MeshGeometry`; optional recipe field `transform: {rotation?: [number,number,number], scale?: [number,number,number]}`. Rotation is degrees, applied X then Y then Z around the source bounding-box center. Scaling is positive XYZ, applied before rotation. Mesh placement still uses returned full XYZ `bounds` for intended proportions.

- [x] Test a non-cubic extruded form rotated 90 degrees around X and Z, combined nonuniform scaling, unchanged default recipes, and rejection of zero/negative/nonfinite scale or malformed rotation.
- [x] Undo normalized source dimensions before construction transforms, transform positions by scale then XYZ rotation, and normals by inverse scale then the same rotation. Re-normalize once at the end. Undo normalized normals with inverse original dimensions first. Translation belongs to room placement because normalization centers every mesh.
  ```ts
  const sourcePosition=mesh.positions.slice(i,i+3).map((n,a)=>n*(mesh.bounds[a]||1));
  const sourceNormal=mesh.normals.slice(i,i+3).map((n,a)=>n/(mesh.bounds[a]||1));
  ```
- [x] Wrap the existing lathe/extrude dispatch without changing their default output. Route the three new kinds to `essentialForm`, then apply an optional transform.
- [x] Update the catalog and agent guide with actual schemas, axes, units, output costs, bounds-based placement, and concrete recipes. Run focused protocol/library tests and protocol/scripts/Convex type checks.

## Task 3: Multi-angle headless inspection

**Files:** Modify `packages/renderer/scene.ts`, `packages/renderer/render.ts`, `apps/web/plotPreview.ts`, `apps/web/worldPreview.ts`, `apps/web/plotServer.ts`, `api/index.ts`, `cloud/render_worker.py` as needed; tests in renderer and scripts; documentation only `apps/web/public/agents/visual-review.md` and `glb-models.md`.

**Interfaces:** `view` query parameter with `isometric` (default), `front`, `side`, `top`; thread it through snapshot, gateway payload, render input and camera fit. Front looks along -Z, side along -X, top along -Y with an explicit nonparallel up vector. All cameras are orthographic, fitted to the requested focus bounds when `focus` is present. `focus` accepts one ID or up to 20 comma-separated IDs so composed assemblies can be inspected without cropping their other parts; canonicalize the selection and require every selected ID to exist. Keep existing time/focus behavior and backward-compatible optional parameters. Focused front/side/top inspections render only the selected parts, preventing unrelated room geometry from obscuring them; isometric focus remains contextual.

- [x] Add failing tests for distinct projection matrices, correct front/side/top framing of unequal dimensions, invalid view rejection, and cache separation.
- [x] Implement a shared validated view enum/parser, preserve the existing isometric output by default, and fit orthographic bounds with a suitable up vector for every view. Respect rotated objects and existing model fitting/clipping.
- [x] Propagate `view` through local and hosted APIs, worker payload and snapshot digest. Invalid values must yield a structured 400 before expensive render work. Add a response header identifying the chosen view.
- [x] Run renderer and focused gateway/preview tests, plus scripts/web/Convex type checks. Report changed files and any unverified integration.

## Task 4: Integrated modeling evidence and release

**Files:** Add a reproducible modeling fixture script under `scripts/`; update operation report and the approved spec's implementation status.

- [x] Build a handled vessel from lathe plus sweep and a softened architectural object from rounded forms and transformed parts through the agent library API.
- [x] Inspect front, side, top and isometric PNGs with PBR highlights. Check proportions, seams, winding, normals, caps and intersections. Adjust fixture geometry or implementation when evidence shows a defect.
- [x] Review focused changes for API compatibility, invalid-input cost, geometry correctness and render-cache consistency. Re-run only tests relevant to fixes, then perform one full integration check.
- [ ] Use the already confirmed real production targets for the release workflow: Vercel Divine Inside/agartha, Convex quaint-ladybug-283, Modal agartha-world-renderer. Honor any action-specific approval boundary, and do not mistake striped-eagle-66 development for production.
- [ ] Verify actual hosted recipes, placement, all inspection views and browser appearance before claiming completion. Record limitations precisely and keep the goal active if any approved core operation remains unfinished.
