"""Local CPU comparison; writes each measurement before starting the next render."""
import argparse
import json
import math
from pathlib import Path
import sys
import time

import bpy
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument('--blend', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--preset', choices=['baseline', 'adaptive'], default='baseline')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
output = Path(args.output).resolve()
output.mkdir(parents=True, exist_ok=True)

for fixture in ('rocket', 'glass-detail'):
    bpy.ops.wm.open_mainfile(filepath=args.blend)
    scene = bpy.context.scene
    if fixture == 'glass-detail':
        # Same composition with a difficult refractive material and small details.
        material = bpy.data.materials.new('Benchmark glass')
        material.use_nodes = True
        shader = material.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = (0.7, 0.9, 1, 1)
        shader.inputs['Transmission Weight'].default_value = 1
        shader.inputs['Roughness'].default_value = 0.08
        model = bpy.data.collections['AGARTHA_MODEL']
        biggest = max((o for o in model.all_objects if o.type == 'MESH'), key=lambda o: o.dimensions.x * o.dimensions.y * o.dimensions.z)
        biggest.data.materials.clear()
        biggest.data.materials.append(material)
    model = bpy.data.collections['AGARTHA_MODEL']
    points = [o.matrix_world @ Vector(c) for o in model.all_objects if o.type == 'MESH' for c in o.bound_box]
    center = Vector(tuple((min(p[i] for p in points) + max(p[i] for p in points)) / 2 for i in range(3)))
    camera = scene.camera
    offset = camera.location - center
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 2
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    baseline = {key: getattr(scene.cycles, key) for key in ('use_adaptive_sampling', 'adaptive_threshold', 'adaptive_min_samples', 'denoiser', 'denoising_input_passes', 'denoising_prefilter', 'max_bounces', 'diffuse_bounces', 'glossy_bounces', 'transmission_bounces')}
    for mode in ('preview', 'video'):
        scene.cycles.samples = 32 if mode == 'preview' else 8
        scene.cycles.time_limit = 0 if mode == 'preview' else 1
        scene.cycles.use_denoising = True
        scene.render.use_persistent_data = mode == 'video'
        if args.preset == 'adaptive':
            scene.cycles.samples = 32 if mode == 'preview' else 16
            scene.cycles.time_limit = 10 if mode == 'preview' else 1
            scene.cycles.use_adaptive_sampling = True
            scene.cycles.adaptive_threshold = 0.05 if mode == 'preview' else 0.1
            scene.cycles.adaptive_min_samples = 8
            scene.cycles.denoiser = 'OPENIMAGEDENOISE'
            scene.cycles.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
            scene.cycles.denoising_prefilter = 'ACCURATE'
        for view in range(3):
            angle = view * math.tau / 3
            position = Vector((offset.x * math.cos(angle) - offset.y * math.sin(angle), offset.x * math.sin(angle) + offset.y * math.cos(angle), offset.z))
            camera.location = center + position
            camera.rotation_euler = (-position).to_track_quat('-Z', 'Y').to_euler()
            scene.render.filepath = str(output / f'{fixture}-{mode}-{view}.png')
            started = time.perf_counter()
            bpy.ops.render.render(write_still=True)
            result = {'fixture': fixture, 'mode': mode, 'view': view, 'preset': args.preset, 'seconds': time.perf_counter() - started, 'bytes': Path(scene.render.filepath).stat().st_size, 'blender': bpy.app.version_string, 'sourceSettings': baseline}
            with (output / 'measurements.jsonl').open('a') as stream:
                stream.write(json.dumps(result) + '\n')
            assert json.loads((output / 'measurements.jsonl').read_text().splitlines()[-1]) == result
            print('RENDER_MEASUREMENT ' + json.dumps(result), flush=True)
