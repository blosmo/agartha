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

# Run the actual chunked movie pipeline with the same camera and classified model.
import importlib.util
spec = importlib.util.spec_from_file_location('managed_turnaround', source.with_name('turnaround.py'))
turnaround = importlib.util.module_from_spec(spec)
spec.loader.exec_module(turnaround)
def run_video(code):
    exec(code.replace('/workspace/artifacts', str(output)).replace('/workspace/turnaround', str(output / 'frames')), {})
try:
    run_video(turnaround.START_CODE)
    for start in range(0, turnaround.FRAMES, 8):
        run_video(turnaround.frames_code(start, start + 8))
    run_video(turnaround.ENCODE_CODE)
finally:
    run_video(turnaround.CLEANUP_CODE)
video = (output / 'turnaround.mp4').read_bytes()
assert video[4:8] == b'ftyp' and len(video) > 1000
assert bpy.context.scene.camera == camera, 'Movie rendering changed the original camera'
assert bpy.data.objects.get('AGARTHA_TURNAROUND_CAMERA') is None
print('MANAGED_VIDEO_RESULT ' + json.dumps({'frames': turnaround.FRAMES, 'fps': turnaround.FPS, 'bytes': len(video), 'cameraRestored': True}))
