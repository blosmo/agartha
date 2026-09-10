"""Author native procedural materials, bake PBR maps, and export isolated swatches.

Library recipe text is documentation. This module never evaluates downloaded code.
"""
from __future__ import annotations
from contextlib import contextmanager
import math
from pathlib import Path


@contextmanager
def _studio():
    import bpy
    original = bpy.context.window.scene
    scene = bpy.data.scenes.new('Agartha material workspace')
    bpy.context.window.scene = scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 16
    scene.cycles.use_denoising = True
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 2
    try:
        yield scene
    finally:
        bpy.context.window.scene = original
        for obj in list(scene.objects):
            data = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if data is not None and data.users == 0:
                if isinstance(data, bpy.types.Mesh): bpy.data.meshes.remove(data)
                elif isinstance(data, bpy.types.Camera): bpy.data.cameras.remove(data)
                elif isinstance(data, bpy.types.Light): bpy.data.lights.remove(data)
        world = scene.world
        bpy.data.scenes.remove(scene)
        if world is not None and world.users == 0: bpy.data.worlds.remove(world)


def _principled(material):
    if not material.use_nodes:
        raise ValueError('Use a node material with one Principled BSDF connected to Material Output.')
    outputs = [n for n in material.node_tree.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output]
    if len(outputs) != 1 or len(outputs[0].inputs['Surface'].links) != 1:
        raise ValueError('Connect one Principled BSDF to the active Material Output.')
    node = outputs[0].inputs['Surface'].links[0].from_node
    if node.type != 'BSDF_PRINCIPLED':
        raise ValueError('Layer procedural textures into one Principled BSDF before baking.')
    return node, outputs[0]


def _image(name, resolution, *, data):
    import bpy
    result = bpy.data.images.new(name, width=resolution, height=resolution, alpha=False)
    result.colorspace_settings.name = 'Non-Color' if data else 'sRGB'
    return result


def _pack(image):
    if image.packed_file is None: image.pack()
    return image


def _prepare_source(material):
    """Avoid pulling private object dependencies or executable drivers into a swatch."""
    import bpy
    seen = set()
    def inspect(block):
        if block in seen: return
        seen.add(block)
        if block.animation_data and block.animation_data.drivers:
            raise ValueError('Remove drivers from the reusable material source.')
        if not hasattr(block, 'nodes'): return
        for node in block.nodes:
            if node.type == 'SCRIPT': raise ValueError('Share a native texture graph, not executable shader scripts.')
            for prop in node.bl_rna.properties:
                if prop.type == 'POINTER' and isinstance(getattr(node, prop.identifier, None), bpy.types.Object):
                    raise ValueError('Remove scene-object references from the reusable material source.')
            if node.type == 'TEX_IMAGE' and node.image and node.image.packed_file is None: node.image.pack()
            if node.type == 'GROUP' and node.node_tree: inspect(node.node_tree)
    inspect(material)
    inspect(material.node_tree)


def _portable(name, albedo, arm, normal):
    import bpy
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = nodes.get('Principled BSDF')
    shader.inputs['Metallic'].default_value = 0
    for channel, image in [('albedo', albedo), ('arm', arm), ('normal', normal)]:
        texture = nodes.new('ShaderNodeTexImage')
        texture.image = _pack(image)
        texture.extension = 'REPEAT'
        if channel == 'albedo':
            links.new(texture.outputs['Color'], shader.inputs['Base Color'])
        elif channel == 'arm':
            separate = nodes.new('ShaderNodeSeparateColor')
            separate.mode = 'RGB'
            links.new(texture.outputs['Color'], separate.inputs['Color'])
            links.new(separate.outputs['Green'], shader.inputs['Roughness'])
            links.new(separate.outputs['Blue'], shader.inputs['Metallic'])
        else:
            mapping = nodes.new('ShaderNodeNormalMap')
            mapping.inputs['Strength'].default_value = 1
            links.new(texture.outputs['Color'], mapping.inputs['Color'])
            links.new(mapping.outputs['Normal'], shader.inputs['Normal'])
    return material


