"""Build the original, untextured collection used by the Compute landing page.

blender -b --factory-startup --python-exit-code 1 --python scripts/blender/create_carousel_models.py -- OUTPUT
"""
import bpy
import bmesh
import itertools
import json
import math
from pathlib import Path
import sys
from mathutils import Vector

OUTPUT = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
OUTPUT.mkdir(parents=True, exist_ok=True)


def material(name, color, metal=0.12, roughness=0.28):
    channels = [int(color[i:i+2], 16) / 255 for i in (0, 2, 4)]
    rgb = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*rgb, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Coat Weight'].default_value = 0.25
    return m


def sphere(name, location, scale, mat, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, location=location)
    o = bpy.context.object
    o.name, o.scale, o.rotation_euler = name, scale, rotation
    o.data.materials.append(mat)
    for p in o.data.polygons: p.use_smooth = True
    return o


def curve(name, points, radius, mat):
    data = bpy.data.curves.new(name, 'CURVE')
    data.dimensions, data.bevel_depth, data.bevel_resolution = '3D', radius, 3
    spline = data.splines.new('BEZIER')
    spline.bezier_points.add(len(points) - 1)
    for point, coordinate in zip(spline.bezier_points, points):
        point.co = coordinate
        point.handle_left_type = point.handle_right_type = 'AUTO'
    o = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(mat)
    return o


def solid(kind, mat):
    phi = (1 + math.sqrt(5)) / 2
    signs = (-1, 1)
    if kind == 'tetrahedron': vertices = [(1, 1, 1), (-1, -1, 1), (-1, 1, -1), (1, -1, -1)]
    elif kind == 'cube': vertices = list(itertools.product(signs, repeat=3))
    elif kind == 'octahedron': vertices = [tuple(s if i == axis else 0 for i in range(3)) for axis in range(3) for s in signs]
    elif kind == 'dodecahedron':
        vertices = list(itertools.product(signs, repeat=3))
        for a, b in itertools.product(signs, repeat=2): vertices.extend([(0, a / phi, b * phi), (a / phi, b * phi, 0), (a * phi, 0, b / phi)])
    else:
        vertices = []
        for a, b in itertools.product(signs, repeat=2): vertices.extend([(0, a, b * phi), (a, b * phi, 0), (a * phi, 0, b)])
    bm = bmesh.new()
    for v in vertices: bm.verts.new(v)
    bmesh.ops.convex_hull(bm, input=list(bm.verts))
    bmesh.ops.dissolve_limit(bm, angle_limit=0.001, verts=list(bm.verts), edges=list(bm.edges))
    assert len(bm.faces) == {'tetrahedron': 4, 'cube': 6, 'octahedron': 8, 'dodecahedron': 12, 'icosahedron': 20}[kind]
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    mesh = bpy.data.meshes.new(kind)
    bm.to_mesh(mesh); bm.free()
    o = bpy.data.objects.new(kind, mesh)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(mat)
    bevel = o.modifiers.new('Soft polished edges', 'BEVEL')
    bevel.width, bevel.segments = 0.075, 4
    bevel.harden_normals = True
    for p in mesh.polygons: p.use_smooth = True
    o.modifiers.new('Weighted face normals', 'WEIGHTED_NORMAL')
    return o


def bunny():
    cream = material('Mint porcelain', 'C4E0C6', 0.02, 0.34)
    pink = material('Peach details', 'F4B3A9', 0, 0.4)
    dark = material('Espresso', '243B35', 0, 0.3)
    gold = material('Little sun', 'F3C75D', 0.45, 0.25)
    sphere('Round body', (0, 0, -0.25), (0.58, 0.43, 0.65), cream)
    sphere('Head', (0, -0.05, 0.45), (0.63, 0.47, 0.56), cream)
    for sign in (-1, 1):
        sphere('Long ear', (sign * 0.3, 0, 1.12), (0.18, 0.15, 0.55), cream, (0, sign * 0.17, 0))
        sphere('Velvet inner ear', (sign * 0.3, -0.139, 1.14), (0.095, 0.026, 0.36), pink, (0, sign * 0.17, 0))
        sphere('Tiny foot', (sign * 0.33, -0.2, -0.74), (0.26, 0.32, 0.18), cream)
        sphere('Eye', (sign * 0.22, -0.494, 0.52), (0.045, 0.024, 0.069), dark)
        sphere('Blush', (sign * 0.36, -0.449, 0.32), (0.085, 0.025, 0.042), pink)
        sphere('Little arm', (sign * 0.44, -0.33, -0.05), (0.18, 0.17, 0.3), cream, (0, sign * 0.58, 0))
    sphere('Nose', (0, -0.527, 0.38), (0.048, 0.032, 0.034), pink)
    sphere('Sun held between paws', (0, -0.5, -0.1), (0.24, 0.16, 0.24), gold)
    sphere('Cotton tail', (0.45, 0.3, -0.49), (0.24, 0.23, 0.23), cream)


