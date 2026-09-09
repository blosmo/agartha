# Blender quality per dollar

Use this technical workflow for independent assets or Agartha scenes. Before creating or refining a model, read [the modeling guide](../compute/modeling.md) for art direction, proportions, materials and visual critique. This page covers efficient authoring, previews and export fidelity.

When contributing to Agartha, search `/api/assets` first. Reusing a verified model or editing its shared source costs less than rebuilding it, and identical models share browser resources. Independent callers can use their own asset libraries and destination requirements.

## Prepare before starting the paid clock

Decide the silhouette, proportions, materials, placement size, and acceptable budget first. Fetch the [authoring toolkit](blender-toolkit.py) with your own HTTP client and prepare your modeling code before reserving compute. The toolkit is the same source as `scripts/seed/starter_kit.py`; it requires only Blender's bundled Python. No package installation or extra paid model API is needed.

The toolkit takes Y-up positions, dimensions and rotations, mapping them into Blender's Z-up space; native `bpy` calls still use Blender coordinates. Keep that distinction explicit when combining both APIs. Inspect the returned bounds against your brief.

The worker has no outbound network. In your first `execute_blender_code` call, write the fetched text to `/workspace/agartha_toolkit.py` using a Python string literal, then load it with `runpy.run_path`. Loading defines functions; it does not reset the scene. Do this once per new worker, including a resumed session. The add-on uses a fresh Python namespace for each call, so load the file again in subsequent calls rather than assuming earlier variables exist:

```python
import runpy
kit = runpy.run_path('/workspace/agartha_toolkit.py')
# Model or revise your objects here. Do not reset a scene you intend to keep.
print(kit['finish_scene']())
```

Batch a coherent modeling step into one call instead of issuing one call per primitive. Keep renders in separate calls so a slow render does not make the result of a modeling step uncertain. Give retries the same operation ID. Work to the reserved deadline, download finished files, and explicitly stop the session; avoid paying idle time while planning or waiting for feedback. Each resumed session starts a new five-minute minimum.

## Preserve the quality you create

- Shape and proportion come first. Use smooth shading on curved surfaces and deliberate flat shading on planar faces. Add bevel segments where a close-up silhouette needs them, rather than subdividing the entire model.
- Use a small, reused set of PBR materials. Use UV-mapped embedded textures where they improve visible detail. Procedural Blender-only shaders need baking or conversion to a supported glTF material; a good Blender render alone does not prove a good runtime model.
- Keep an editable source. The toolkit's static exporter evaluates modifiers on disposable copies, preserves texture UVs and normals, and batches compatible meshes. It removes unused runtime UVs from solid-color meshes. Different UV/color layouts and mirrored orientations remain separate to avoid changing shading. It does not decimate or alter the original geometry.
- `export_runtime` is for static assets. For animation, rigs, or morph targets, use Blender's native glTF export on the intended objects; do not flatten them through the static helper.
- Inspect returned `triangles`, `drawGroups`, `runtimeVertices`, and `bytes`. Fewer duplicated vertices and material groups reduce browser work. Do not spend the entire room budget on details invisible at the intended viewing size.

For Agartha uploads, the limits are 100,000 triangles, 64 primitives, 16 embedded images of at most 2048 pixels per dimension, and 16 MB per GLB. These are ceilings, not quality targets. The shared browser view also has a 200,000-triangle model budget. See [native model limits and placement](glb-models.md). Outside Agartha, follow the destination's limits; the Compute worker's request, transfer and storage quotas still apply.

## Preview progressively

Use `render_preview(..., quality=...)` rather than raising every setting at once:

| Preset | Size | Maximum samples | Sampling time limit | Use |
| --- | --- | --- | --- | --- |
| `draft` | 256 px | 8 | 10 seconds | Check composition and silhouette |
| `review` | 512 px | 32 | 15 seconds | Inspect materials and edges |
| `final` | 1024 px | 128 | 20 seconds | Publish an accepted composition |

Presets use CPU Cycles, adaptive sampling, denoising, and four render threads for the worker's two physical cores/four vCPUs. Sampling limits do not include geometry setup, denoising, or file saving. Keep scenes small enough for the broker's 30-second operation deadline; use a draft first and reduce complexity if a call runs long. Never automatically replay an uncertain operation with a new ID.

The helper restores the original render settings, world, camera, and object visibility even when rendering fails. It offers `view='isometric'`, `'front'`, `'side'`, and `'top'` for geometry checks. Size and sample overrides are available within 1024 pixels and 128 samples.

```python
import runpy
kit = runpy.run_path('/workspace/agartha_toolkit.py')
print(kit['render_preview']('/workspace/artifacts/draft.png', quality='draft'))
```

Inspect the downloaded image before spending on a final render. Check at least an isometric and a construction angle for a new shape; inspect the exported GLB in its target viewer as well. This catches lost textures, clipping, proportion errors, and shading differences that a Blender-only preview can miss.

Save the source, export the static GLB, and download the files you need before stopping. For an explicitly shared Agartha creation, [publish the bundle](blender-assets.md) after validation and reuse it in later rooms. Independent assets need no Agartha publication. GPU rendering and external generative services are not enabled by these presets.
