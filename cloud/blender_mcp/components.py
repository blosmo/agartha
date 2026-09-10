"""Static Blender kit parts with local pivots, linked instances and editable variants.

Coordinates are Blender XYZ, Z up; rotations are radians. Library source is never executed.
"""
from __future__ import annotations
import json
import math
from pathlib import Path


def _vector(value, label, *, positive=False):
    if len(value) != 3 or any(not isinstance(n, (int, float)) or not math.isfinite(n) or abs(n) > 10000 or positive and n <= 0 for n in value):
        raise ValueError('Invalid component '+label)
    return tuple(value)


def _parts(root):
    import bpy
    root = bpy.data.objects.get(root) if isinstance(root, str) else root
    if root is None or not root.get('agarthaComponent'):
        raise ValueError('Choose a named component root.')
    return root, [root, *root.children_recursive]


def create_component(name, objects, *, origin=(0, 0, 0), parent_id=None):
    """Group existing independent mesh objects under a useful pivot without moving them."""
    import bpy
    from mathutils import Matrix
    origin = _vector(origin, 'origin')
    objects = list(objects)
    if not name or bpy.data.objects.get(name) or not objects or len(set(objects)) != len(objects):
        raise ValueError('Use a unique component name and nonempty distinct parts.')
    if any(o.type != 'MESH' or o.parent or o.animation_data for o in objects):
        raise ValueError('Group static unparented mesh parts; preserve existing hierarchies separately.')
    if parent_id is not None:
        import re
        if not re.fullmatch(r'bundle-[a-f0-9]{64}', parent_id): raise ValueError('Invalid source bundle ID.')
    collection = bpy.data.collections.get('AGARTHA_MODEL')
    if collection is None:
        collection = bpy.data.collections.new('AGARTHA_MODEL')
        bpy.context.scene.collection.children.link(collection)
    root = bpy.data.objects.new(name, None)
    collection.objects.link(root)
    root.location = origin
    bpy.context.view_layer.update()
    root['agarthaComponent'] = True
    if parent_id: root['agarthaParentBundleId'] = parent_id
    for obj in objects:
        world = obj.matrix_world.copy()
        obj.parent = root
        if parent_id: obj['agarthaParentBundleId'] = parent_id
        obj.matrix_parent_inverse = Matrix.Identity(4)
        obj.matrix_world = world
        if obj.name not in collection.objects: collection.objects.link(obj)
    bpy.context.view_layer.update()
    return root


def _validate_parts(parts):
    import bpy
    for obj in parts:
        if obj.type not in {'MESH', 'EMPTY'} or obj.animation_data or obj.constraints:
            raise ValueError('Use static mesh parts without animation or constraints.')
        for modifier in obj.modifiers:
            if modifier.type == 'NODES': raise ValueError('Realize geometry nodes on a copy before sharing a component.')
            for prop in modifier.bl_rna.properties:
                if prop.type == 'POINTER':
                    target = getattr(modifier, prop.identifier, None)
                    if isinstance(target, bpy.types.Collection) or isinstance(target, bpy.types.Object) and target not in parts:
                        raise ValueError('Component modifiers must not depend on objects outside the component.')


def _remap_modifiers(copies):
    import bpy
    for clone in copies.values():
        for modifier in clone.modifiers:
            for prop in modifier.bl_rna.properties:
                if prop.type == 'POINTER' and not prop.is_readonly:
                    target = getattr(modifier, prop.identifier, None)
                    if isinstance(target, bpy.types.Object) and target in copies: setattr(modifier, prop.identifier, copies[target])