def whale():
    lavender = material('Lavender glaze', 'B3A0DF', 0.08, 0.29)
    light = material('Cloud belly', 'ECE2EF', 0, 0.38)
    mint = material('Seafoam', '8DD7C5', 0.08, 0.26)
    dark = material('Espresso eyes', '30374C', 0, 0.31)
    pink = material('Blush', 'F0ABC4', 0, 0.39)
    sphere('Happy whale', (-0.2, 0, 0), (0.98, 0.57, 0.65), lavender)
    sphere('Soft tummy', (-0.29, -0.3, -0.28), (0.72, 0.33, 0.32), light)
    sphere('Left flipper', (-0.48, -0.39, -0.38), (0.37, 0.16, 0.15), lavender, (0, -0.55, -0.28))
    sphere('Right flipper', (-0.48, 0.4, -0.34), (0.38, 0.16, 0.15), lavender, (0, 0.45, 0.28))
    sphere('Tail stem', (0.72, 0, 0.12), (0.52, 0.2, 0.24), lavender, (0, -0.45, 0))
    for sign in (-1, 1): sphere('Heart tail fluke', (1.05, sign * 0.24, 0.4), (0.4, 0.29, 0.12), lavender, (sign * 0.3, -0.2, sign * -0.4))
    for x in (-0.68, -0.15):
        sphere('Bright eye', (x, -0.526, 0.09), (0.05, 0.033, 0.067), dark)
        sphere('Rosy cheek', (x - 0.04, -0.519, -0.08), (0.079, 0.025, 0.041), pink)
    curve('Little smile', [(-0.49, -0.565, -0.02), (-0.4, -0.576, -0.06), (-0.31, -0.568, -0.015)], 0.014, dark)
    curve('Spout', [(-0.23, 0, 0.57), (-0.24, 0, 0.83), (-0.4, 0, 0.96)], 0.046, mint)
    curve('Spout branch', [(-0.24, 0, 0.75), (-0.08, 0, 0.9), (0.04, 0, 0.84)], 0.039, mint)
    sphere('Floating drop', (-0.45, 0, 1.08), (0.075, 0.069, 0.11), mint, (0, 0.3, 0))


collection = [
    ('tetrahedron', 'F08088'), ('cube', 'F2A269'), ('octahedron', 'EBC95A'),
    ('moon-bunny', 'C4E0C6'), ('dodecahedron', '7BCDD9'), ('icosahedron', '789CE3'), ('cloud-whale', 'B3A0DF'),
]
results = []
for name, color in collection:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if name == 'moon-bunny': bunny()
    elif name == 'cloud-whale': whale()
    else: solid(name, material(name + ' glaze', color, 0.16, 0.25))
    model_objects = list(bpy.context.scene.objects)
    for o in model_objects:
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        if o.type == 'CURVE': bpy.ops.object.convert(target='MESH')
        for modifier in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=modifier.name)
        o.select_set(False)
    bpy.context.view_layer.update()
    model_objects = list(bpy.context.scene.objects)
    points = [o.matrix_world @ Vector(c) for o in model_objects for c in o.bound_box]
    center = Vector(tuple((min(p[i] for p in points) + max(p[i] for p in points)) / 2 for i in range(3)))
    extent = max(max(p[i] for p in points) - min(p[i] for p in points) for i in range(3))
    for o in model_objects: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT / (name + '.glb')), export_format='GLB', use_selection=True, export_animations=False, export_cameras=False, export_lights=False)
    scene = bpy.context.scene
    bpy.ops.object.camera_add(location=center + Vector((0.3, -6, 2.1)).normalized() * extent * 3)
    camera = bpy.context.object
    camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type, camera.data.ortho_scale = 'ORTHO', extent * 1.28
    scene.camera = camera
    for location, energy, size in [((-3, -4, 5), 950, 4), ((4, -1, 2), 500, 3), ((1, 3, 4), 850, 3)]:
        bpy.ops.object.light_add(type='AREA', location=center + Vector(location) * extent / 2)
        lamp = bpy.context.object
        lamp.rotation_euler = (center - lamp.location).to_track_quat('-Z', 'Y').to_euler()
        lamp.data.energy, lamp.data.size = energy * (extent / 2) ** 2, size * extent / 2
    scene.world = bpy.data.worlds.new('Soft studio')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (0.65, 0.7, 0.8, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = 0.3
    scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'
    scene.cycles.samples, scene.cycles.adaptive_threshold, scene.cycles.adaptive_min_samples = 32, 0.05, 8
    scene.cycles.use_denoising = True
    scene.render.threads_mode, scene.render.threads = 'FIXED', 2
    scene.render.resolution_x = scene.render.resolution_y = 384
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'AgX'
    scene.render.filepath = str(OUTPUT / (name + '.png'))
    bpy.ops.render.render(write_still=True)
    result = {'id': name, 'glbBytes': (OUTPUT / (name + '.glb')).stat().st_size, 'posterBytes': (OUTPUT / (name + '.png')).stat().st_size}
    results.append(result)
    print('CAROUSEL_MODEL ' + json.dumps(result), flush=True)
(OUTPUT / 'provenance.json').write_text(json.dumps({'source': 'Original procedural models created for Agartha with Blender 4.5. No external assets, textures, or baked lighting.', 'generator': 'scripts/blender/create_carousel_models.py', 'license': 'MIT', 'models': results}, indent=2) + '\n')
