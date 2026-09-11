"""Real Blender isolation, pivot, variant and portable component checks."""
import sys,tempfile,json
from pathlib import Path
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from cloud.blender_mcp.components import create_component,duplicate_component,export_component,import_component,assembly_manifest,component_sources,mark_published_component,import_polyhaven
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_cube_add(location=(5,0,1))
part=bpy.context.object
part.name='Window/frame'
material=bpy.data.materials.new('Oak'); material.use_nodes=True
part.data.materials.append(material)
group=bpy.data.node_groups.new('Editable grain','ShaderNodeTree')
node=material.node_tree.nodes.new('ShaderNodeGroup');node.node_tree=group

bevel=part.modifiers.new('Editable bevel','BEVEL');bevel.width=.05;bevel.segments=2
root=create_component('Window',[part],origin=(5,0,0))
assert (part.matrix_world.translation-Vector((5,0,1))).length<1e-6
copy=duplicate_component(root,'Repeated window',location=(8,0,0))
variant=duplicate_component(root,'Tall window',location=(11,0,0),variant=True)
assert copy.children[0].data==part.data
assert variant.children[0].data!=part.data
assert variant.children[0].data.materials[0]!=material
variant_group=next(n.node_tree for n in variant.children[0].data.materials[0].node_tree.nodes if n.type=='GROUP')
assert variant_group!=group
variant_group.nodes.new('ShaderNodeTexNoise')
assert len(group.nodes)==0

original_x=part.data.vertices[0].co.x
variant.children[0].data.vertices[0].co.x+=1
assert part.data.vertices[0].co.x==original_x
bpy.ops.mesh.primitive_cube_add(location=(100,100,100))
private=bpy.context.object;private.name='PRIVATE other scene object'
bpy.data.texts.new('PRIVATE customer brief').write('Do not include in component source')
original_names=set(o.name for o in bpy.data.objects)
original_matrix=root.matrix_world.copy()
output=Path(tempfile.mkdtemp(prefix='agartha-components-'))
private_collection=bpy.data.collections.new('Private collection')
instance=bpy.data.objects.new('Unexpected instance',None);bpy.context.scene.collection.objects.link(instance)
instance.parent=root;instance.instance_type='COLLECTION';instance.instance_collection=private_collection
try: export_component(root,output)
except ValueError: pass
else: raise AssertionError('Private collection dependency accepted')
bpy.data.objects.remove(instance,do_unlink=True)
root['private_pointer']=private
try: export_component(root,output)
except ValueError: pass
else: raise AssertionError('Private ID custom property accepted')
del root['private_pointer']
assembly=bpy.data.objects.new('Outer assembly',None);bpy.context.scene.collection.objects.link(assembly)
assembly.location=(10,0,0);bpy.context.view_layer.update()
world=root.matrix_world.copy();root.parent=assembly;root.matrix_world=world;bpy.context.view_layer.update()
nested=duplicate_component(root,'Nested duplicate')
assert (nested.matrix_world.translation-root.matrix_world.translation).length<1e-6
bpy.data.objects.remove(nested.children[0],do_unlink=True);bpy.data.objects.remove(nested,do_unlink=True)
files=export_component(root,output)
world=root.matrix_world.copy();root.parent=None;root.matrix_world=world
bpy.data.objects.remove(assembly,do_unlink=True)

assert set(o.name for o in bpy.data.objects)==original_names
assert root.matrix_world==original_matrix
assert part.modifiers.get('Editable bevel') is not None
loaded=import_component(files['glb'],'Imported window',bundle_id='bundle-'+'a'*64,location=(20,0,0))
assert len(loaded.children)==1
assert loaded.children and loaded.get('agarthaParentBundleId')=='bundle-'+'a'*64
assert max(abs(o.matrix_world.translation.x-20) for o in loaded.children)<2
assert len(assembly_manifest()['components'])==4
first='bundle-'+'a'*64
next_id='bundle-'+'c'*64
assert component_sources(loaded)==[first]
mark_published_component(loaded,next_id)
derived=duplicate_component(loaded,'Derived source',variant=True)
assert component_sources(derived)==[next_id]
# A newly incorporated source must remain visible even on a published root.
copy.parent=derived
copy['agarthaParentBundleId']=first
assert component_sources(derived)==[first,next_id]
copy.parent=None

# Imported names must not claim the requested root name.
import struct
raw=Path(files['glb']).read_bytes();json_size=struct.unpack_from('<I',raw,12)[0]
incoming=json.loads(raw[20:20+json_size])
root_name=next(node['name'] for node in incoming['nodes'] if 'mesh' in node)
if bpy.data.objects.get(root_name): bpy.data.objects[root_name].name='Preexisting renamed fixture'
collision=import_component(files['glb'],root_name,bundle_id='bundle-'+'b'*64)
assert collision.name==root_name and len(collision.children)==1

# External provenance survives reuse and an independently reopened editable source.
external=import_polyhaven(files['glb'],'Poly Haven fixture',asset_id='test_fixture',attribution='Powered by Poly Haven; Fixture artist')
external_source=json.loads(external['agarthaExternalSource'])
import hashlib
assert external_source['modelId']=='model-'+hashlib.sha256(Path(files['glb']).read_bytes()).hexdigest()
assert external_source['attribution']=='Powered by Poly Haven; Fixture artist'
external_copy=duplicate_component(external,'External duplicate')
assert external_copy['agarthaExternalSource']==external['agarthaExternalSource']
assert next(row for row in assembly_manifest()['components'] if row['name']==external.name)['externalSource']==external_source
external_files=export_component(external,output/'external')

# Failed imports cannot remove existing scene geometry.
bad=output/'bad.glb';bad.write_bytes(b'glTF-invalid')
try: import_component(str(bad),'Bad',bundle_id='bundle-'+'a'*64)
except ValueError: pass
else: raise AssertionError('Invalid GLB accepted')
assert private.name in bpy.data.objects
bpy.ops.wm.open_mainfile(filepath=files['source'],load_ui=False,use_scripts=False)
assert not any('PRIVATE' in o.name for o in bpy.data.objects)
assert not any('PRIVATE' in t.name for t in bpy.data.texts)
assert len([o for o in bpy.context.scene.objects if o.type=='MESH'])==1
assert any(o.modifiers.get('Editable bevel') for o in bpy.context.scene.objects)
print('COMPONENT_CHECK_PASSED',json.dumps(files))

bpy.ops.wm.open_mainfile(filepath=external_files['source'],load_ui=False,use_scripts=False)
assert any(json.loads(obj.get('agarthaExternalSource','null'))==external_source for obj in bpy.context.scene.objects)
assert json.loads(bpy.context.scene['agarthaComponent'])['externalSource']==external_source
print('POLYHAVEN_COMPONENT_PROVENANCE_OK')
