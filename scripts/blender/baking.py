"""Blender 5.2 procedural PBR baking on a disposable evaluated mesh.

procedural_material(name, preset='stone'|'wood', scale=3, seed=0) -> Material
bake_materials(obj, resolution=512, samples=16) -> new mesh Object

Bake one effective evaluated material: a direct Principled BSDF with procedural
Base Color, Roughness, Metallic and optional Normal. Image/UV/attribute-driven
shaders, nested shader groups, displacement and non-default extra Principled
features are rejected. The original object and material remain editable.
Returned textures are packed; base color is sRGB, metallic-roughness and tangent
normal maps are Non-Color. No studio illumination is baked into surface color.
"""
from array import array
import math
import bpy


class BakingError(ValueError):
    """The input is outside the supported, bounded material-baking contract."""


def _principled_material(material):
    if material is None or not material.use_nodes:
        raise BakingError('Use a node-based Principled BSDF material')
    tree = material.node_tree
    outputs = [n for n in tree.nodes if n.type == 'OUTPUT_MATERIAL']
    if len(outputs) != 1:
        raise BakingError('Material must have one Material Output')
    output = outputs[0]
    if output.inputs['Volume'].is_linked or output.inputs['Displacement'].is_linked:
        raise BakingError('Volume and displacement are unsupported')
    surface = output.inputs['Surface']
    if not surface.is_linked or surface.links[0].from_node.type != 'BSDF_PRINCIPLED':
        raise BakingError('Surface must connect directly to a single Principled BSDF')
    for node in tree.nodes:
        if node.type in {'TEX_IMAGE', 'UVMAP', 'ATTRIBUTE', 'VERTEX_COLOR', 'OBJECT_INFO', 'GROUP'}:
            raise BakingError('Use generated procedural coordinates; image, UV, attribute, object-info and shader-group inputs are unsupported')
        if node.type == 'TEX_COORD' and any(node.outputs[key].is_linked for key in ('UV', 'Camera', 'Window', 'Reflection')):
            raise BakingError('UV- or view-dependent procedural shaders are unsupported')
        if node.type == 'NORMAL_MAP' and node.space == 'TANGENT':
            raise BakingError('Use procedural bump; source tangent normal maps depend on source UVs')
        if node.type == 'LIGHT_PATH' or node.type == 'NEW_GEOMETRY' and any(node.outputs[key].is_linked for key in ('Incoming', 'Backfacing')):
            raise BakingError('View-dependent surface inputs are unsupported')
    shader = surface.links[0].from_node
    # Compare with this Blender version's defaults, including vector/tint inputs.
    reference = bpy.data.materials.new('__bake_contract_defaults')
    try:
        reference.use_nodes = True
        defaults = reference.node_tree.nodes.get('Principled BSDF')
        for socket, default in zip(shader.inputs, defaults.inputs):
            if socket.name in {'Base Color', 'Roughness', 'Metallic', 'Normal'}:
                continue
            if socket.is_linked:
                raise BakingError('Unsupported Principled input: ' + socket.name)
            if not hasattr(socket, 'default_value'):
                continue
            actual, expected = socket.default_value, default.default_value
            if isinstance(actual, (int, float)):
                matches = abs(actual - expected) <= 1e-6
            else:
                matches = all(abs(a-b) <= 1e-6 for a, b in zip(actual, expected))
            if not matches:
                raise BakingError('Unsupported non-default Principled input: ' + socket.name)
    finally:
        bpy.data.materials.remove(reference)
    return shader


_BAKE_SETTINGS = ('target', 'use_selected_to_active', 'use_cage', 'normal_space',
                  'normal_r', 'normal_g', 'normal_b', 'margin', 'use_clear')


def _snapshot_state(scene):
    active = bpy.context.view_layer.objects.active
    return {'active': active, 'selected': list(bpy.context.selected_objects),
            'mode': active.mode if active else 'OBJECT', 'engine': scene.render.engine,
            'samples': scene.cycles.samples, 'device': scene.cycles.device,
            'bake': {key: getattr(scene.render.bake, key) for key in _BAKE_SETTINGS}}


def _restore_state(scene, state):
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    scene.render.engine = state['engine']
    scene.cycles.samples, scene.cycles.device = state['samples'], state['device']
    for key, value in state['bake'].items():
        setattr(scene.render.bake, key, value)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in state['selected']:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = state['active']
    if state['active'] and state['mode'] != 'OBJECT':
        bpy.ops.object.mode_set(mode=state['mode'])


def _unwrap(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15192, island_margin=0.03)
    bpy.ops.object.mode_set(mode='OBJECT')


