"""Verify that acceptance sees portable GLB materials and preserves the source."""
from pathlib import Path
import sys
import tempfile

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from cloud.blender_billing.export_review import render_export_view_code

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_cube_add()
source = bpy.context.object
source.name = 'Source body'
material = bpy.data.materials.new('Portable blue')
material.use_nodes = True
material.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.02, .05, .8, 1)
source.data.materials.append(material)
original = bpy.context.scene

def snapshot():
    return (bpy.context.scene, source.location.copy(), source.matrix_world.copy(), source.data,
            tuple(material.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value),
            tuple(bpy.context.selected_objects), bpy.context.view_layer.objects.active,
            {name: set(getattr(bpy.data, name)) for name in ('scenes', 'objects', 'collections', 'meshes', 'materials', 'worlds', 'cameras', 'lights')})

inspected = []
def verify_import():
    scene = bpy.context.scene
    assert scene != original, 'Critic inspected the editable source scene'
    objects = [obj for obj in scene.objects if obj.type == 'MESH']
    assert len(objects) == 1 and objects[0] != source
    assert abs(objects[0].location.x) < .01, 'Critic inspected a later unexported edit'
    color = objects[0].data.materials[0].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value
    assert color[2] > .7 and color[0] < .1, 'Critic saw the source material instead of the delivered material'
    assert len([o for o in scene.objects if o.type == 'LIGHT']) == 3
    inspected.append(scene.name)

with tempfile.TemporaryDirectory() as directory:
    bpy.ops.export_scene.gltf(filepath=directory + '/model.glb', export_format='GLB', use_selection=True)
    source.location.x = 100
    material.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.8, .02, .02, 1)
    bpy.context.view_layer.update()
    before = snapshot()
    for view in ('hero', 'front', 'right'):
        code = render_export_view_code(view).replace('/workspace/artifacts', directory)
        code = code.replace('bpy.ops.render.render(write_still=True)', 'verify_import()' + ('; bpy.ops.render.render(write_still=True)' if view == 'hero' else ''))
        exec(code, globals())
        assert snapshot() == before, 'Export review changed the editable source or leaked scene data'
    assert (Path(directory) / 'review_hero.png').stat().st_size > 1000
    code = render_export_view_code('front').replace('/workspace/artifacts', directory).replace('bpy.ops.render.render(write_still=True)', "raise RuntimeError('injected render failure')")
    try: exec(code, globals())
    except RuntimeError as error: assert str(error) == 'injected render failure'
    else: raise AssertionError('Render failure was swallowed')
    assert snapshot() == before, 'Failed export review changed the editable source'
print('EXPORT_REVIEW_OK', len(inspected), 'delivered-GLB views; source and failed-render restoration verified')
