# Blender 5.2 modeling toolkit

Use these tools in Blender 5.2.1 LTS. They complement the [starter toolkit](blender-toolkit.py) and [export/preview workflow](blender-quality.md).

## Load locally or on a worker

Download [advanced_kit.py](blender-advanced.py), [baking.py](blender-baking.py) and [starter_kit.py](blender-toolkit.py) for local Blender. On cloud workers, all three are preinstalled under `/opt/agartha/toolkit/`:

```python
import runpy
advanced = runpy.run_path('/opt/agartha/toolkit/advanced_kit.py')
baking = runpy.run_path('/opt/agartha/toolkit/baking.py')
kit = runpy.run_path('/opt/agartha/toolkit/starter_kit.py')
```

Loading does not reset the scene. Reload the modules in each MCP call because execution namespaces are not retained. For local Blender, replace those paths with your downloaded files. Read function docstrings with `help(advanced['create_arch'])` for full signatures and limits.

## Editable procedural geometry

`create_arch`, `create_stairs`, and `create_column` create mesh objects driven by Geometry Nodes. Their parameters remain editable in Blender's modifier panel and through `set_parameters(obj, width=..., height=...)`. Invalid combinations are rejected before any parameter changes. Public positions use Y-up coordinates, matching the starter toolkit. Native `bpy` coordinates remain Z-up.

`create_rock_cluster` uses SDF volume grids and converts the surface back into a mesh for static export. Start with coarse resolution: finer voxels can increase memory and polygon counts quickly. Keep the returned object editable in the saved `.blend`.

`add_mesh_bevel` uses the Blender 5.2 Mesh Bevel node for procedural edge treatment. The generators share a finishing group: a typed bundle carries bevel width, segment count and material into an evaluated closure. Those controls remain part of the editable node graph. For existing meshes, `add_mesh_bevel(obj, width=.02, segments=2)` adds a separate node modifier.

## Bake procedural materials for GLB

Create a procedural stone or wood material with `baking['procedural_material']`. Use `baking['bake_materials']` to create a separate mesh with packed PBR textures. The baker accepts one effective evaluated Principled material with procedural base color, roughness, metallic and optional bump-derived normals. Image/UV-dependent inputs, nested shader groups, view-dependent effects, displacement and non-default extra shader features are rejected. It produces two packed maps (base color and metallic-roughness), plus a tangent normal map when needed. Resolution is limited to 16–2048 pixels, samples to 1–128, and evaluated geometry to 100,000 triangles.

Managed exports automatically bake supported procedural materials on disposable copies, retaining the native source meshes and shaders in `AGARTHA_MODEL`. This covers up to 16 single-material meshes at 512 pixels and four CPU samples per map. Base color, metallic-roughness and optional bump normals are embedded in the GLB; constant cloth sheen is preserved separately. Unsupported graphs return a repair error. Split procedural material regions into separate meshes or pre-bake them when outside these limits. Keep presentation-only geometry in `AGARTHA_STUDIO`.

For direct or manual exports, the object returned by `bake_materials` is the delivery mesh; avoid exporting both overlapping versions. If you pre-bake a managed model yourself, put the baked delivery object in `AGARTHA_MODEL` and move the native source to a separate source collection.

Start with low texture resolution and samples for review; raise resolution only for visible detail. Baking stores surface properties, not studio lighting or ambient shadows. Save the editable source before static GLB export, then inspect the exported GLB in the destination viewer.

## Example: editable stone portal

```python
stone = baking['procedural_material']('Portal stone', preset='stone', scale=5, seed=3)
portal = advanced['create_arch']('source_portal', width=3, height=4,
    thickness=.35, depth=.6, material=stone, loc=(0, 0, 0))
advanced['set_parameters'](portal, width=3.4, bevel=.025)
delivery = baking['bake_materials'](portal, resolution=256, samples=4)
delivery.name = 'deliver_portal'
kit['save_source']('/workspace/artifacts/portal.blend', prefix='source_portal')
print(kit['export_runtime']('/workspace/artifacts/portal.glb', prefix='deliver_portal'))
```

The arch's width/height are outer dimensions; height must exceed half its width and thickness must be less than half its width. Stairs use `steps`, `width`, `run` and `rise` and ascend along public +Z. Columns use `radius`, `height` and `vertices`. Rocks use `rocks`, `radius`, `resolution` and `seed`; their lowest surface sits at the supplied Y position. `loc` is a constructor argument; move an existing object using Blender coordinates or the starter toolkit's coordinate conversion.

## Delivery checks

Use the starter toolkit's `export_runtime` for static models. Inspect its triangle, vertex, material-group and byte counts. Agartha accepts at most 100,000 triangles, 64 primitives, 16 embedded images up to 2048 pixels per dimension, and 16 MB per GLB. These are ceilings, not targets.

Geometry Nodes, bundles, closures and SDF operations remain in the `.blend` source. Static GLB delivery contains their evaluated mesh result. Live simulations and audio-reactive behavior require a separate animation/runtime workflow.
