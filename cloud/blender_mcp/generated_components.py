"""Import a validated generated GLB without flattening its skeleton or animation."""
from __future__ import annotations

import json
import re
import struct
from pathlib import Path
from .components import _vector


def import_generated_component(path, name, *, task_id, location=(0, 0, 0), rotation=(0, 0, 0), scale=(1, 1, 1), rigged=False):
    import bpy
    from mathutils import Matrix
    if not isinstance(name, str) or not name.strip() or len(name) > 100:
        raise ValueError('Use a unique generated component name.')
    if not isinstance(task_id, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,199}', task_id):
        raise ValueError('Invalid generated component provenance.')
    for label, value in [('location', location), ('rotation', rotation), ('scale', scale)]:
        _vector(value, label, positive=label == 'scale')
    existing = bpy.data.objects.get(name)
    if existing:
        collection = bpy.data.collections.get('AGARTHA_MODEL')
        if (existing.get('agarthaGeneratedReady') is True and existing.get('agarthaMeshyTaskId') == task_id
                and existing.get('agarthaGeneratedProvider') == 'meshy' and collection
                and existing.name in collection.all_objects):
            return existing
        raise ValueError('Use a unique generated component name.')
    payload = Path(path).read_bytes()
    if not 20 <= len(payload) <= 16_000_000 or payload[:4] != b'glTF':
        raise ValueError('Use a bounded generated GLB.')
    length, kind = struct.unpack_from('<II', payload, 12)
    if kind != 0x4E4F534A or 20 + length > len(payload): raise ValueError('Invalid GLB JSON.')
    document = json.loads(payload[20:20 + length])
    if any('uri' in item for group in ['buffers', 'images'] for item in document.get(group, [])):
        raise ValueError('Generated components must embed all resources.')
    if rigged and not document.get('skins'): raise ValueError('Character has no skeleton binding.')
    previous = set(bpy.data.objects)
    original_scene = bpy.context.window.scene
    temporary = bpy.data.scenes.new('Generated component import')
    bpy.context.window.scene = temporary
    try:
        bpy.ops.import_scene.gltf(filepath=str(path))
        imported = list(set(bpy.data.objects) - previous)
        if not imported or any(obj.type not in {'MESH', 'ARMATURE', 'EMPTY'} for obj in imported):
            raise ValueError('Generated components contain unsupported scene objects.')
        if rigged and not any(obj.type == 'ARMATURE' for obj in imported):
            raise ValueError('Imported character has no armature.')
        bpy.context.view_layer.update()
        roots = [obj for obj in imported if obj.parent not in imported]
        worlds = {obj: obj.matrix_world.copy() for obj in roots}
        bpy.context.window.scene = original_scene
        collection = bpy.data.collections.get('AGARTHA_MODEL')
        if collection is None:
            collection = bpy.data.collections.new('AGARTHA_MODEL')
            original_scene.collection.children.link(collection)
        root = bpy.data.objects.new(name, None)
        collection.objects.link(root)
        root['agarthaComponent'] = True
        root['agarthaGeneratedProvider'] = 'meshy'
        root['agarthaMeshyTaskId'] = task_id
        root['agarthaRigged'] = bool(rigged)
        for index, obj in enumerate(imported):
            collection.objects.link(obj)
            obj.name = name + '/part-' + str(index)
            for source in list(obj.users_collection):
                if source != collection: source.objects.unlink(obj)
        for obj in roots:
            obj.parent = root
            obj.matrix_parent_inverse = Matrix.Identity(4)
            obj.matrix_world = worlds[obj]
        root.location, root.rotation_euler, root.scale = location, rotation, scale
        bpy.context.view_layer.update()
        root['agarthaGeneratedReady'] = True
        return root
    except Exception:
        for obj in set(bpy.data.objects) - previous: bpy.data.objects.remove(obj, do_unlink=True)
        raise
    finally:
        bpy.context.window.scene = original_scene
        bpy.data.scenes.remove(temporary)
