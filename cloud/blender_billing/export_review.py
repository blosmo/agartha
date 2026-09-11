"""Render the delivered GLB in an isolated neutral scene, preserving the source."""
from __future__ import annotations

import textwrap
import uuid

from .review import render_view_code


def render_export_view_code(view: str) -> str:
    if view not in {'hero', 'front', 'right'}:
        raise ValueError('Export review requires hero, front, or right.')
    collection_name = 'AGARTHA_EXPORT_REVIEW_' + uuid.uuid4().hex
    inspection = render_view_code(view, collection_name=collection_name)
    return PREPARE_CODE.replace('__COLLECTION_NAME__', repr(collection_name)) + textwrap.indent(inspection, '        ') + CLEANUP_CODE


PREPARE_CODE = r'''
def _agartha_review_export():
    import bpy
    from mathutils import Vector
    original = bpy.context.window.scene
    selected = list(bpy.context.selected_objects)
    active = bpy.context.view_layer.objects.active
    groups = ('objects', 'collections', 'meshes', 'materials', 'cameras', 'lights', 'worlds', 'images', 'node_groups', 'actions')
    before = {name: set(getattr(bpy.data, name)) for name in groups}
    temporary = bpy.data.scenes.new('Agartha exported model review')
    bpy.context.window.scene = temporary
    try:
        bpy.ops.import_scene.gltf(filepath='/workspace/artifacts/model.glb')
        objects = [obj for obj in temporary.objects if obj.type == 'MESH']
        assert objects, 'The exported GLB has no model geometry.'
        collection = bpy.data.collections.new(__COLLECTION_NAME__)
        temporary.collection.children.link(collection)
        for obj in objects:
            for owner in list(obj.users_collection): owner.objects.unlink(obj)
            collection.objects.link(obj)
        bpy.context.view_layer.update()
        points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
        center = Vector(tuple((min(p[i] for p in points) + max(p[i] for p in points)) / 2 for i in range(3)))
        radius = max((point - center).length for point in points)
        assert 0 < radius < 100000, 'Invalid exported model bounds.'
        world = bpy.data.worlds.new('Export review neutral world')
        world.use_nodes = True
        world.node_tree.nodes['Background'].inputs['Color'].default_value = (.35, .35, .35, 1)
        world.node_tree.nodes['Background'].inputs['Strength'].default_value = .5
        temporary.world = world
        temporary.view_settings.view_transform = 'AgX'
        temporary.render.use_persistent_data = False
        for label, direction, energy in [('key', (3, -4, 5), 650), ('fill', (-4, -2, 2), 350), ('rim', (2, 4, 4), 550)]:
            data = bpy.data.lights.new('Export review ' + label, 'AREA')
            data.energy = energy * radius * radius
            data.shape = 'DISK'
            data.size = radius * 3
            light = bpy.data.objects.new(data.name, data)
            temporary.collection.objects.link(light)
            light.location = center + Vector(direction) * radius
            light.rotation_euler = (center - light.location).to_track_quat('-Z', 'Y').to_euler()
        camera_data = bpy.data.cameras.new('Export review camera')
        camera_data.type = 'ORTHO'
        camera = bpy.data.objects.new(camera_data.name, camera_data)
        temporary.collection.objects.link(camera)
        camera.location = center + Vector((4, -6, 3)) * radius
        temporary.camera = camera
'''

CLEANUP_CODE = r'''
    finally:
        bpy.context.window.scene = original
        bpy.data.scenes.remove(temporary)
        for name in groups:
            blocks = getattr(bpy.data, name)
            for block in list(set(blocks) - before[name]):
                if name in ('objects', 'collections'):
                    blocks.remove(block, do_unlink=True)
                elif block.users == 0 and not (name == 'images' and block.type in {'RENDER_RESULT', 'COMPOSITING'}):
                    blocks.remove(block)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in selected: obj.select_set(True)
        bpy.context.view_layer.objects.active = active
        bpy.context.view_layer.update()
_agartha_review_export()
del _agartha_review_export
'''
