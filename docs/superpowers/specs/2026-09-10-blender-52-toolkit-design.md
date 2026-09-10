# Blender 5.2 toolkit

User approved all five proposed modeling upgrades, locally and in the cloud, and the cloud verification file transfers. Keep the existing Y-up starter toolkit and static GLB contract.

Provide a separate, self-contained `scripts/blender/advanced_kit.py` entrypoint which uses Blender 5.2 APIs and loads a sibling `baking.py`. Expose arch, stairs and column generators as editable Geometry Nodes objects; expose an SDF rock cluster generator converted to mesh; expose a Mesh Bevel helper. Use actual bundle and closure nodes for shared generator finishing behavior, not metadata-only substitutes. Parameters must be usable through Python and visible in Blender.

Provide material baking on disposable evaluated mesh copies, producing a returned object with packed PBR textures. Preserve original scene/object/material data and restore render/selection state on success and failure. Include a procedural material preset to demonstrate the baking path. Bound image resolution and geometry complexity. Reject unsupported materials clearly rather than silently losing detail.

Serve the advanced toolkit and baking module alongside the existing toolkit; bundle all three into the cloud image at `/opt/agartha/toolkit/`. Document exact loading and supported APIs. Verify editable geometry, parameter changes, exported geometry and textures using real Blender locally and in the same cloud image. Preserve historical provenance and unrelated index.html edits. Activate the worker image only after validation, then deploy broker and scoped web guidance. Do not alter customer financial state or existing assets.