def bake_material(source, *, resolution=1024, tile_size=2.0, name=None):
    """Bake an arbitrary native texture graph to unlit albedo, ARM and tangent normals.

    Author with UV coordinates for portable 2D patterns, or position/Object coordinates
    for a physical tile. A tile is sampled on an XY plane from (0,0) to (tile_size,tile_size).
    Inspect the resulting repeating tile: a procedural graph is not automatically seamless.
    """
    import bpy
    import numpy as np
    if resolution not in {256, 512, 1024} or not isinstance(tile_size, (int, float)) or not math.isfinite(tile_size) or not .01 <= tile_size <= 100:
        raise ValueError('Use 256, 512 or 1024 pixels and a physical tile size from 0.01 to 100.')
    _principled(source)
    working = source.copy()
    images = []
    try:
        with _studio() as scene:
            mesh = bpy.data.meshes.new('Agartha bake plane')
            mesh.from_pydata([(0, 0, 0), (tile_size, 0, 0), (tile_size, tile_size, 0), (0, tile_size, 0)], [], [(0, 1, 2, 3)])
            mesh.uv_layers.new(name='UVMap')
            for loop, uv in zip(mesh.uv_layers.active.data, [(0,0),(1,0),(1,1),(0,1)]): loop.uv = uv
            obj = bpy.data.objects.new('Material tile', mesh)
            scene.collection.objects.link(obj)
            obj.data.materials.append(working)
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            nodes, links = working.node_tree.nodes, working.node_tree.links
            shader, output = _principled(working)
            target = nodes.new('ShaderNodeTexImage')
            emission = nodes.new('ShaderNodeEmission')
            for socket_name, suffix, data in [('Base Color', 'albedo', False), ('Roughness', 'roughness', True), ('Metallic', 'metalness', True)]:
                image = _image((name or source.name)+' '+suffix, resolution, data=data)
                images.append(image)
                target.image = image
                for node in nodes: node.select = False
                target.select = True
                nodes.active = target
                for link in list(emission.inputs['Color'].links): links.remove(link)
                socket = shader.inputs[socket_name]
                if socket.is_linked:
                    links.new(socket.links[0].from_socket, emission.inputs['Color'])
                else:
                    value = socket.default_value
                    emission.inputs['Color'].default_value = tuple(value) if socket_name == 'Base Color' else (value,value,value,1)
                links.new(emission.outputs['Emission'], output.inputs['Surface'])
                bpy.ops.object.bake(type='EMIT', margin=4, use_clear=True)
            links.new(shader.outputs['BSDF'], output.inputs['Surface'])
            normal = _image((name or source.name)+' normal', resolution, data=True)
            images.append(normal)
            target.image = normal
            nodes.active = target
            bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', margin=4, use_clear=True)
            albedo, roughness, metalness, normal = images
            values = np.ones((resolution*resolution, 4), dtype=np.float32)
            for image, index in [(roughness, 1), (metalness, 2)]:
                raw = np.empty(resolution*resolution*4, dtype=np.float32)
                image.pixels.foreach_get(raw)
                values[:, index] = np.clip(raw.reshape(-1,4)[:,0], 0, 1)
            arm = _image((name or source.name)+' ARM', resolution, data=True)
            images.append(arm)
            arm.pixels.foreach_set(values.ravel())
            result = _portable(name or source.name+' PBR', albedo, arm, normal)
            result['agarthaSourceMaterial'] = source.name
            result['agarthaTileSize'] = tile_size
            source.use_fake_user = True
            for image in [roughness, metalness]: bpy.data.images.remove(image)
            return result
    except Exception:
        for image in images:
            if image.name in bpy.data.images and image.users == 0: bpy.data.images.remove(image)
        raise
    finally:
        bpy.data.materials.remove(working)