def _bake_emit(scene, obj, material, socket_name, image):
    nodes, links = material.node_tree.nodes, material.node_tree.links
    output = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL')
    bsdf = output.inputs['Surface'].links[0].from_node
    socket = bsdf.inputs[socket_name]
    emission = nodes.new('ShaderNodeEmission')
    if socket.is_linked:
        links.new(socket.links[0].from_socket, emission.inputs['Color'])
    else:
        value = socket.default_value
        emission.inputs['Color'].default_value = (value, value, value, 1) if isinstance(value, (float, int)) else value
    links.new(emission.outputs[0], output.inputs['Surface'])
    target = nodes.new('ShaderNodeTexImage')
    target.image = image
    nodes.active = target
    bpy.ops.object.bake(type='EMIT', use_clear=True, margin=16)


def _bake_normal(material, image):
    nodes = material.node_tree.nodes
    target = nodes.new('ShaderNodeTexImage')
    target.image = image
    nodes.active = target
    bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', normal_r='POS_X', normal_g='POS_Y', normal_b='POS_Z', use_clear=True, margin=16)


def _pack_metallic_roughness(roughness, metallic, packed):
    count = len(roughness.pixels)
    rough = array('f', [0]) * count
    metal = array('f', [0]) * count
    values = array('f', [1]) * count
    roughness.pixels.foreach_get(rough)
    metallic.pixels.foreach_get(metal)
    values[1::4] = rough[0::4]
    values[2::4] = metal[0::4]
    packed.pixels.foreach_set(values)


def _make_output_material(material, images):
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = nodes.get('Principled BSDF')
    for key, image in images.items():
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = image
        if key == 'base_color':
            links.new(tex.outputs['Color'], shader.inputs['Base Color'])
        elif key == 'metallic_roughness':
            separate = nodes.new('ShaderNodeSeparateColor')
            separate.mode = 'RGB'
            links.new(tex.outputs['Color'], separate.inputs['Color'])
            links.new(separate.outputs['Green'], shader.inputs['Roughness'])
            links.new(separate.outputs['Blue'], shader.inputs['Metallic'])
        else:
            normal = nodes.new('ShaderNodeNormalMap')
            links.new(tex.outputs['Color'], normal.inputs['Color'])
            links.new(normal.outputs['Normal'], shader.inputs['Normal'])


