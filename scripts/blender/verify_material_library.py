"""Verify shared PBR materials through real Blender and GLB export, offline."""
import os,sys,json,struct
from pathlib import Path
root=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(root))
os.environ['AGARTHA_MATERIAL_ROOT']=str(root/'apps/web/public')
out=Path(sys.argv[sys.argv.index('--')+1]).resolve()
os.environ['AGARTHA_MATERIAL_CACHE']=str(out/'maps')
import bpy
from cloud.blender_mcp.material_library import list_materials,apply_material
out.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
samples=[('pbr-dark-wood',None)]+[(f['baseMaterialId'],f['id']) for f in list_materials()['finishes']]
for i,(base,finish) in enumerate(samples):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,location=(i*2.4,0,1))
 obj=bpy.context.object;obj.name=finish or base
 apply_material(obj,base,finish_id=finish,projection='cylindrical',center=(i*2.4,0,0),tile_size=2)
 for p in obj.data.polygons:p.use_smooth=True
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(out/'materials.glb'),export_format='GLB',use_selection=True)
b=(out/'materials.glb').read_bytes();n=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+n])
for m in g['materials']:
 assert 'baseColorTexture' in m['pbrMetallicRoughness'],m['name']
 assert 'metallicRoughnessTexture' in m['pbrMetallicRoughness'],m['name']
 assert 'normalTexture' in m,m['name']
assert len(g['images'])>=len(samples)*3
print('PBR_EXPORT_VERIFIED',json.dumps({'materials':len(g['materials']),'images':len(g['images']),'bytes':len(b)}))
bpy.ops.wm.save_as_mainfile(filepath=str(out/'materials.blend'))