def export_material_bundle(material, directory, *, name, recipe, tile_size=2.0, resolution=1024):
    """Export only a material swatch, its editable node graph and a lit PNG preview."""
    import bpy
    from mathutils import Vector
    if not isinstance(name, str) or not 1 <= len(name) <= 80 or not isinstance(recipe, str) or not 1 <= len(recipe) <= 8000:
        raise ValueError('Give the material a name and an authoring recipe.')
    directory = Path(directory).resolve()
    directory.mkdir(parents=True, exist_ok=True)
    source_name = material.get('agarthaSourceMaterial')
    source = bpy.data.materials.get(source_name) if source_name else material
    if source is None:
        raise ValueError('The original procedural source is missing. Restore it before publishing.')
    _prepare_source(source)
    portable = material if material.get('agarthaSourceMaterial') else bake_material(source, resolution=resolution, tile_size=tile_size, name=name)
    source_copy = source.copy()
    recipe_text = bpy.data.texts.new('MATERIAL_RECIPE.md')
    recipe_text.write(recipe)
    recipe_text.use_module = False
    source_copy['agarthaTileSize'] = tile_size
    source_copy['agarthaRecipe'] = recipe
    try:
        bpy.data.libraries.write(str(directory/'source.blend'), {source_copy, recipe_text}, path_remap='RELATIVE', fake_user=True, compress=False)
        with _studio() as scene:
            scene.world = bpy.data.worlds.new('Neutral material studio')
            scene.world.use_nodes = True
            scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.2,.2,.2,1)
            scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .5
            bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=.85, location=(-.8,0,.9))
            sphere = bpy.context.object
            sphere.name = name
            sphere.data.materials.append(portable)
            for face in sphere.data.polygons: face.use_smooth = True
            bpy.ops.mesh.primitive_plane_add(size=1.5, location=(.95,0,.2))
            tile = bpy.context.object
            tile.name = 'Repeating tile'
            tile.rotation_euler.x = math.pi/2
            tile.data.materials.append(portable)
            for uv in tile.data.uv_layers.active.data: uv.uv *= 2
            bpy.ops.object.camera_add(location=(3,-6,3.2))
            camera = bpy.context.object
            camera.rotation_euler = (Vector((.1,0,.7))-camera.location).to_track_quat('-Z','Y').to_euler()
            camera.data.type = 'ORTHO'
            camera.data.ortho_scale = 3.7
            scene.camera = camera
            for position, power, size in [((-3,-4,6),900,4), ((4,1,3),700,3)]:
                bpy.ops.object.light_add(type='AREA', location=position)
                light = bpy.context.object
                light.data.energy = power
                light.data.shape = 'DISK'
                light.data.size = size
                light.rotation_euler = (Vector((0,0,.6))-light.location).to_track_quat('-Z','Y').to_euler()
            scene.render.resolution_x = 768
            scene.render.resolution_y = 512
            scene.render.resolution_percentage = 100
            scene.cycles.samples = 32
            scene.cycles.time_limit = 12
            scene.view_settings.view_transform = 'AgX'
            scene.render.image_settings.file_format = 'PNG'
            scene.render.filepath = str(directory/'preview.png')
            bpy.ops.render.render(write_still=True)
            bpy.ops.object.select_all(action='DESELECT')
            sphere.select_set(True)
            tile.select_set(True)
            bpy.context.view_layer.objects.active = sphere
            bpy.ops.export_scene.gltf(filepath=str(directory/'material.glb'), export_format='GLB', use_selection=True, use_active_scene=True, export_cameras=False, export_lights=False)
        result = {key: str(directory/value) for key, value in [('glb','material.glb'),('source','source.blend'),('preview','preview.png')]}
        if any(Path(path).stat().st_size > 16_000_000 for path in result.values()):
            raise ValueError('Material bundle exceeds the file budget.')
        return result
    finally:
        bpy.data.materials.remove(source_copy)
        bpy.data.texts.remove(recipe_text)


def import_material(path, obj, *, tile_size=2.0, projection='surface', center=None, direction=None):
    """Import a validated swatch's material without importing its geometry into the model."""
    import bpy
    import hashlib
    from .material_mapping import assign_material
    fingerprint = hashlib.sha256(Path(path).read_bytes()).hexdigest()
    existing = next((m for m in bpy.data.materials if m.get('agarthaSwatchSha256') == fingerprint), None)
    if existing is not None:
        return assign_material(obj, existing, tile_size=tile_size, projection=projection, center=center, direction=direction)
    with _studio():
        bpy.ops.import_scene.gltf(filepath=str(Path(path).resolve()))
        materials = {material for mesh in bpy.context.scene.objects if mesh.type == 'MESH' for material in mesh.data.materials if material}
        if len(materials) != 1:
            raise ValueError('A shared material swatch must contain one material.')
        surface = next(iter(materials))
        for node in surface.node_tree.nodes:
            if node.type == 'TEX_IMAGE' and node.image and node.image.packed_file is None: node.image.pack()
        surface.use_fake_user = True
        surface['agarthaSwatchSha256'] = fingerprint
    return assign_material(obj, surface, tile_size=tile_size, projection=projection, center=center, direction=direction)