def bake_materials(obj, resolution=512, samples=16):
    """Return a new mesh with packed PBR textures; preserve source and UI state.

    One effective evaluated material is required, including material assigned by
    Geometry Nodes. Resolution: 16..2048; CPU samples: 1..128; max 100k triangles.
    Unsupported source shaders raise BakingError before baking. The returned
    object is linked to the scene root, ready to move into a delivery collection.
    Names of its two or three packed images are in result['bake_images'].
    """
    bpy.context.view_layer.update()
    if not obj or obj.type != 'MESH' or obj.name not in bpy.context.view_layer.objects:
        raise BakingError('Use a mesh object in the current view layer')
    if isinstance(resolution, bool) or not isinstance(resolution, int) or not 16 <= resolution <= 2048:
        raise BakingError('resolution must be an integer from 16 to 2048')
    if isinstance(samples, bool) or not isinstance(samples, int) or not 1 <= samples <= 128:
        raise BakingError('samples must be an integer from 1 to 128')
    scene, state = bpy.context.scene, _snapshot_state(bpy.context.scene)
    clone = mesh = output_material = None
    images, owned_images, owned_materials = {}, [], []
    success = False

    def new_image(suffix, colorspace):
        image = bpy.data.images.new(obj.name + '_' + suffix, width=resolution, height=resolution, alpha=True)
        owned_images.append(image)
        image.colorspace_settings.name = colorspace
        return image

    try:
        if bpy.context.object and bpy.context.object.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
        depsgraph = bpy.context.evaluated_depsgraph_get()
        evaluated = obj.evaluated_get(depsgraph)
        slots = [slot.material for slot in evaluated.material_slots]
        used = {polygon.material_index for polygon in evaluated.data.polygons}
        materials = {slots[index].original for index in used if index < len(slots) and slots[index] is not None}
        if not used or any(index >= len(slots) or slots[index] is None for index in used) or len(materials) != 1:
            raise BakingError('Use exactly one effective evaluated material')
        source_material = next(iter(materials))
        shader = _principled_material(source_material)
        has_normal = shader.inputs['Normal'].is_linked
        mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=depsgraph)
        mesh.calc_loop_triangles()
        if not 0 < len(mesh.loop_triangles) <= 100000:
            raise BakingError('Evaluated mesh must contain 1..100000 triangles')
        clone = bpy.data.objects.new(obj.name + '_baked', mesh)
        scene.collection.objects.link(clone)
        clone.matrix_world = obj.matrix_world.copy()
        mesh.materials.clear()
        mesh.materials.append(source_material)
        for polygon in mesh.polygons:
            polygon.material_index = 0
        # Source shaders cannot depend on UVs, so use one unambiguous bake map.
        for layer in list(mesh.uv_layers):
            mesh.uv_layers.remove(layer)
        _unwrap(clone)
        scene.render.engine = 'CYCLES'
        scene.cycles.samples, scene.cycles.device = samples, 'CPU'
        scene.render.bake.target = 'IMAGE_TEXTURES'
        scene.render.bake.use_selected_to_active = False
        scene.render.bake.use_cage = False
        channels = {}
        for key, socket, colorspace in (('base_color', 'Base Color', 'sRGB'), ('roughness', 'Roughness', 'Non-Color'), ('metallic', 'Metallic', 'Non-Color')):
            image = new_image(key, colorspace)
            channel = source_material.copy()
            owned_materials.append(channel)
            mesh.materials[0] = channel
            _bake_emit(scene, clone, channel, socket, image)
            channels[key] = image
        images['base_color'] = channels['base_color']
        packed = new_image('metallic_roughness', 'Non-Color')
        _pack_metallic_roughness(channels['roughness'], channels['metallic'], packed)
        images['metallic_roughness'] = packed
        if has_normal:
            image = new_image('normal', 'Non-Color')
            channel = source_material.copy()
            owned_materials.append(channel)
            mesh.materials[0] = channel
            _bake_normal(channel, image)
            images['normal'] = image
        for image in images.values():
            image.pack()
        output_material = bpy.data.materials.new(obj.name + '_baked')
        owned_materials.append(output_material)
        _make_output_material(output_material, images)
        mesh.materials[0] = output_material
        clone['bake_images'] = ','.join(image.name for image in images.values())
        clone['bake_resolution'], clone['bake_samples'] = resolution, samples
        success = True
        return clone
    finally:
        try:
            _restore_state(scene, state)
        except Exception:
            success = False
            raise
        finally:
            if not success:
                if clone is not None:
                    bpy.data.objects.remove(clone, do_unlink=True)
                if mesh is not None:
                    bpy.data.meshes.remove(mesh)
            for material in owned_materials:
                if not success or material != output_material:
                    bpy.data.materials.remove(material, do_unlink=True)
            for image in owned_images:
                if not success or image not in images.values():
                    bpy.data.images.remove(image, do_unlink=True)
def procedural_material(name, preset="stone", scale=3.0, seed=0.0):
    """Create a bake-friendly procedural Principled material (stone or wood)."""
    if preset not in {"stone", "wood"}:
        raise BakingError("unknown procedural preset %r; use 'stone' or 'wood'" % preset)
    if isinstance(scale, bool) or not isinstance(scale, (int, float)) or not math.isfinite(float(scale)) or float(scale) <= 0:
        raise BakingError("scale must be a finite positive number")
    if isinstance(seed, bool) or not isinstance(seed, (int, float)) or not math.isfinite(float(seed)):
        raise BakingError("seed must be a finite number")
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    tex = nodes.new("ShaderNodeTexNoise")
    tex.noise_dimensions = "4D"
    tex.inputs["Scale"].default_value = max(0.01, float(scale))
    tex.inputs["Detail"].default_value = 5.0 if preset == "stone" else 3.0
    tex.inputs["Roughness"].default_value = 0.7
    if tex.inputs.get("W"):
        tex.inputs["W"].default_value = float(seed)
    ramp = nodes.new("ShaderNodeValToRGB")
    if preset == "stone":
        ramp.color_ramp.elements[0].color = (0.08, 0.1, 0.12, 1)
        ramp.color_ramp.elements[1].color = (0.62, 0.68, 0.72, 1)
    else:
        ramp.color_ramp.elements[0].color = (0.08, 0.015, 0.004, 1)
        ramp.color_ramp.elements[1].color = (0.65, 0.22, 0.035, 1)
    if preset == "wood":
        grain = nodes.new("ShaderNodeTexWave")
        grain.wave_type = "BANDS"
        grain.bands_direction = "X"
        grain.inputs["Scale"].default_value = max(0.01, float(scale) * 2.5)
        grain.inputs["Distortion"].default_value = 4.0
        links.new(grain.outputs["Color"], ramp.inputs["Fac"])
    else:
        links.new(tex.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(tex.outputs["Fac"], bsdf.inputs["Roughness"])
    bsdf.inputs["Metallic"].default_value = 0.0
    return material


__all__ = ["BakingError", "bake_materials", "procedural_material"]
