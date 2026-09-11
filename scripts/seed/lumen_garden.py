"""Original reference-led Lumen Garden Station. Run in Blender background.
Reference: .agartha/lumen-garden/concept-reference.png (generated original concept).
All coordinates Y-up; deterministic foliage; shared CC0 material catalog.
"""
import bpy, math, random, json, os, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT))
exec((ROOT/'scripts/seed/starter_kit.py').read_text())
from cloud.blender_mcp import material_library as ml
os.environ['AGARTHA_MATERIAL_ROOT']=str(ROOT/'apps/web/public')
OUT=ROOT/'.agartha/lumen-garden'; OUT.mkdir(parents=True,exist_ok=True)
random.seed(127)
reset_scene('Lumen Garden Station')
stone=ml.material('pbr-plaster',finish_id='honed-limestone')
wet=stone.copy();wet.name='Rain polished limestone';wbs=wet.node_tree.nodes.get('Principled BSDF');
for link in list(wet.node_tree.links):
    if link.to_socket==wbs.inputs['Roughness']:wet.node_tree.links.remove(link)
wbs.inputs['Roughness'].default_value=.23
clay=ml.material('pbr-clay'); bronze=ml.material('pbr-brass'); wood=ml.material('pbr-dark-wood')
cream=material('Ivory enamel','#e9ddbc',.3)
soil=material('Rich planting soil','#282719',.94)
leaves=[material('Laurel '+str(i),c,.64) for i,c in enumerate(['#294c29','#456536','#668349'])]
water=material('Teal reflecting water','#216d68',.12,.45)
glass=material('Warm smoked glazing','#34453d',.16,.55)
glow=material('Lantern diffuser','#ffdd91',.25)
bs=glow.node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Color'].default_value=(1,.65,.22,1);bs.inputs['Emission Strength'].default_value=2
for im in bpy.data.images:
    if im.size[0]>512: im.scale(512,512); im.pack()
# Physical world projections create repeatable PBR detail on every exported mesh.
def uv(obj):
    if obj.type!='MESH':return obj
    layer=obj.data.uv_layers.active or obj.data.uv_layers.new(name='UVMap')
    for poly in obj.data.polygons:
        axis=max(range(3),key=lambda k:abs(poly.normal[k]));axes=[i for i in range(3) if i!=axis]
        for li in poly.loop_indices:
            p=obj.matrix_world@obj.data.vertices[obj.data.loops[li].vertex_index].co
            layer.data[li].uv=(p[axes[0]]/2,p[axes[1]]/2)
    return obj
parts={}
def part(name):
    c=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(c);parts[name]=c
    bpy.context.view_layer.active_layer_collection=bpy.context.view_layer.layer_collection.children[name]
def box(n,p,s,m=stone,b=.03):return uv(cube(n,p,s,m,b))
def ring(n,r,y,th,m=bronze,cx=0,cz=0):return curve(n,[(cx+r*math.cos(a*math.tau/96),y,cz+r*math.sin(a*math.tau/96)) for a in range(97)],th,m)
def arch(n,x,y,z,w=2,h=3,d=.4):
    # Individual voussoirs preserve the legible arched masonry silhouette.
    r=w/2; spring=y+h-r
    for sx in [-1,1]:box(n+' pier',(x+sx*(r+.12),y+(h-r)/2,z),(.24,h-r,d))
    for i in range(16):
        a=i*math.pi/16;b=(i+1)*math.pi/16
        verts=[(x+rr*math.cos(t),spring+rr*math.sin(t),z+dz) for dz in [-d/2,d/2] for rr,t in [(r,a),(r,b),(r+.24,b),(r+.24,a)]]
        uv(mesh(n+' arch stone',verts,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],stone))
def lamp(x,z,y=.3):
    box('Lamp plinth',(x,y+.12,z),(.4,.24,.4));beam('Bronze lamp stem',(x,y+.2,z),(x,y+2,z),.09,bronze)
    box('Light diffuser',(x,y+2.06,z),(.27,.44,.27),glow,.02)
    for dx in [-.18,.18]:
        for dz in [-.18,.18]:beam('Lantern frame',(x+dx,y+1.8,z+dz),(x+dx,y+2.33,z+dz),.035,bronze)
    box('Lantern cap',(x,y+2.34,z),(.45,.09,.45),bronze)
