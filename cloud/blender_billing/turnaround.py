"""Fixed, chunked 360-degree rendering; all work stays in the paid reservation."""
from __future__ import annotations

import json
import time
import uuid
from typing import Any, Callable

FRAMES = 24
FPS = 12
DELIVERY_RESERVE_SECONDS = 90
VIDEO_WINDOW_SECONDS = 180

START_CODE = """
import bpy, json, os, math
from mathutils import Vector
scene = bpy.context.scene
model = bpy.data.collections.get('AGARTHA_MODEL')
assert model and scene.camera, 'A model and preview camera are required.'
bpy.context.view_layer.update()
depsgraph = bpy.context.evaluated_depsgraph_get()
evaluated = [obj.evaluated_get(depsgraph) for obj in model.all_objects if obj.type == 'MESH' and not obj.hide_render]
points = [obj.matrix_world @ Vector(corner) for obj in evaluated for corner in obj.bound_box]
assert points, 'Model geometry is required.'
center = Vector(tuple((min(p[i] for p in points) + max(p[i] for p in points)) / 2 for i in range(3)))
source = scene.camera
assert bpy.data.objects.get('AGARTHA_TURNAROUND_CAMERA') is None and not scene.get('_agartha_turnaround_state'), 'A video render is already in progress.'
state = {
    'camera': source.name, 'frame': scene.frame_current,
    'render': {key: getattr(scene.render, key) for key in ('engine', 'use_persistent_data', 'threads_mode', 'threads', 'filepath', 'resolution_x', 'resolution_y', 'resolution_percentage', 'pixel_aspect_x', 'pixel_aspect_y', 'use_border', 'use_crop_to_border')},
    'cycles': {key: getattr(scene.cycles, key) for key in ('device', 'samples', 'time_limit', 'use_denoising', 'use_adaptive_sampling', 'adaptive_threshold', 'adaptive_min_samples', 'denoiser', 'denoising_input_passes', 'denoising_prefilter')},
    'format': scene.render.image_settings.file_format,
}
scene['_agartha_turnaround_state'] = json.dumps(state)
camera = source.copy()
camera.data = source.data.copy()
camera.name = 'AGARTHA_TURNAROUND_CAMERA'
camera.parent = None
camera.matrix_world = source.matrix_world.copy()
camera.animation_data_clear()
camera.rotation_mode = 'XYZ'
for constraint in list(camera.constraints): camera.constraints.remove(constraint)
camera['agartha_turnaround'] = True
camera['target'] = list(center)
offset = source.matrix_world.translation - center
if offset.xy.length < 0.1: offset = Vector((4, -6, 3))
scene.collection.objects.link(camera)
scene.camera = camera
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 16
scene.cycles.time_limit = 1.0
scene.cycles.use_denoising = True
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = 0.1
scene.cycles.adaptive_min_samples = 8
scene.cycles.denoiser = 'OPENIMAGEDENOISE'
scene.cycles.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
scene.cycles.denoising_prefilter = 'ACCURATE'
scene.render.use_persistent_data = True
scene.render.threads_mode = 'FIXED'
scene.render.threads = 2
scene.render.resolution_x = 512
scene.render.resolution_y = 512
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.pixel_aspect_x = scene.render.pixel_aspect_y = 1
scene.render.use_border = scene.render.use_crop_to_border = False
camera.data.shift_x = camera.data.shift_y = 0
camera.data.dof.use_dof = False
if camera.data.type not in ('PERSP', 'ORTHO'):
    camera.data.type = 'PERSP'
    camera.data.lens = 50
# Fit the evaluated model at every delivered angle, keeping one constant orbit
# distance/orthographic scale so the turnaround does not visibly zoom.
view = camera.data.view_frame(scene=scene)
tan_x = max(abs(p.x / p.z) for p in view)
tan_y = max(abs(p.y / p.z) for p in view)
direction = offset.normalized()
distance, half_span = offset.length, 0.0
for frame in range(__TURNAROUND_FRAMES__):
    angle = math.tau * frame / __TURNAROUND_FRAMES__
    orbit = Vector((direction.x * math.cos(angle) - direction.y * math.sin(angle), direction.x * math.sin(angle) + direction.y * math.cos(angle), direction.z))
    inverse = (-orbit).to_track_quat('-Z', 'Y').inverted()
    for point in points:
        p = inverse @ (point - center)
        half_span = max(half_span, abs(p.x), abs(p.y))
        if camera.data.type == 'PERSP':
            distance = max(distance, p.z + abs(p.x) / (tan_x * 0.88), p.z + abs(p.y) / (tan_y * 0.88))
radius = max((point - center).length for point in points)
distance = max(distance, radius * 1.1)
if camera.data.type == 'ORTHO': camera.data.ortho_scale = max(camera.data.ortho_scale, 2 * half_span / 0.88)
camera.data.clip_start = max(radius * 0.0001, 0.000001)
camera.data.clip_end = max(camera.data.clip_end, distance + radius * 2)
camera['offset'] = list(direction * distance)
os.makedirs('/workspace/turnaround', exist_ok=True)
print('TURNAROUND_READY')
""".replace('__TURNAROUND_FRAMES__', str(FRAMES))


