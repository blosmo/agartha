"""Real Blender 5.2 regression for connected, editable advanced generators."""
import hashlib
import json
from pathlib import Path
import runpy
import struct
import tempfile
import bpy

ROOT = Path(__file__).resolve().parents[2]
kit = runpy.run_path(str(ROOT / 'scripts/blender/advanced_kit.py'))
static = runpy.run_path(str(ROOT / 'scripts/seed/starter_kit.py'))


def geometry(obj):
    bpy.context.view_layer.update()
    mesh = obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).data
    mesh.calc_loop_triangles()
    coordinates = [tuple(round(v, 5) for v in vertex.co) for vertex in mesh.vertices]
    return len(mesh.loop_triangles), hashlib.sha256(repr(coordinates).encode()).hexdigest()


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    arch = kit['create_arch'](loc=(1, 2, 3), bevel=0)
    stairs = kit['create_stairs'](bevel=0)
    column = kit['create_column'](bevel=0)
    other = kit['create_column']('Other column', radius=.8)
    rocks = kit['create_rock_cluster']()
    objects = [arch, stairs, column, other, rocks]
    for obj in objects:
        assert len(obj.data.vertices) == 0, 'Source fallback could mask failed Geometry Nodes'
        assert 0 < geometry(obj)[0] < 100000, (obj.name, geometry(obj))
        assert not obj.modifiers[0].node_warnings[:]
    assert tuple(arch.location) == (1, -3, 2), 'Y-up mapping is incorrect'
    assert all(abs(a-b) < .015 for a,b in zip(arch.dimensions, (3, .6, 4))), arch.dimensions[:]
    assert all(abs(a-b) < .001 for a,b in zip(stairs.dimensions, (2, 2.4, 1.6)))
    assert all(abs(a-b) < .001 for a,b in zip(column.dimensions, (1, 1, 3)))
    other_before = geometry(other)
    kit['set_parameters'](column, radius=.7, height=4)
    assert abs(column.dimensions.x-1.4) < .001 and abs(column.dimensions.z-4) < .001
    assert geometry(other) == other_before, 'Editing one object modified another'
    before = geometry(arch)
    kit['set_parameters'](arch, width=4)
    assert geometry(arch) != before and abs(arch.dimensions.x-4) < .015
    before = geometry(stairs)
    kit['set_parameters'](stairs, steps=12)
    assert geometry(stairs)[0] > before[0] and abs(stairs.dimensions.z-2.4) < .001
    before = geometry(rocks)
    kit['set_parameters'](rocks, seed=8)
    assert geometry(rocks) != before, 'SDF seed did not change the surface'
    before = geometry(rocks)
    kit['set_parameters'](rocks, resolution=32)
    assert geometry(rocks) != before, 'SDF resolution did not change the surface'
    finish = bpy.data.node_groups['AGARTHA_Finish_52_v1']
    evaluate = next(node for node in finish.nodes if node.bl_idname == 'NodeEvaluateClosure')
    assert evaluate.inputs['Closure'].is_linked and evaluate.inputs['Style'].is_linked
    assert evaluate.outputs['Geometry'].is_linked
    assert any(node.bl_idname == 'NodeCombineBundle' and node.outputs['Bundle'].is_linked for node in finish.nodes)
    before = geometry(column)
    kit['set_parameters'](column, bevel=.03, segments=3)
    assert geometry(column)[0] > before[0], 'Shared closure did not apply bevel style'
    bpy.ops.mesh.primitive_cube_add()
    plain = bpy.context.object
    before = geometry(plain)
    kit['add_mesh_bevel'](plain, width=.05, segments=2)
    assert geometry(plain)[0] > before[0], 'Mesh Bevel node did not evaluate'
    bpy.data.objects.remove(plain, do_unlink=True)
    before = geometry(arch)
    try:
        kit['set_parameters'](arch, width=20, depth=.9)
    except ValueError:
        pass
    else:
        raise AssertionError('Invalid arch proportions accepted')
    assert geometry(arch) == before, 'Failed update was not atomic'
    for call, args in [('create_stairs', {'steps': 1000}), ('create_rock_cluster', {'resolution': 200}), ('create_column', {'radius': float('nan')})]:
        count = len(bpy.data.objects)
        try:
            kit[call](**args)
        except ValueError:
            pass
        else:
            raise AssertionError('Invalid parameters accepted')
        assert len(bpy.data.objects) == count
    before = {obj.name: geometry(obj) for obj in objects}
    expected_triangles = sum(value[0] for value in before.values())
    with tempfile.TemporaryDirectory(prefix='agartha-advanced-') as directory:
        source, target = Path(directory)/'advanced.blend', Path(directory)/'advanced.glb'
        bpy.ops.wm.save_as_mainfile(filepath=str(source))
        metrics = static['export_runtime'](str(target))
        data = target.read_bytes()
        doc = json.loads(data[20:20+struct.unpack_from('<I', data, 12)[0]])
        triangles = sum(doc['accessors'][p['indices']]['count']//3 for mesh in doc['meshes'] for p in mesh['primitives'])
        assert triangles == expected_triangles, (triangles, expected_triangles)
        bpy.ops.wm.open_mainfile(filepath=str(source), use_scripts=False)
        assert {name: geometry(bpy.data.objects[name]) for name in before} == before
        kit['set_parameters'](bpy.data.objects['Column'], radius=.9)
        assert geometry(bpy.data.objects['Column']) != before['Column'], 'Saved source lost editable parameters'
        print('ADVANCED_KIT_OK', json.dumps({'objects':len(objects), 'triangles':triangles, 'glbBytes':len(data), 'sourceEditable':True, 'boundsChecked':True, 'realBundleClosure':True, 'sdfEvaluated':True}))


if __name__ == '__main__':
    main()