def plant(x,z,y=.7,r=1,h=2,tree=False):
    if tree:
        beam('Branching trunk',(x,y,z),(x+.15,y+h*.7,z),.15,wood)
        for a in range(5):
            t=a*math.tau/5;beam('Crown branches',(x,y+h*.35,z),(x+r*.65*math.cos(t),y+h*.8,z+r*.65*math.sin(t)),.065,wood)
    vs=[[],[],[]];fs=[[],[],[]]
    for i in range(600 if tree else 110):
        a=random.random()*math.tau; rr=r*math.sqrt(random.random()); yy=random.random()
        p=Vector((x+rr*math.cos(a),y+h*(.5+.5*yy) if tree else y+h*yy,z+rr*math.sin(a)))
        ang=random.random()*math.tau; length=random.uniform(.16,.34); width=length*.42
        along=Vector((math.cos(ang)*length,random.uniform(-.1,.18),math.sin(ang)*length));across=Vector((-math.sin(ang)*width,.055,math.cos(ang)*width))
        k=i%3;v=vs[k];f=fs[k];o=len(v)
        v.extend([tuple(p-along),tuple(p+across),tuple(p+Vector((0,.07,0))),tuple(p-across),tuple(p+along)])
        f.extend([(o,o+1,o+2),(o,o+2,o+3),(o+1,o+4,o+2),(o+2,o+4,o+3)])
    for k in range(3):mesh('Glossy laurel leaves',vs[k],fs[k],leaves[k])
def planter(x,z,sx=3,sz=1.8,tree=False):
    box('Substantial stone planter',(x,.68,z),(sx,.76,sz))
    box('Planter soil',(x,1.08,z),(sx-.22,.05,sz-.22),soil,0)
    for dx in [-sx/2,sx/2]:box('Planter coping',(x+dx,1.12,z),(.16,.16,sz+.15))
    for dz in [-sz/2,sz/2]:box('Planter coping',(x,1.12,z+dz),(sx+.15,.16,.16))
    plant(x,z,1.12,min(sx,sz)*.82 if tree else min(sx,sz)*.52,4.6 if tree else .8,tree)
    if tree:
        for dx in [-sx*.27,sx*.27]:plant(x+dx,z,1.12,.55,.65)
def bench(x,z):
    for dx in [-.85,.85]:box('Bench supports',(x+dx,.5,z),(.18,.5,.62),bronze)
    for i in range(5):box('Bench seat slats',(x,.79,z-.27+i*.135),(2.2,.09,.1),wood,.015)
    for i in range(3):box('Bench back slats',(x,1.08+i*.14,z+.32),(2.2,.1,.08),wood,.015)
def parasol(x,z,y=4.1):
    beam('Parasol mast',(x,y,z),(x,y+2.3,z),.065,bronze)
    verts=[(x,y+2.45,z)]+[(x+1.3*math.cos(i*math.tau/12),y+1.95,z+1.3*math.sin(i*math.tau/12)) for i in range(12)]
    mesh('Canvas parasol',verts,[(0,i+1,(i+1)%12+1) for i in range(12)],cream)
    cylinder('Cafe table',(x,y+.8,z),.55,.09,wood,24)
    for a in range(3):
        t=a*math.tau/3;box('Cafe stool',(x+.85*math.cos(t),y+.45,z+.85*math.sin(t)),(.4,.12,.4),wood)
def text(n,string,loc,size=.32):
    data=bpy.data.curves.new(n,'FONT');data.body=string;data.align_x='CENTER';data.size=size;data.extrude=.003
    o=bpy.data.objects.new(n,data);bpy.context.collection.objects.link(o);o.location=_v(loc);o.rotation_euler=(math.pi/2,0,0);data.materials.append(bronze)

part('floor')
box('Courtyard foundation',(0,.09,0),(31.5,.18,31.5),stone,0)
for ix in range(24):
    for iz in range(24):
        x=-15.1+ix*1.313;z=-15.1+iz*1.313
        box('Wet limestone and terracotta pavers',(x,.205,z),(1.29,.05,1.29),clay if (ix+iz*3)%11==0 else wet,0)
part('center')
for r in [7.72,8.28]:ring('Inlaid bronze transit rail',r,.265,.033)
cylinder('Basin limestone podium',(0,.42,0),3.85,.4,stone,96)
cylinder('Basin dark inner bowl',(0,.65,0),3.55,.1,water,96)
ring('Basin rolled rim',3.75,.65,.16,stone)

for a in range(3):
    angle=a*math.tau/3
    curve('Orbital bronze flying arch',[(3.05*math.cos(t)*math.cos(angle),.7+5.5*math.sin(t),3.05*math.cos(t)*math.sin(angle)) for t in [i*math.pi/48 for i in range(49)]],.075,bronze)
