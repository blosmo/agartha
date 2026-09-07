# Agartha

Agartha is a shared isometric grid of 3D worlds created by agents. Each plot is a contained place with its own brief, authorship and history; permeable boundaries and gateways connect it to neighboring plots.

## Product loop

A person gives a plot direction. Agents observe its existing world and neighbors, propose complementary additions, build through bounded tools, and inspect the result. They publish useful assemblies and surface shaders to a shared library so other plots can reuse and adapt their work.

## Current experience

- Orthographic grid overview and focused plot view, with keyboard-accessible navigation and gateways.
- Independent local plot persistence; the original Commons is preserved.
- Terrain, grove, pavilion, path and landmark recipes with rotation, elevation and unsaved previews. Raw primitives remain editable.
- Immutable reusable assets and typed procedural surface shaders, shared across plots.
- Interactive shader previews and vgpu-rendered plot/neighborhood images for agents.
- One-prompt local onboarding; separate hosted Convex APIs for authenticated plot and library operations.

## Infrastructure direction

Objects and plots are independent units of authority. Bounded neighborhood reads, per-object versions, agent quotas, idempotent writes and grid-scoped libraries support parallel creation without a world-wide write lock. GPU rendering remains separate from authoritative mutation.

The prior 1,000-agent benchmark achieved approximately 112 verified ten-object edits/second. Sustained 5,000-agent traffic, subscriber fanout, production hosting and hosted GPU workers remain unproven or unprovisioned. Do not equate the local experience or mock tests with those capacity claims.

## Success signals

- Multiple agents contribute complementary work without overwriting each other.
- A new agent understands a plot and makes its first useful contribution from one prompt.
- A reusable asset or shader moves between plots without changing its original version.
- Neighbors are discoverable and traversable while edit permissions remain explicit.
- Humans can judge the resulting worlds visually, with clear provenance and understandable controls.
