"""Fixed, chunked 360-degree rendering; all work stays in the paid reservation."""
from __future__ import annotations

import json
import time
import uuid
from typing import Any, Callable

FRAMES = 96
FPS = 24
VIDEO_RESERVE_SECONDS = 240

START_CODE = """
import bpy, json, os
from mathutils import Vector
scene = bpy.context.scene
model = bpy.data.collections.get('AGARTHA_MODEL')
assert model and scene.camera, 'A model and preview camera are required.'
points = [obj.matrix_world @ Vector(corner) for obj in model.all_objects if obj.type == 'MESH' for corner in obj.bound_box]
assert points, 'Model geometry is required.'
center = Vector(tuple((min(p[i] for p in points) + max(p[i] for p in points)) / 2 for i in range(3)))
source = scene.camera
state = {'camera': source.name, 'samples': scene.cycles.samples, 'time_limit': scene.cycles.time_limit, 'filepath': scene.render.filepath, 'frame': scene.frame_current, 'resolution_x': scene.render.resolution_x, 'resolution_y': scene.render.resolution_y, 'resolution_percentage': scene.render.resolution_percentage}
scene['_agartha_turnaround_state'] = json.dumps(state)
assert bpy.data.objects.get('AGARTHA_TURNAROUND_CAMERA') is None, 'A video render is already in progress.'
camera = source.copy()
camera.data = source.data.copy()
camera.name = 'AGARTHA_TURNAROUND_CAMERA'
camera.parent = None
camera.matrix_world = source.matrix_world.copy()
camera.animation_data_clear()
for constraint in list(camera.constraints): camera.constraints.remove(constraint)
camera['agartha_turnaround'] = True
camera['target'] = list(center)
offset = source.matrix_world.translation - center
if offset.xy.length < 0.1: offset = Vector((4, -6, 3))
camera['offset'] = list(offset)
scene.collection.objects.link(camera)
scene.camera = camera
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 8
scene.cycles.time_limit = 1.0
scene.cycles.use_denoising = True
scene.render.threads_mode = 'FIXED'
scene.render.threads = 2
scene.render.resolution_x = 512
scene.render.resolution_y = 512
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
os.makedirs('/workspace/turnaround', exist_ok=True)
print('TURNAROUND_READY')
"""


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
    scene.cycles.samples = state['samples']
    scene.cycles.time_limit = state['time_limit']
    scene.render.filepath = state['filepath']
    for key in ('resolution_x', 'resolution_y', 'resolution_percentage'): setattr(scene.render, key, state[key])
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
    prefix = 'video-' + uuid.uuid4().hex
    def execute(code: str, suffix: str, expected: str) -> None:
        row = broker.owned(token, reservation_id)
        if row['status'] != 'running' or row.get('stopRequested') or remaining_seconds(row) < 100:
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