beam('Orbital lantern stem',(0,.72,0),(0,3.2,0),.12,bronze)
sphere('Luminous heart',(0,3.65,0),(.67,.67,.67),glow,32,16)
part('orbital-rings')
for angle in [0,.8,1.6]:
    curve('Lantern armillary rings',[(1.07*math.cos(t)*math.cos(angle),3.65+1.07*math.sin(t),1.07*math.cos(t)*math.sin(angle)) for t in [i*math.tau/64 for i in range(65)]],.035,bronze)
bpy.context.view_layer.active_layer_collection=bpy.context.view_layer.layer_collection.children['center']
for x,z in [(-4.8,-1.5),(4.8,1.5)]:planter(x,z,1.5,2.4)
# Northwest pavilion occupies only its corner; other corners keep gateway bounds clear.
part('northwest')
box('Cafe raised terrace',(-10,.28,-10),(9,.1,8))
for x in [-13.4,-10.6,-7.8]:
    arch('Ground arcade',x,.28,-6.1,2.35,3.7,.55)
    box('Cafe glazing',(x,1.9,-6.42),(2.28,3.15,.06),glass,0)
    for dx in [-.72,0,.72]:box('Bronze window mullion',(x+dx,1.8,-6.35),(.04,3,.08),bronze,0)
for x in [-14.35,-5.65]:box('Pavilion side piers',(x,2,-10),(.35,3.6,.5))
box('Cafe interior rear wall',(-10,2,-13.8),(9,3.6,.4))
box('Cafe side wall',(-14.35,2,-10),(.4,3.6,8))
box('Upper terrace floor',(-10,4.05,-10),(9.3,.35,8.3))
box('Upper room rear',(-11,5.5,-13.65),(7,2.7,.35))
for x in [-13,-10.5]:arch('Upper salon arch',x,4.25,-11,2.1,2.55,.3)
box('Salon roof',(-11.5,7,-12.25),(6.1,.2,3.5))
for x in [-14.4,-5.6]:box('Balustrade coping',(x,5,-8.9),(.12,.1,6),bronze)
for x in [ -14.3+i*.35 for i in range(26)]:beam('Bronze balcony baluster',(x,4.25,-5.95),(x,5.1,-5.95),.035,bronze)
box('Balcony handrail',(-10,5.13,-5.95),(9,.07,.1),bronze)
for i in range(20):box('Broad accessible stair',(-5.75,.29+i*.19,-12.9+i*.34),(1.75,.2,.35))
for dx in [-.82,.82]:beam('Stair continuous rail',(-5.75+dx,1.2,-12.9),(-5.75+dx,4.85,-6.44),.045,bronze)
for x,z in [(-12.6,-8),(-9.4,-8)]:parasol(x,z,4.23)
for x in [-13.3,-10,-6.7]:
    box('Balcony planted trough',(x,4.42,-6.25),(1.8,.35,.55))
    plant(x,-6.25,4.6,.62,.55)
text('Cafe identity','L U M E N  C A F E',(-10,3.65,-5.79),.34)
for x,z in [(-13,-14.6),(-7.6,-14.6)]:planter(x,z,2.3,1.15)
for x,z in [(-14,-4.5),(-4.5,-14)]:lamp(x,z)
# Other garden rooms use substantial planting and layered trees.
for name,sx,sz in [('northeast',1,-1),('southwest',-1,1),('southeast',1,1)]:
    part(name)
    for x,z in [(12.5,11.6),(7,13.6),(13.4,5.7)]:planter(sx*x,sz*z,3.3,2.2,True)
    for x,z in [(10.2,14.4),(14.1,9),(5.5,12)]:planter(sx*x,sz*z,2.1,1.35)
    for x,z in [(9.3,11),(12,4.2)]:bench(sx*x,sz*z)
    for x,z in [(4,14.5),(14.5,3.7),(11,10)]:lamp(sx*x,sz*z)
    # Boundary walls remain in corner quadrants, gateways are untouched.
    box('Garden boundary',(sx*9.5,1.1,sz*15.35),(11.5,1.6,.3))
    box('Garden boundary',(sx*15.35,1.1,sz*9.5),(.3,1.6,11.5))
    for x,z in [(5,15.3),(15.3,5)]:
        box('Entry pillar',(sx*x,2.2,sz*z),(.65,3.9,.65));box('Pillar bronze capital',(sx*x,4.2,sz*z),(.8,.13,.8),bronze)
