# Connected isometric plots and agent world-building tools

## Goal

Continue the shared-world infrastructure with an explorable isometric grid: each land plot is a contained world with visible, permeable boundaries. Give agents composable tools to create compelling scenes and verify their work visually.

## Product decisions

- A plot is one world at a stable integer grid address. Each plot has a 32×32-unit footprint and local XYZ coordinates, its own brief/history, and independent edit authority.
- Permeability means visible neighbors and traversable gateways on the four cardinal edges. Discovery/traversal does not grant write access. Hosted credentials remain scoped to one world.
- Orthographic isometric overview shows a bounded neighborhood; users and agents can focus a plot or visit a neighboring plot. No unbounded whole-grid snapshot.
- Preserve the existing Commons and authored objects. Add starter neighboring plots as persisted examples. New plot creation is explicit.
- Tool primitives remain observe/edit/inspect/preview. Deterministic terrain, grove, pavilion, path and landmark builders are optional recipes producing ordinary editable objects. Every tool supports a proposal preview before commit, uses bounded parameters, and obeys plot bounds/revision checks.
- The web UI and agent API consume the same tool catalog and generator. Onboarding starts from the selected plot and includes discovery, creation tools, gateway traversal and vgpu inspection.
- vgpu continues rendering scene JSON; connected-grid previews carry the same plot placement and use an isometric camera.

## Implementation

1. Shared plot coordinates/bounds and builder catalog in packages/protocol; test boundaries, deterministic output and limits.
2. Per-plot local persistence with legacy-origin alias, neighborhood reads, plot creation, tool proposal/commit and traversal endpoints. Preserve the existing world file; keep queues independent per plot.
3. Hosted plot-address indexes, bounded atlas discovery, gateway discovery, plot-bound edit validation and recipe execution through authenticated scene transactions. Existing non-plot staging worlds retain their current API compatibility.
4. Isometric neighborhood viewport with instanced objects, visible edge membranes/gateways, plot picking, focus/overview controls and keyboard-accessible plot navigation.
5. Selected-plot brief/activity/objects, builder controls, scoped onboarding and previews.
6. Tests/build, real browser desktop/mobile checks, local agent tool flow and vgpu output. Deploy/test hosted changes only after local verification; keep the approved private staging world isolated.

## Continued infrastructure limits

Prior live test: 1,000 identities and ten-object edits, ~112 verified edits/s. Sustained 5,000-agent load and subscriber fanout remain unproven. Plot partitioning complements object-level concurrency; it is not itself a new throughput claim. Preserve the existing benchmark artifacts.

## Shared reusable library (user addition)

- Publish immutable object assemblies (up to 100 primitive parts) and procedural surface shaders to the shared grid library.
- Place an asset through a prepare/commit flow with position, scale and heading, producing normal editable objects with attribution. Reuse across plots; preserve plot bounds and gateways.
- Shader authoring uses a bounded, typed surface-expression interface (`position`, `normal`, `color`, `time`, vector/math functions and noise). Compile this into both WGSL for vgpu and GLSL for the interactive viewport. No user JavaScript execution.
- Apply shaders by immutable ID; new shader revisions create new IDs, avoiding silent changes to existing worlds. Validate references before writes and include shader definitions in visual inspection.
- Keep server-side rendering isolated and bounded. Hosted library access/publishing inherits grid scope and authenticated agent identity.
