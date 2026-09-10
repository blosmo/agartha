"""Verify procedural baking, material-only export, import and physical UV mapping."""
import json
import math
import os
from pathlib import Path
import struct
import sys

root = Path(__file__).resolve().parents[2]
sys.path.insert(0,str(root))
out = Path(sys.argv[sys.argv.index('--')+1]).resolve()
os.environ['AGARTHA_MATERIAL_ROOT'] = str(root/'apps/web/public')
import bpy
from cloud.blender_mcp.material_authoring import bake_material,export_material_bundle,import_material
from cloud.blender_mcp.material_mapping import assign_material,mapping_report
from cloud.blender_mcp.material_recipes import cut_limestone

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.mesh.primitive_plane_add(size=2)
target = bpy.context.object
target.name = 'Private model geometry'
target.scale = (3,.7,1)
target.rotation_euler = (.4,.8,.3)
bpy.context.view_layer.update()
source = cut_limestone('Original procedural limestone')
portable = bake_material(source,resolution=256,tile_size=2)
assign_material(target,portable,tile_size=2,projection='surface')
report = mapping_report(target)
assert report['collapsed']==0 and report['stretched']==0 and report['maxAnisotropy']<1.001,report
before = (bpy.context.scene,tuple(target.data.vertices[0].co),target.data.materials[0])
files = export_material_bundle(portable,out,name='Reusable limestone',recipe='Native Brick and Noise nodes with shallow mortar bump.',resolution=256)
assert (bpy.context.scene,tuple(target.data.vertices[0].co),target.data.materials[0])==before
raw = Path(files['glb']).read_bytes()
doc = json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
assert len(doc['materials'])==1 and len(doc['images'])==3
assert {node['name'] for node in doc['nodes']}=={'Reusable limestone','Repeating tile'}, 'Swatch export included private model geometry'
assert len(doc['scenes'])==1
assert all('bufferView' in image for image in doc['images'])
material = doc['materials'][0]
assert 'baseColorTexture' in material['pbrMetallicRoughness'] and 'metallicRoughnessTexture' in material['pbrMetallicRoughness'] and 'normalTexture' in material
with bpy.data.libraries.load(files['source'],link=False) as (data,_):
    assert len(data.materials)==1 and not data.objects and not data.scenes
    assert 'MATERIAL_RECIPE.md' in data.texts
original_objects = set(bpy.context.scene.objects)
import_material(files['glb'],target,tile_size=2,projection='surface')
assert set(bpy.context.scene.objects)==original_objects
assert mapping_report(target)['maxAnisotropy']<1.001
first_material = target.data.materials[0]
import_material(files['glb'],target,tile_size=2,projection='surface')
assert target.data.materials[0] == first_material, 'Repeated imports duplicated shared maps'
coordinates = next(node for node in source.node_tree.nodes if node.type=='TEX_COORD')
coordinates.object = target
try:
    export_material_bundle(source,out/'rejected',name='Private reference',recipe='Must not export scene references.',resolution=256)
except ValueError as error:
    assert 'scene-object' in str(error)
else:
    raise AssertionError('Source export included a private object dependency')
coordinates.object = None
print('PROCEDURAL_MATERIAL_VERIFIED',json.dumps({'maps':len(doc['images']),'mapping':report,'files':files}))