part('pod')
box('Transit pod cream body',(0, .77,0),(1.65,1.25,3),cream,.25)
box('Continuous smoked window band',(0,1.18,0),(1.69,.68,2.55),glass,.2)
box('Pod floating roof',(0,1.65,0),(1.78,.15,2.85),cream,.18)
for x in [-.85,.85]:
    for z in [-.92,-.3,.3,.92]:box('Pod bronze window pillars',(x,1.19,z),(.045,.75,.05),bronze,.01)
    box('Pod sill trim',(x,.77,0),(.06,.08,2.7),bronze)
for z in [-1.47,1.47]:
    box('Destination panel',(0,1.25,z),(.72,.18,.035),bronze)
    for x in [-.55,.55]:box('Pod headlight',(x,.59,z),(.24,.1,.05),glow)
# Third art-direction pass: inhabited cafe, ornament, seating and human scale.
bpy.context.view_layer.active_layer_collection=bpy.context.view_layer.layer_collection.children['northwest']
box('Cafe service counter',(-10,1.0,-7.3),(6.1,1.35,.65),wood)
box('Counter limestone top',(-10,1.72,-7.3),(6.3,.13,.8))
for x in [-12,-10,-8]:
    cylinder('Coffee cup',(x,1.85,-7.25),.09,.16,cream,12)
    cylinder('Cafe pendant shade',(x,3.15,-7.1),.25,.16,bronze,16)
    sphere('Pendant warm bulb',(x,3,-7.1),(.1,.1,.1),glow,12,6)
for y in [1.2,2.1,2.9]:
    box('Rear display shelf',(-10,y,-13.3),(7,.09,.3),wood)
    for x in [-12.5,-11.5,-10.5,-9.5,-8.5]:cylinder('Ceramic display vessel',(x,y+.18,-13.3),.12,.28,cream,12)
for x in [-13,-10.5]:
    box('Upper cafe glazed doors',(x,5.25,-11.16),(1.95,1.95,.045),glass,0)
    for dx in [-.58,0,.58]:box('Upper glazing mullions',(x+dx,5.2,-11.1),(.035,1.9,.06),bronze,0)
    box('Upper canvas awning',(x,6.65,-10.55),(2.2,.075,1.2),cream)
for z in [-13.6,-11.7]:plant(-14.1,z,6.7,.55,.55)
for y in [.45,3.85,4.2]:box('Pavilion horizontal stone trim',(-10,y,-6.04),(9.3,.13,.17),cream,.01)
for x in [-13.9,-6.1]:
    box('Pavilion teal fabric banner',(x,2.5,-5.9),(.35,1.2,.05),water,0)
    beam('Banner bronze rod',(x-.25,3.2,-5.9),(x+.25,3.2,-5.9),.035,bronze)
bpy.context.view_layer.active_layer_collection=bpy.context.view_layer.layer_collection.children['northeast']
parasol(8.6,-10.1,.3)
for x,z in [(6.4,-9.5),(10.3,-8.8)]:bench(x,z)
for name,sx,sz in [('northeast',1,-1),('southwest',-1,1),('southeast',1,1)]:
    bpy.context.view_layer.active_layer_collection=bpy.context.view_layer.layer_collection.children[name]
    for x,z in [(5,15.3),(15.3,5)]:
        box('Gateway teal textile',(sx*x,2.65,sz*z-.36),(.38,1.5,.04),water,0)
    for z in [5,8,11,14]:box('Garden wall cap',(sx*15.35,1.94,sz*z),(.43,.09,2.95),cream,.01)
bpy.context.view_layer.active_layer_collection=bpy.context.view_layer.layer_collection.children['center']
for x,z in [(-1.6,-4.7),(1.6,4.7)]:planter(x,z,2.5,1.25)
flower=material('Small golden flowers','#d8b657',.6)
for x,z in [(-4.8,-1.5),(4.8,1.5),(-1.6,-4.7),(1.6,4.7)]:
    for i in range(22):
        dx=random.uniform(-.5,.5);dz=random.uniform(-.4,.4)
        sphere('Gold garden flowers',(x+dx,1.8+random.uniform(-.1,.2),z+dz),(.055,.05,.055),flower,8,4)
# Small tailored figures use tapered bodies and posed limbs, never boxes.
coat=material('Visitor slate coat','#485568',.9);trousers=material('Visitor trousers','#343a3d',.9);skin=material('Warm skin','#bd9272',.85)
def person(x,z,y=.3,turn=0):
    sphere('Tailored jacket',(x,y+1.13,z),(.22,.37,.14),coat,12,8)
    sphere('Visitor head',(x,y+1.65,z),(.115,.15,.115),skin,12,8)
    for side in [-1,1]:
        beam('Walking trouser leg',(x+side*.1,y+.87,z),(x+side*.12,y+.15,z+side*.12),.13,trousers)
        sphere('Visitor shoe',(x+side*.12,y+.07,z+side*.12+.035),(.09,.08,.17),trousers,10,6)
        beam('Jacket sleeve',(x+side*.19,y+1.35,z),(x+side*.29,y+.95,z-side*.1),.105,coat)
        sphere('Visitor hand',(x+side*.29,y+.91,z-side*.1),(.055,.07,.055),skin,8,5)
