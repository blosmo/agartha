"""Verify offline Essentials discovery, reuse and evaluated GLB export."""
import json
import tempfile
from pathlib import Path

import bpy

root = Path(bpy.utils.system_resource('DATAFILES', path='assets'))
assert root.is_dir(), 'Blender Essentials must be bundled in the runtime'
library = root / 'nodes' / 'geometry_nodes_essentials.blend'
with bpy.data.libraries.load(str(library), assets_only=True) as (source, target):
    assert 'Smooth by Angle' in source.node_groups
    target.node_groups = ['Smooth by Angle']
group = target.node_groups[0]
assert group.bl_idname == 'GeometryNodeTree' and group.library is None
bpy.ops.mesh.primitive_cube_add()
obj = bpy.context.object
modifier = obj.modifiers.new('Essentials smoothing', 'NODES')
modifier.node_group = group
bpy.context.view_layer.update()
evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
assert len(evaluated.data.polygons) == 6
with tempfile.TemporaryDirectory() as directory:
    path = Path(directory) / 'essentials.glb'
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, export_apply=True)
    assert path.read_bytes().startswith(b'glTF') and path.stat().st_size > 1000
assert modifier.node_group == group, 'Export must retain the editable Essentials modifier'
print('ESSENTIALS_VERIFIED ' + json.dumps({'asset': group.name, 'local': group.library is None, 'faces': 6, 'exported': True}))
