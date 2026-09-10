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
# 54k evaluated quads are 108k triangles: budget by delivery topology.
budget_array = cube.modifiers.new('Triangle budget fixture', 'ARRAY')
budget_array.count = 9000
try:
    exec(code, {})
except AssertionError as error:
    assert 'evaluated model' in str(error)
else:
    raise AssertionError('Export accepted more than 100k evaluated triangles')
finally:
    cube.modifiers.remove(budget_array)
bevel = cube.modifiers.new('Export evaluated geometry', 'BEVEL')
bevel.width = 0.15
bevel.segments = 2
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
assert sum(doc['accessors'][p['indices']]['count'] for p in doc['meshes'][0]['primitives']) > 36, 'GLB lost the bevel modifier'
assert len(cube.data.polygons) == 6 and cube.modifiers.get(bevel.name), 'Export applied source modifiers'
assert (output / 'preview.png').stat().st_size > 1000
assert (output / 'model.blend').stat().st_size > 1000
assert (output / 'model.blend').read_bytes().startswith(b'BLENDER'), 'Managed source must match the artifact validator, not Blender 5.2 default compression'
print('MANAGED_EXPORT_RESULT ' + json.dumps({'modelOnly': True, 'meshes': 1, 'preview': True, 'editableSource': True}))

# The delivery render must never re-export an unreviewed geometry change or save
# it over the accepted editable source. Evaluate the exact production render code.
studio_module = ast.parse(source.with_name('studio.py').read_text())
render_scope = {'EXPORT_CODE': next(ast.literal_eval(node.value) for node in module.body if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == 'EXPORT_CODE' for target in node.targets))}
for node in studio_module.body:
    if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id in {'EXPORT', 'FINAL_EXPORT', 'FINAL_RENDER'} for target in node.targets):
        exec(compile(ast.Module(body=[node], type_ignores=[]), '<managed render code>', 'exec'), render_scope)
accepted_source = (output / 'model.blend').read_bytes()
accepted_geometry = (output / 'model.glb').read_bytes()
cube.location.x += 0.25
exec(render_scope['FINAL_RENDER'].replace('/workspace/artifacts', str(output)), {})
assert (output / 'model.glb').read_bytes() == accepted_geometry, 'Final render replaced independently reviewed geometry'
assert (output / 'model.blend').read_bytes() == accepted_source, 'Final render replaced the accepted editable source'
cube.location.x -= 0.25
print('MANAGED_FINAL_RENDER_RESULT ' + json.dumps({'acceptedGlbPreserved': True, 'acceptedSourcePreserved': True}))

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

# A front-facing long object can fit in the preview but clip in side views.
# Exercise all delivered angles without rendering another set of frames.
from bpy_extras.object_utils import world_to_camera_view
for projection in ('PERSP', 'ORTHO'):
    cube.scale = (0.1, 0.5, 0.1)
    cube.location = (2, 3, 4)
    modifier = cube.modifiers.new('Evaluated bounds', 'ARRAY')
    modifier.count = 3
    modifier.relative_offset_displace = (0, 1, 0)
    camera.rotation_mode = 'QUATERNION'
    camera.data.type = projection
    camera.data.ortho_scale = 0.5
    camera.data.shift_x = 0.2
    camera.data.shift_y = -0.1
    camera.data.dof.use_dof = True
    camera.location = cube.location + Vector((0, -1.2, 0.3))
    camera.rotation_euler = (cube.location - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.image_settings.media_type = 'VIDEO' if projection == 'ORTHO' else 'IMAGE'
    scene.render.image_settings.file_format = 'FFMPEG' if projection == 'ORTHO' else 'JPEG'
    scene.render.resolution_x, scene.render.resolution_y = 640, 360
    scene.render.pixel_aspect_x, scene.render.pixel_aspect_y = 2, 1
    scene.render.use_border = True
    scene.cycles.use_denoising = False
    scene.cycles.adaptive_threshold = 0.02
    before = (camera.data.ortho_scale, camera.data.shift_x, camera.data.shift_y, camera.data.dof.use_dof)
    try:
        run_video(turnaround.START_CODE)
        saved = scene['_agartha_turnaround_state']
        try:
            run_video(turnaround.START_CODE)
        except AssertionError:
            assert scene['_agartha_turnaround_state'] == saved, 'Duplicate setup destroyed restoration state'
        else:
            raise AssertionError('Duplicate setup must fail')
        for frame in range(turnaround.FRAMES):
            run_video(turnaround.frames_code(frame, frame + 1).replace('bpy.ops.render.render(write_still=True, scene=scene.name)', 'bpy.context.view_layer.update()'))
            evaluated = cube.evaluated_get(bpy.context.evaluated_depsgraph_get())
            points = [world_to_camera_view(scene, scene.camera, evaluated.matrix_world @ Vector(corner)) for corner in evaluated.bound_box]
            assert all(0.059 <= p.x <= 0.941 and 0.059 <= p.y <= 0.941 and p.z > 0 for p in points), (projection, frame, points)
    finally:
        run_video(turnaround.CLEANUP_CODE)
    state = json.loads(saved)
    assert all(getattr(scene.render, key) == value for key, value in state['render'].items())
    assert all(getattr(scene.cycles, key) == value for key, value in state['cycles'].items())
    assert scene.render.image_settings.file_format == state['format']
    assert scene.render.image_settings.media_type == state['media_type']
    assert scene.camera == camera
    assert before == (camera.data.ortho_scale, camera.data.shift_x, camera.data.shift_y, camera.data.dof.use_dof)
    cube.modifiers.remove(modifier)
print('MANAGED_CAMERA_RESULT ' + json.dumps({'projections': 2, 'viewsPerProjection': turnaround.FRAMES, 'clippedViews': 0, 'settingsRestored': True}))