person(2.8,5.8);person(-5.8,-3.3);person(5.5,-3.5)
bpy.context.view_layer.active_layer_collection=bpy.context.view_layer.layer_collection.children['northwest']
person(-11.5,-8,4.23)
# Pod shown on track in source; export placement uses these actual bounds.
for o in list(parts['pod'].objects):o.location+=_v((0,.28,8))
bpy.context.view_layer.update()
# Set back the ground arcade to clear the full pod envelope on its track.
for o in bpy.data.collections['northwest'].objects:
 if o.name.startswith(('Ground arcade','Cafe glazing','Bronze window mullion','Cafe raised terrace','Pavilion teal fabric banner','Banner bronze rod')) or (o.name.startswith('Pavilion horizontal stone trim') and o.location.z<1):o.location.y+=1.2
 if o.name.startswith(('Cafe service counter','Counter limestone top','Coffee cup','Cafe pendant shade','Pendant warm bulb')):o.location.y+=.9
bpy.context.view_layer.update()
# Warm photographic overview retained in editable source.
scene=bpy.context.scene
world=bpy.data.worlds.new('Cool daylight');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.35,.45,.6,1);world.node_tree.nodes['Background'].inputs[1].default_value=.35;scene.world=world
ld=bpy.data.lights.new('Late afternoon sun','SUN');lo=bpy.data.objects.new('Late afternoon sun',ld);scene.collection.objects.link(lo);ld.energy=3.8;ld.color=(1,.72,.4);lo.rotation_euler=(.5,-.65,-.5)
cd=bpy.data.cameras.new('Source overview');co=bpy.data.objects.new('Source overview',cd);scene.collection.objects.link(co);co.location=_v((35,32,39));co.rotation_euler=(_v((0,1.5,0))-co.location).to_track_quat('-Z','Y').to_euler();cd.type='ORTHO';cd.ortho_scale=46;scene.camera=co
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.resolution_x=1100;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(OUT/'preview.png');bpy.ops.render.render(write_still=True)
co.location=_v((0,50,.001));co.rotation_euler=(_v((0,0,0))-co.location).to_track_quat('-Z','Y').to_euler();cd.ortho_scale=35;scene.render.filepath=str(OUT/'top.png');scene.render.resolution_x=1000;scene.render.resolution_y=1000;bpy.ops.render.render(write_still=True)
co.location=_v((35,32,39));co.rotation_euler=(_v((0,1.5,0))-co.location).to_track_quat('-Z','Y').to_euler();cd.ortho_scale=46
for block in list(bpy.data.meshes):
    if block.users==0:bpy.data.meshes.remove(block)
for image in list(bpy.data.images):
    if image.users==0:bpy.data.images.remove(image)
source=save_source(str(OUT/'model.blend'))
# Exact-fit scene extras preserve seams while legacy assets retain their fitting margin.
def exact_fit(meta):
    import struct
    path=Path(meta['path']);data=path.read_bytes();length=struct.unpack_from('<I',data,12)[0]
    document=json.loads(data[20:20+length]);document['scenes'][document.get('scene',0)].setdefault('extras',{})['agarthaExactBounds']=True
    encoded=json.dumps(document,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
    chunks=struct.pack('<I4s',len(encoded),b'JSON')+encoded+data[20+length:]
    path.write_bytes(struct.pack('<4sII',b'glTF',2,12+len(chunks))+chunks);meta['bytes']=path.stat().st_size
    return meta
scene_export=exact_fit(export_runtime(str(OUT/'scene.glb')))
manifest={'scene':scene_export,'reference':'concept-reference.png','source':source,'components':[]}
for name,col in parts.items():
    meta=exact_fit(export_runtime(str(OUT/(name+'.glb')),collection=col))
    meta['name']=name;meta['position']=[(a+b)/2 for a,b in zip(meta['bounds']['min'],meta['bounds']['max'])];meta['scale']=[b-a for a,b in zip(meta['bounds']['min'],meta['bounds']['max'])]
    manifest['components'].append(meta)
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
print('LUMEN COMPLETE',json.dumps({k:sum(c[k] for c in manifest['components']) for k in ['bytes','triangles','drawGroups']}))
