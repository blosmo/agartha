"""Real-Blender regression for scripts/blender/baking.py.

Run with: blender --background --factory-startup --python verify_baking.py
"""

import os
import sys
import tempfile
import json
import struct
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import baking


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16)
    original = bpy.context.object
    original.name = "baking_regression_source"
    original.data.materials.append(baking.procedural_material("regression_stone", "stone", scale=7.0))
    original["sentinel"] = "preserve-me"
    original.data.uv_layers.new(name='Second UV')
    original.data.uv_layers.active_index = 1
    original.data.uv_layers[0].active_render = True
    uv_before = [(layer.name, tuple(tuple(loop.uv) for loop in layer.data)) for layer in original.data.uv_layers]
    before_mesh = original.data.as_pointer()
    before_material = original.data.materials[0].as_pointer()
    before_engine = bpy.context.scene.render.engine
    out = baking.bake_materials(original, resolution=32, samples=1)
    assert out is not original and out.type == "MESH"
    assert len(out.data.uv_layers) == 1
    assert [(layer.name, tuple(tuple(loop.uv) for loop in layer.data)) for layer in original.data.uv_layers] == uv_before
    assert original.data.as_pointer() == before_mesh
    assert original.data.materials[0].as_pointer() == before_material
    assert original["sentinel"] == "preserve-me"
    assert out.get("bake_images")
    for name in out.get("bake_images").split(","):
        image = bpy.data.images.get(name)
        assert image and image.packed_file, name
        assert max(image.pixels[:][0::4]) - min(image.pixels[:][0::4]) > .01 if 'base_color' in name else True
    assert bpy.context.scene.render.engine == before_engine
    bake_settings = bpy.context.scene.render.bake
    bake_settings.target = "VERTEX_COLORS"
    bake_settings.use_selected_to_active = True
    bake_settings.use_cage = True
    # Exercise the finally block with a failure after the disposable copy has
    # been created, and ensure the caller's selection/active state survives.
    bpy.ops.object.select_all(action="DESELECT")
    original.select_set(True)
    bpy.context.view_layer.objects.active = original
    object_count = len(bpy.data.objects)
    mesh_count = len(bpy.data.meshes)
    material_count = len(bpy.data.materials)
    image_count = len(bpy.data.images)
    old_bake_emit = baking._bake_emit
    def injected_failure(*args, **kwargs):
        raise RuntimeError("injected bake failure")
    baking._bake_emit = injected_failure
    try:
        baking.bake_materials(original, resolution=32, samples=1)
    except RuntimeError as error:
        assert "injected" in str(error)
    else:
        raise AssertionError("injected failure did not propagate")
    finally:
        baking._bake_emit = old_bake_emit
    assert len(bpy.data.objects) == object_count
    assert len(bpy.data.meshes) == mesh_count
    assert len(bpy.data.materials) == material_count
    assert len(bpy.data.images) == image_count
    assert bpy.context.view_layer.objects.active == original
    assert original.select_get()
    assert bake_settings.target == "VERTEX_COLORS"
    assert bake_settings.use_selected_to_active is True
    assert bake_settings.use_cage is True
    try:
        baking.bake_materials(original, resolution=2048, samples=129)
    except baking.BakingError:
        pass
    else:
        raise AssertionError("sample guard did not reject 129")
    with tempfile.TemporaryDirectory() as directory:
        path = os.path.join(directory, "baked.glb")
        bpy.ops.object.select_all(action="DESELECT")
        out.select_set(True)
        bpy.context.view_layer.objects.active = out
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_image_format="AUTO", use_selection=True)
        assert os.path.getsize(path) > 1024
        with open(path, "rb") as exported:
            glb = exported.read()
        assert b'"baseColorTexture"' in glb
        assert b'"metallicRoughnessTexture"' in glb
    # Editable node-generated meshes have no base material slots.
    generated = bpy.data.objects.new('gn_source', bpy.data.meshes.new('empty_source'))
    bpy.context.scene.collection.objects.link(generated)
    group = bpy.data.node_groups.new('baking_geometry_fixture', 'GeometryNodeTree')
    group.interface.new_socket(name='Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    primitive = group.nodes.new('GeometryNodeMeshCube')
    set_material = group.nodes.new('GeometryNodeSetMaterial')
    set_material.inputs['Material'].default_value = original.data.materials[0]
    output = group.nodes.new('NodeGroupOutput')
    group.links.new(primitive.outputs['Mesh'], set_material.inputs['Geometry'])
    group.links.new(set_material.outputs['Geometry'], output.inputs['Geometry'])
    modifier = generated.modifiers.new('Generated surface', 'NODES')
    modifier.node_group = group
    assert len(generated.data.materials) == 0
    image_count = len(bpy.data.images)
    generated_bake = baking.bake_materials(generated, resolution=32, samples=1)
    assert len(generated_bake.data.polygons) == 6
    assert len(bpy.data.images) == image_count + 2, 'Unused images leaked after success'

    def counts():
        return tuple(len(getattr(bpy.data, name)) for name in ('objects', 'meshes', 'materials', 'images'))

    # Early and late failures must clean up every allocation and preserve mode.
    for hook in ('_unwrap', '_make_output_material'):
        before = counts()
        saved = getattr(baking, hook)
        setattr(baking, hook, injected_failure)
        try:
            baking.bake_materials(original, resolution=32, samples=1)
        except RuntimeError as error:
            assert 'injected' in str(error)
        else:
            raise AssertionError('failure did not propagate')
        finally:
            setattr(baking, hook, saved)
        assert counts() == before, (hook, before, counts())

    for kwargs in ({'samples': True}, {'resolution': 2049}, {'samples': 0}):
        before = counts()
        try:
            baking.bake_materials(original, **kwargs)
        except baking.BakingError:
            pass
        else:
            raise AssertionError('invalid controls accepted')
        assert counts() == before

    # Explicitly reject UV/displacement/extra-surface properties.
    material = original.data.materials[0]
    tree = material.node_tree
    shader = tree.nodes.get('Principled BSDF')
    uv = tree.nodes.new('ShaderNodeUVMap')
    before = counts()
    try:
        baking.bake_materials(original, resolution=32, samples=1)
    except baking.BakingError:
        pass
    else:
        raise AssertionError('UV dependency accepted')
    assert counts() == before
    tree.nodes.remove(uv)
    output = next(node for node in tree.nodes if node.type == 'OUTPUT_MATERIAL')
    displacement = tree.nodes.new('ShaderNodeDisplacement')
    tree.links.new(displacement.outputs[0], output.inputs['Displacement'])
    try:
        baking.bake_materials(original, resolution=32, samples=1)
    except baking.BakingError:
        pass
    else:
        raise AssertionError('displacement accepted')
    tree.nodes.remove(displacement)

    # Real tangent normal output, plus successful restoration from Edit mode.
    bump = tree.nodes.new('ShaderNodeBump')
    bump.inputs['Distance'].default_value = .12
    noise = next(node for node in tree.nodes if node.type == 'TEX_NOISE')
    tree.links.new(noise.outputs['Fac'], bump.inputs['Height'])
    tree.links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    bpy.ops.object.select_all(action='DESELECT')
    original.select_set(True)
    bpy.context.view_layer.objects.active = original
    bpy.ops.object.mode_set(mode='EDIT')
    normal_bake = baking.bake_materials(original, resolution=32, samples=1)
    assert original.mode == 'EDIT'
    bpy.ops.object.mode_set(mode='OBJECT')
    normal_image = next(bpy.data.images[name] for name in normal_bake['bake_images'].split(',') if name.endswith('_normal'))
    assert max(normal_image.pixels[:][0::4]) - min(normal_image.pixels[:][0::4]) > .02
    with tempfile.TemporaryDirectory() as directory:
        path = os.path.join(directory, 'normal.glb')
        bpy.ops.object.select_all(action='DESELECT')
        normal_bake.select_set(True)
        bpy.context.view_layer.objects.active = normal_bake
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True)
        glb = open(path, 'rb').read()
        doc = json.loads(glb[20:20 + struct.unpack_from('<I', glb, 12)[0]])
        assert 'normalTexture' in doc['materials'][0]
        pbr = doc['materials'][0]['pbrMetallicRoughness']
        assert 'baseColorTexture' in pbr and 'metallicRoughnessTexture' in pbr
        assert len(doc['images']) == 3

    bpy.data.objects.remove(out, do_unlink=True)
    print("baking regression: PASS")


if __name__ == "__main__":
    main()
