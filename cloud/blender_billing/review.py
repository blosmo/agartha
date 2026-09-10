"""Controlled inspection renders for the agent's persistent Blender scene."""
from __future__ import annotations
import json

VIEWS = {'hero', 'front', 'right', 'back', 'detail'}


def render_view_code(view: str, object_name: str = '') -> str:
    if view not in VIEWS or not isinstance(object_name, str) or len(object_name) > 128:
        raise ValueError('Invalid inspection view.')
    parameters = repr(json.dumps({'view': view, 'object': object_name}))
    return 'import json\n_agartha_review_args = json.loads(' + parameters + ')\n' + RENDER_CODE


RENDER_CODE = r'''
def _agartha_render_review(args):
    import bpy, os
    from mathutils import Vector
    scene = bpy.context.scene
    model = bpy.data.collections.get('AGARTHA_MODEL')
    assert model and scene.camera, 'Create model geometry and a hero camera before inspection.'
    source = scene.camera
    objects = [o for o in model.all_objects if o.type == 'MESH' and not o.hide_render]
    if args['view'] == 'detail':
        objects = [o for o in objects if o.name == args['object']]
        assert objects, 'Detail view requires the exact name of a model mesh.'
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = [o.evaluated_get(depsgraph) for o in objects]
    points = [o.matrix_world @ Vector(corner) for o in evaluated for corner in o.bound_box]
    assert points, 'No visible geometry to inspect.'
    center = Vector(tuple((min(p[i] for p in points) + max(p[i] for p in points)) / 2 for i in range(3)))
    radius = max((point - center).length for point in points)
    assert radius > 0 and radius < 100000, 'Invalid geometry bounds.'
    camera = source.copy()
    camera.data = source.data.copy()
    camera.parent = None
    camera.matrix_world = source.matrix_world.copy()
    camera.animation_data_clear()
    camera.rotation_mode = 'XYZ'
    for constraint in list(camera.constraints): camera.constraints.remove(constraint)
    camera.name = 'AGARTHA_INSPECTION_CAMERA'
    scene.collection.objects.link(camera)
    state = {
        'render': {key: getattr(scene.render, key) for key in ('engine', 'threads_mode', 'threads', 'filepath', 'resolution_x', 'resolution_y', 'resolution_percentage', 'pixel_aspect_x', 'pixel_aspect_y', 'use_border', 'use_crop_to_border')},
        'cycles': {key: getattr(scene.cycles, key) for key in ('device', 'samples', 'time_limit', 'use_denoising', 'use_adaptive_sampling', 'adaptive_threshold', 'adaptive_min_samples', 'denoiser', 'denoising_input_passes', 'denoising_prefilter')},
        'format': scene.render.image_settings.file_format,
        'media_type': scene.render.image_settings.media_type,
    }
    try:
        scene.camera = camera
        scene.render.resolution_x = scene.render.resolution_y = 768
        scene.render.resolution_percentage = 100
        scene.render.pixel_aspect_x = scene.render.pixel_aspect_y = 1
        scene.render.use_border = scene.render.use_crop_to_border = False
        directions = {'front': (0,-1,0), 'right': (1,0,0), 'back': (0,1,0)}
        direction = Vector(directions.get(args['view'], tuple(source.matrix_world.translation - center)))
        if direction.length < .000001: direction = Vector((4,-6,3))
        direction.normalize()
        if args['view'] != 'hero' or camera.data.type not in ('ORTHO', 'PERSP'): camera.data.type = 'ORTHO'
        camera.data.shift_x = camera.data.shift_y = 0
        camera.data.dof.use_dof = False
        rotation = (-direction).to_track_quat('-Z', 'Y')
        local_points = [rotation.inverted() @ (point-center) for point in points]
        half_span = max(max(abs(p.x),abs(p.y)) for p in local_points)
        camera.data.ortho_scale = max(half_span * 2.3, .001)
        distance = radius * 4
        if camera.data.type == 'PERSP':
            frame = camera.data.view_frame(scene=scene)
            tangent = min(max(abs(p.x/p.z) for p in frame), max(abs(p.y/p.z) for p in frame))
            distance = max(p.z + max(abs(p.x),abs(p.y)) / (tangent*.88) for p in local_points)
        camera.location = center + direction * distance
        camera.rotation_euler = rotation.to_euler()
        camera.data.clip_start = max(.00001,radius*.0001)
        camera.data.clip_end = max(10, distance + radius*5)
        scene.render.engine = 'CYCLES'
        scene.cycles.device = 'CPU'
        scene.cycles.samples = 32
        scene.cycles.time_limit = 10.0
        scene.cycles.use_adaptive_sampling = True
        scene.cycles.adaptive_threshold = .04
        scene.cycles.adaptive_min_samples = 8
        scene.cycles.use_denoising = True
        scene.cycles.denoiser = 'OPENIMAGEDENOISE'
        scene.cycles.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
        scene.cycles.denoising_prefilter = 'ACCURATE'
        scene.render.threads_mode, scene.render.threads = 'FIXED', 2
        scene.render.image_settings.media_type = 'IMAGE'
        scene.render.image_settings.file_format = 'PNG'
        os.makedirs('/workspace/artifacts', exist_ok=True)
        scene.render.filepath = '/workspace/artifacts/review_' + args['view'] + '.png'
        bpy.ops.render.render(write_still=True)
    finally:
        scene.camera = source
        for key,value in state['render'].items(): setattr(scene.render,key,value)
        for key,value in state['cycles'].items(): setattr(scene.cycles,key,value)
        scene.render.image_settings.media_type = state['media_type']
        scene.render.image_settings.file_format = state['format']
        data = camera.data
        bpy.data.objects.remove(camera, do_unlink=True)
        if data.users == 0: bpy.data.cameras.remove(data)
_agartha_render_review(_agartha_review_args)
del _agartha_render_review, _agartha_review_args
'''
