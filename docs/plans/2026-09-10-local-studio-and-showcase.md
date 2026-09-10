---
title: Local Blender studio and component showcase
status: active
---

## Outcome

Release the approved modular component system, run the same Blender authoring stack locally to avoid hosted generation costs, and publish three visually reviewed landing-page models with editable sources and reusable components.

## Implementation units

### U1 — Approved component release

- Goal: deploy commit 42289ec through existing GitHub, Convex, Modal and Vercel services.
- Files: existing release commit, no source edits for deployment.
- Approach: PR checks/review, image build with preserved credentials, coordinated backend/broker/frontend rollout.
- Verification: checks pass; live capability and guide content; exact worker-image ID. No new paid benchmark required.

### U2 — Local Blender runtime

- Goal: persistent local MCP studio using pinned cloud Blender 4.5.0, upstream add-on and the existing service/helpers.
- Files: cloud/blender_mcp/local.py, service.py, local tests, scripts/blender/local_studio.py, local guide. Do not edit showcase files.
- Approach: configurable workspace instead of /workspace, loopback-only HTTP with local token, pinned add-on setup, shared material/toolkit paths, clean process shutdown, command to execute scripts locally. No billing/provider calls.
- Verification: actual local MCP inspect/edit/export/render/save roundtrip and unit checks. Document exact dependency parity and limits.

### U3 — Showcase models

- Goal: three distinct polished models: conservatory, lantern courtyard, celestial instrument.
- Files: scripts/showcase/, apps/web/public/compute/gallery/ new model folders, local component bundles.
- Approach: original Blender scripts using shared procedural/PBR materials and components; repeated modules and independent variants for scenes; focused sculptural modeling for the single instrument; review renders before final export.
- Verification: rendered geometry matches downloadable model; GLB validation; isolated reusable component sources; model statistics and provenance.

### U4 — Landing-page integration

- Goal: show the models prominently with interactive inspection and source downloads.
- Files: apps/web/public/compute/index.html and relevant CSS; apps/web/src/compute/galleryViewer.ts if needed; gallery tests.
- Approach: preserve current landing design and viewer; use authentic renders with correct local-generation provenance.
- Verification: live/local browser desktop and narrow-width views, each model opens/orbits and source files resolve, no misleading hosted benchmark claims.

U2 can run independently while U1 and U3 progress. Parent owns commits and release coordination. Preserve unrelated worktree changes. Public sample publication is explicitly authorized by the current user request; do not invoke paid inference when local authoring suffices.

### U5 — Procedural shared templates (user steering)

- Goal: a canonical template generates variations from typed knobs, retaining template ID and parameter values.
- Files: cloud/blender_mcp/asset_templates.py; scripts/showcase/chair-template.json; scripts/blender/verify_asset_templates.py; protocol/backend template catalog and managed action integration (parent-owned).
- Approach: constrained declarative JSON geometry recipe, typed defaults/bounds/enums/colors/booleans, safe expression evaluation without Python eval, generated-object and expression budgets. Canonical chair offers proportions, legs, arms, back design, upholstery and finishes. Public template versions immutable; generated components carry template provenance and resolved parameters.
- Verification: many chair variants from one definition; invalid knobs and oversized recipes fail before changing scene; no arbitrary source execution; schema/worker parity; shared template discovery and per-job component publication preserve provenance.
