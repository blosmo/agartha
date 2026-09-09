"""Exercise the real managed export code without AI calls or paid workers."""
import ast
import json
from pathlib import Path
import struct
import sys

import bpy
from mathutils import Vector

output = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
output.mkdir(parents=True, exist_ok=True)
source = Path(__file__).resolve().parents[2] / 'cloud/blender_billing/managed.py'
module = ast.parse(source.read_text())
code = next(ast.literal_eval(node.value) for node in module.body if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == 'EXPORT_CODE' for target in node.targets))
code = code.replace('/workspace/artifacts', str(output))
bpy.ops.wm.read_factory_settings(use_empty=True)
try:
    exec(code, {})
except AssertionError as error:
    assert 'AGARTHA_MODEL' in str(error)
else:
    raise AssertionError('An unclassified scene must not be exported.')
model = bpy.data.collections.new('AGARTHA_MODEL')
studio = bpy.data.collections.new('AGARTHA_STUDIO')
bpy.context.scene.collection.children.link(model)
bpy.context.scene.collection.children.link(studio)
bpy.ops.mesh.primitive_cube_add(size=2)
cube = bpy.context.object
cube.name = 'Deliverable cube'
for collection in list(cube.users_collection): collection.objects.unlink(cube)
model.objects.link(cube)
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -1.1))
floor = bpy.context.object
floor.name = 'Studio floor must not export'
for collection in list(floor.users_collection): collection.objects.unlink(floor)
studio.objects.link(floor)
bpy.ops.object.camera_add(location=(4, -6, 4))
camera = bpy.context.object
camera.rotation_euler = (-camera.location).to_track_quat('-Z', 'Y').to_euler()
bpy.context.scene.camera = camera
bpy.ops.object.light_add(type='AREA', location=(1, -3, 5))
bpy.context.object.data.energy = 1000
bpy.context.object.data.shape = 'DISK'
bpy.context.object.data.size = 5
exec(code, {})
data = (output / 'model.glb').read_bytes()
doc = json.loads(data[20:20 + struct.unpack_from('<I', data, 12)[0]])
assert [node['name'] for node in doc['nodes']] == ['Deliverable cube'], 'GLB included presentation geometry'
assert len(doc['meshes']) == 1
assert (output / 'preview.png').stat().st_size > 1000
assert (output / 'model.blend').stat().st_size > 1000
print('MANAGED_EXPORT_RESULT ' + json.dumps({'modelOnly': True, 'meshes': 1, 'preview': True, 'editableSource': True}))