def frames_code(start: int, stop: int) -> str:
    if not 0 <= start < stop <= FRAMES or stop - start > 8:
        raise ValueError('Invalid video frame chunk.')
    return f"""
import bpy, math
from mathutils import Vector
scene = bpy.context.scene
camera = bpy.data.objects['AGARTHA_TURNAROUND_CAMERA']
target, offset = Vector(camera['target']), Vector(camera['offset'])
for frame in range({start}, {stop}):
    angle = 2 * math.pi * frame / {FRAMES}
    position = Vector((offset.x * math.cos(angle) - offset.y * math.sin(angle), offset.x * math.sin(angle) + offset.y * math.cos(angle), offset.z))
    camera.location = target + position
    camera.rotation_euler = (-position).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = '/workspace/turnaround/frame_%03d.png' % frame
    bpy.ops.render.render(write_still=True, scene=scene.name)
print('TURNAROUND_FRAMES:{start}:{stop}')
"""


ENCODE_CODE = f"""
import bpy, os
assert all(os.path.isfile('/workspace/turnaround/frame_%03d.png' % frame) for frame in range({FRAMES})), 'Video frames are incomplete.'
encoder = bpy.data.scenes.new('AGARTHA_TURNAROUND_ENCODE')
encoder['agartha_turnaround_encoder'] = True
editor = encoder.sequence_editor_create()
strip = editor.strips.new_image('Turnaround', filepath='/workspace/turnaround/frame_000.png', channel=1, frame_start=1)
for frame in range(1, {FRAMES}): strip.elements.append('frame_%03d.png' % frame)
strip.frame_final_duration = {FRAMES}
encoder.frame_start = 1
encoder.frame_end = {FRAMES}
encoder.render.fps = {FPS}
encoder.render.resolution_x = 512
encoder.render.resolution_y = 512
encoder.render.resolution_percentage = 100
encoder.render.image_settings.file_format = 'FFMPEG'
encoder.render.ffmpeg.format = 'MPEG4'
encoder.render.ffmpeg.codec = 'H264'
encoder.render.ffmpeg.audio_codec = 'NONE'
encoder.render.ffmpeg.constant_rate_factor = 'MEDIUM'
encoder.render.filepath = '/workspace/artifacts/turnaround.mp4'
encoder.view_settings.view_transform = 'Standard'
encoder.render.use_sequencer = True
bpy.ops.render.render(animation=True, scene=encoder.name)
print('TURNAROUND_ENCODED')
"""

CLEANUP_CODE = """
import bpy, json
for scene in list(bpy.data.scenes):
    if scene.get('agartha_turnaround_encoder'):
        bpy.data.scenes.remove(scene)
        continue
    saved = scene.get('_agartha_turnaround_state')
    if not saved: continue
    state = json.loads(saved)
    scene.camera = bpy.data.objects.get(state['camera'])
    for key, value in state['render'].items(): setattr(scene.render, key, value)
    for key, value in state['cycles'].items(): setattr(scene.cycles, key, value)
    scene.render.image_settings.file_format = state['format']
    scene.frame_set(state['frame'])
    if bpy.context.window: bpy.context.window.scene = scene
    del scene['_agartha_turnaround_state']
camera = bpy.data.objects.get('AGARTHA_TURNAROUND_CAMERA')
if camera and camera.get('agartha_turnaround'):
    data = camera.data
    bpy.data.objects.remove(camera, do_unlink=True)
    bpy.data.cameras.remove(data)
print('TURNAROUND_CLEANED')
"""


def remaining_seconds(row: dict[str, Any]) -> float:
    return (row.get('launchClaimedAt', 0) / 1000 + row['reservedMinutes'] * 60) - time.time()


def render_turnaround(broker: Any, token: str, reservation_id: str, progress: Callable[[str], None] = lambda text: None) -> bytes:
    row = broker.owned(token, reservation_id)
    if row['status'] != 'running' or row.get('stopRequested') or remaining_seconds(row) < VIDEO_WINDOW_SECONDS:
        raise RuntimeError('Insufficient spare time for optional video.')
    deadline = time.monotonic() + VIDEO_WINDOW_SECONDS
    prefix = 'video-' + uuid.uuid4().hex
    def execute(code: str, suffix: str, expected: str) -> None:
        row = broker.owned(token, reservation_id)
        if row['status'] != 'running' or row.get('stopRequested') or min(remaining_seconds(row), deadline - time.monotonic()) < 100:
            raise RuntimeError('Insufficient running time for another video chunk.')
        result = broker.call(token, reservation_id, {'jsonrpc': '2.0', 'id': suffix, 'method': 'tools/call', 'params': {'name': 'execute_blender_code', 'arguments': {'code': code}}}, prefix + '-' + suffix, 65_536)
        if 'error' in result or result.get('result', {}).get('isError') or expected not in json.dumps(result):
            raise RuntimeError('Video step did not complete.')
    try:
        progress('Rendering the 360-degree turnaround video.')
        execute(START_CODE, 'setup', 'TURNAROUND_READY')
        for start in range(0, FRAMES, 8):
            execute(frames_code(start, start + 8), str(start), f'TURNAROUND_FRAMES:{start}:{start + 8}')
            progress(f'Rendering 360-degree video: {start + 8}/{FRAMES} frames.')
        execute(ENCODE_CODE, 'encode', 'TURNAROUND_ENCODED')
        payload = broker.download(token, reservation_id, 'turnaround.mp4', 16 * 1024 * 1024)
        if len(payload) < 1000 or payload[4:8] != b'ftyp':
            raise RuntimeError('Invalid MP4 export.')
        return payload
    finally:
        # Cleanup remains a bounded, metered tool call; never restart a stopped worker.
        try:
            broker.call(token, reservation_id, {'jsonrpc': '2.0', 'id': 'cleanup', 'method': 'tools/call', 'params': {'name': 'execute_blender_code', 'arguments': {'code': CLEANUP_CODE}}}, prefix + '-cleanup', 65_536)
        except Exception:
            pass