def duplicate_component(root, name, *, location=None, rotation=None, scale=None, variant=False):
    """Instances share geometry/materials; variants copy both before independent edits."""
    import bpy
    root, parts = _parts(root)
    if not name or bpy.data.objects.get(name): raise ValueError('Use a unique component name.')
    for label, value in [('location', location), ('rotation', rotation), ('scale', scale)]:
        if value is not None: _vector(value, label, positive=label == 'scale')
    _validate_parts(parts)
    collection = root.users_collection[0]
    copies, materials, groups = {}, {}, {}
    for obj in parts:
        clone = obj.copy()
        if variant and obj.data:
            clone.data = obj.data.copy()
            for slot in clone.material_slots:
                if slot.material:
                    original = slot.material
                    if original not in materials:
                        materials[original] = original.copy()
                        def copy_groups(tree):
                            if tree is None: return
                            for node in tree.nodes:
                                if node.type == 'GROUP' and node.node_tree:
                                    source = node.node_tree
                                    if source not in groups:
                                        groups[source] = source.copy()
                                        copy_groups(groups[source])
                                    node.node_tree = groups[source]
                        copy_groups(materials[original].node_tree)
                    slot.material = materials[original]
        clone.name = name if obj == root else name+'/'+obj.name.removeprefix(root.name+'/')
        collection.objects.link(clone)
        copies[obj] = clone
    for obj, clone in copies.items():
        clone.parent = copies.get(obj.parent)
        clone.matrix_basis = obj.matrix_basis.copy()
        clone.matrix_parent_inverse = obj.matrix_parent_inverse.copy()
    _remap_modifiers(copies)
    result = copies[root]
    result.matrix_world = root.matrix_world.copy()
    for label, value in [('location', location), ('rotation_euler', rotation), ('scale', scale)]:
        if value is not None: setattr(result, label, value)
    result['agarthaVariantOf'] = root.get('agarthaParentBundleId', root.name)
    bpy.context.view_layer.update()
    return result


def import_component(path, name, *, bundle_id, location=(0, 0, 0), rotation=(0, 0, 0), scale=(1, 1, 1)):
    """Import a static, embedded GLB as editable parts; never load a .blend or recipe."""
    import bpy
    import struct
    for label, value in [('location', location), ('rotation', rotation), ('scale', scale)]:
        _vector(value, label, positive=label == 'scale')
    payload = Path(path).read_bytes()
    if len(payload) < 20 or len(payload) > 16_000_000 or payload[:4] != b'glTF': raise ValueError('Use a bounded GLB.')
    size, kind = struct.unpack_from('<II', payload, 12)
    if kind != 0x4e4f534a or 20+size > len(payload): raise ValueError('Invalid GLB JSON.')
    document = json.loads(payload[20:20+size])
    if document.get('animations') or document.get('skins') or any('uri' in item for group in ['buffers', 'images'] for item in document.get(group, [])):
        raise ValueError('Components require static GLB geometry with embedded resources.')
    if bpy.data.objects.get(name): raise ValueError('Use a unique component name.')
    previous = set(bpy.data.objects)
    original_scene = bpy.context.window.scene
    temporary = bpy.data.scenes.new('Component import')
    bpy.context.window.scene = temporary
    try:
        bpy.ops.import_scene.gltf(filepath=str(path))
        imported = list(set(bpy.data.objects)-previous)
        meshes = [o for o in imported if o.type == 'MESH']
        worlds = {o:o.matrix_world.copy() for o in meshes}
        bpy.context.window.scene = original_scene
        for obj in meshes:
            obj.parent = None
            obj.matrix_world = worlds[obj]
            original_scene.collection.objects.link(obj)
        for index, obj in enumerate(meshes): obj.name = name+'/part-'+str(index)
        root = create_component(name, meshes, parent_id=bundle_id)
        root.location = location
        root.rotation_euler = rotation
        root.scale = scale
        for obj in meshes:
            for col in list(obj.users_collection):
                if col != root.users_collection[0]: col.objects.unlink(obj)
        for obj in imported:
            if obj not in meshes: bpy.data.objects.remove(obj, do_unlink=True)
        bpy.context.view_layer.update()
        return root
    except Exception:
        for obj in set(bpy.data.objects)-previous: bpy.data.objects.remove(obj, do_unlink=True)
        raise
    finally:
        bpy.context.window.scene = original_scene
        bpy.data.scenes.remove(temporary)


def component_sources(root):
    import re
    _, parts = _parts(root)
    sources = {obj.get('agarthaParentBundleId') for obj in parts if obj.get('agarthaParentBundleId')}
    if any(not isinstance(id,str) or not re.fullmatch(r'bundle-[a-f0-9]{64}',id) for id in sources):
        raise ValueError('Invalid component source bundle.')
    return sorted(sources)


