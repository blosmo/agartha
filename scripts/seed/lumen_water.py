"""Subtle native glTF morph-wave surface for Lumen Garden Station."""
import bpy,math,json,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'.agartha/lumen-garden'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
# A radial disk retains the circular basin edge and smooth analytic normals.
segments=96;rings=16
vertices=[(0,0,0)]
for j in range(1,rings+1):
 r=3.5*j/rings
 for i in range(segments):
  a=i*math.tau/segments;vertices.append((r*math.cos(a),r*math.sin(a),0))
faces=[(0,1+i,1+(i+1)%segments) for i in range(segments)]
for j in range(rings-1):
 a=1+j*segments;b=a+segments
 for i in range(segments):
  n=(i+1)%segments;faces.extend([(a+i,b+i,b+n),(a+i,b+n,a+n)])
data=bpy.data.meshes.new('Circular water surface');data.from_pydata(vertices,[],faces);data.update()
o=bpy.data.objects.new('WaterCurrent',data);bpy.context.collection.objects.link(o)
for p in data.polygons:p.use_smooth=True
m=bpy.data.materials.new('Teal reflecting water');m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF')
rgb=[int('246a66'[i:i+2],16)/255 for i in (0,2,4)];rgb=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
b.inputs['Base Color'].default_value=(*rgb,1);b.inputs['Roughness'].default_value=.12;b.inputs['Metallic'].default_value=.25;b.inputs['Coat Weight'].default_value=.4;b.inputs['Coat Roughness'].default_value=.12;o.data.materials.append(m)
o.shape_key_add(name='Basis')
for k,label in enumerate(['Current east','Current northwest']):
 key=o.shape_key_add(name=label)
 for v in key.data:
  x,y,z=v.co;r=math.sqrt(x*x+y*y);fade=max(0,1-(r/3.5)**4)
  v.co.z=.022*fade*(math.sin(x*2.7+y*1.2+k*1.7)+.38*math.cos(y*4-x*.8+k))
 for frame,value in [(1,0),(46,1 if k==0 else 0),(91,0),(136,1 if k==1 else 0),(181,0)]:
  key.value=value;key.keyframe_insert('value',frame=frame)
o.data.shape_keys.animation_data.action.name='WaterCurrent'
scene=bpy.context.scene;scene.frame_start=1;scene.frame_end=181;scene.render.fps=30;scene.frame_set(1)
bpy.context.view_layer.objects.active=o;o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'water-model.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_morph=True,export_morph_normal=True,export_force_sampling=True,export_frame_range=True,export_animation_mode='ACTIONS',export_cameras=False,export_lights=False)
# The source keeps a close review camera and simple reflected lights.
world=bpy.data.worlds.new('Water studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[1].default_value=.4;scene.world=world
for loc,energy,size in [((1,-2,6),900,4),((-3,1,4),500,2)]:
 d=bpy.data.lights.new('Reflection strip','AREA');l=bpy.data.objects.new('Reflection strip',d);scene.collection.objects.link(l);l.location=loc;d.energy=energy;d.shape='RECTANGLE';d.size=size;d.size_y=.6
c=bpy.data.cameras.new('Water review');co=bpy.data.objects.new('Water review',c);scene.collection.objects.link(co);co.location=(7,-8,9);from mathutils import Vector
co.rotation_euler=(Vector((0,0,0))-co.location).to_track_quat('-Z','Y').to_euler();c.type='ORTHO';c.ortho_scale=9;scene.camera=co
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.render.threads_mode='FIXED';scene.render.threads=4;scene.render.resolution_x=768;scene.render.resolution_y=768;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.filepath=str(OUT/'water-preview.png');scene.frame_set(46);bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'water-source.blend'),compress=False)
raw=(OUT/'water-model.glb').read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);animations=doc.get('animations',[])
manifest={'model':'water-model.glb','source':'water-source.blend','preview':'water-preview.png','modelBytes':len(raw),'sourceBytes':(OUT/'water-source.blend').stat().st_size,'triangles':len(faces),'drawGroups':1,'animations':[a.get('name') for a in animations],'animationChannels':[c['target']['path'] for a in animations for c in a['channels']],'morphTargets':len(doc['meshes'][0]['primitives'][0].get('targets',[])),'position':[0,.76,0],'scale':[7,.1,7],'durationSeconds':6}
assert manifest['morphTargets']==2 and 'weights' in manifest['animationChannels']
(OUT/'water-manifest.json').write_text(json.dumps(manifest,indent=2));print(json.dumps(manifest))
