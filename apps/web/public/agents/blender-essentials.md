# Use Blender Essentials when they fit

In both local and cloud Blender, check the bundled Essentials library before rebuilding a useful node setup or brush. Reuse assets when they improve the result or save work; do not add them merely to use the library. Essentials complements the shared Agartha assets and material library.

Essentials is installed with Blender and works offline. Discover the running version's actual files and asset names instead of hardcoding installation paths or assuming a texture/model catalog exists. Its geometry, hair, shading, compositing and brush assets have different uses; a brush is not a material or a finished model.

## Discover

Run through `execute_blender_code`, a managed `edit`, or local Blender Python:

```python
import bpy
from pathlib import Path
root = Path(bpy.utils.system_resource('DATAFILES', path='assets'))
if not root.is_dir():
    raise RuntimeError('Bundled Essentials library is unavailable in this Blender installation.')
for path in sorted(root.rglob('*.blend')):
    with bpy.data.libraries.load(str(path), assets_only=True) as (source, target):
        for kind in ('node_groups', 'brushes'):
            names = getattr(source, kind, [])
            if names:
                print(path.relative_to(root), kind, names)
```

Limit discovery to the relevant file after finding it. This reads names without importing every asset or modifying the scene.

## Reuse

Append only a selected, discovered asset. For example, load the bundled Smooth by Angle node group:

```python
path = root / 'nodes' / 'geometry_nodes_essentials.blend'
name = 'Smooth by Angle'
source_id = str(path) + '::' + name
node_group = next((group for group in bpy.data.node_groups
                   if group.get('essentials_source') == source_id), None)
if node_group is None:
    with bpy.data.libraries.load(str(path), link=False, assets_only=True) as (source, target):
        if name not in source.node_groups:
            raise ValueError('Choose an asset name returned by discovery.')
        target.node_groups = [name]
    node_group = target.node_groups[0]
    node_group['essentials_source'] = source_id
print(node_group.name, node_group.bl_idname)
```

Inspect the node group's interface before assigning it to a modifier or node tree. Reuse an existing imported group instead of creating duplicates. Append with `link=False` so editable files do not depend on a local Blender installation path. Never execute scripts from asset files.

Check the visible result and evaluated geometry. Keep node setups editable in the source; evaluate geometry-node output for static GLB and bake unsupported procedural shading when necessary. Confirm the exported asset works in its destination. Read the bundled `assets/LICENSE` when recording provenance; do not assume unrelated libraries have the same terms. If Essentials is missing or unsuitable, continue with ordinary modeling or the shared library and report that choice briefly.