def mark_published_component(root, bundle_id):
    """Call after successful publication: every selected part now derives from this bundle."""
    import re
    if not re.fullmatch(r'bundle-[a-f0-9]{64}',bundle_id): raise ValueError('Invalid published bundle.')
    _, parts = _parts(root)
    for obj in parts:
        previous = obj.get('agarthaParentBundleId')
        if previous: obj['agarthaPreviousBundleId'] = previous
        obj['agarthaParentBundleId'] = bundle_id


def assembly_manifest():
    """Inspectable provenance and transforms; never an executable recipe."""
    import bpy
    return {'coordinateSystem':'Blender Z-up; rotation radians','components':[
        {'name':o.name,'parentId':o.get('agarthaParentBundleId'),'variantOf':o.get('agarthaVariantOf'),
         'location':list(o.location),'rotation':list(o.rotation_euler),'scale':list(o.scale),
         'parts':[child.name for child in o.children_recursive if child.type == 'MESH']}
        for o in bpy.context.scene.objects if o.get('agarthaComponent') and o.parent is None]}


def _validate_export_dependencies(parts):
    import bpy
    dependencies = {}
    for used, users in bpy.data.user_map().items():
        for user in users: dependencies.setdefault(user, set()).add(used)
    seen, pending = set(), list(parts)
    def contains_id(value):
        if isinstance(value, bpy.types.ID): return True
        if hasattr(value, 'values'): return any(contains_id(v) for v in value.values())
        if isinstance(value, (list, tuple)): return any(contains_id(v) for v in value)
        return False
    while pending:
        block = pending.pop()
        if block in seen: continue
        seen.add(block)
        if block.library or isinstance(block, (bpy.types.Scene, bpy.types.Collection, bpy.types.Text)) or isinstance(block, bpy.types.Object) and block not in parts:
            raise ValueError('Component source has dependencies outside the selected parts.')
        if getattr(block, 'animation_data', None): raise ValueError('Remove animation and drivers from component dependencies.')
        if any(contains_id(value) for value in block.values()): raise ValueError('Remove datablock pointers from component custom properties.')
        used=dependencies.get(block, set())-seen
        if block==parts[0] and block.parent: used=used-{block.parent}
        pending.extend(used)


def export_component(root, directory):
    """Export only this part at its local pivot; source keeps editable meshes/materials."""
    import bpy
    from mathutils import Matrix
    from .material_authoring import _studio, _prepare_source
    try:
        import starter_kit as kit
    except ImportError:
        from scripts.seed import starter_kit as kit
    root, parts = _parts(root)
    _validate_parts(parts)
    for obj in parts:
        if obj.library or obj.data and obj.data.library: raise ValueError('Localize linked component data first.')
        for slot in obj.material_slots:
            if slot.material and slot.material.use_nodes: _prepare_source(slot.material)
    _validate_export_dependencies(parts)
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    paths = {key:str(directory/file) for key,file in [('glb','component.glb'),('source','source.blend'),('preview','preview.png')]}
    # Explicit temporary scene prevents exporting the surrounding diorama or studio.
    with _studio() as scene:
        copies = {}
        for obj in parts:
            clone = obj.copy()
            # _studio owns and removes temporary data; keep authored meshes intact.
            if obj.data: clone.data = obj.data.copy()
            scene.collection.objects.link(clone)
            copies[obj] = clone
        for obj, clone in copies.items():
            clone.parent = copies.get(obj.parent)
            clone.matrix_parent_inverse = obj.matrix_parent_inverse.copy()
            clone.matrix_basis = obj.matrix_basis.copy()
        _remap_modifiers(copies)
        copies[root].matrix_world = Matrix.Identity(4)
        bpy.context.view_layer.update()
        scene['agarthaComponent'] = json.dumps({'name':root.name,'parentId':root.get('agarthaParentBundleId'),'coordinateSystem':'Blender Z-up; glTF Y-up','pivot':'component local origin'})
        # Writing only this scene retains no unrelated Text blocks or objects.
        bpy.data.libraries.write(paths['source'], {scene}, path_remap='RELATIVE_ALL', fake_user=True, compress=False)
        kit.export_runtime(paths['glb'])
        kit.render_preview(paths['preview'], size=512, samples=16, quality='review')
    for key,path in paths.items():
        if Path(path).stat().st_size > (2_000_000 if key == 'preview' else 16_000_000): raise ValueError('Component '+key+' exceeds publication limits.')
    return paths
