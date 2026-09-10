"""Original local showcase models, composed with the production Blender component helpers.

Blender 4.5: --background --factory-startup --python this_file -- OUTPUT [MODEL] [draft|final]
Coordinates are Blender Z-up. No remote inference or asset-generation service is used.
"""
from pathlib import Path
import bpy
import hashlib
import json
import math
import random
import sys
import time
import zipfile
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT))
from cloud.blender_mcp.components import create_component,duplicate_component,export_component,assembly_manifest
from cloud.blender_mcp.material_authoring import bake_material
from cloud.blender_mcp.material_mapping import assign_material
from cloud.blender_mcp.material_recipes import weathered_boards,cut_limestone
from scripts.seed import starter_kit as kit
ARGS=sys.argv[sys.argv.index('--')+1:]
OUT=Path(ARGS[0]).resolve()
ONLY=ARGS[1] if len(ARGS)>1 else 'all'
QUALITY=ARGS[2] if len(ARGS)>2 else 'draft'
TAU=math.tau
PARTS=[]


def color(hex):
    values=[int(hex.lstrip('#')[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in values)


def material(name,hex,rough=.5,metal=0,alpha=1,emission=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    rgb=color(hex);m.diffuse_color=(*rgb,alpha)
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,alpha)
    p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    p.inputs['Alpha'].default_value=alpha
    if alpha<1:m.surface_render_method='DITHERED'
    if emission:p.inputs['Emission Color'].default_value=(*rgb,1);p.inputs['Emission Strength'].default_value=emission
    return m


def finish(obj,name,mat,bevel=0,smooth=False):
    obj.name=name
    if mat:obj.data.materials.append(mat)
    if bevel:
        m=obj.modifiers.new('Crafted edges','BEVEL');m.width=bevel;m.segments=2
        m.affect='EDGES'
        m=obj.modifiers.new('Weighted highlights','WEIGHTED_NORMAL');m.keep_sharp=True
    if smooth:
        for p in obj.data.polygons:p.use_smooth=True
    return obj


def box(name,p,size,mat,bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,mat,bevel)


def cyl(name,p,r,depth,mat,vertices=48,axis=(0,0,1),bevel=0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=p)
    o=bpy.context.object;o.rotation_euler=Vector(axis).to_track_quat('Z','Y').to_euler()
    return finish(o,name,mat,bevel,True)


def sphere(name,p,r,mat,scale=None,segments=24,rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=r,location=p)
    o=bpy.context.object
    if scale:o.scale=scale
    return finish(o,name,mat,0,True)


def beam(name,a,b,width,mat,depth=None,bevel=.01):
    a,b=Vector(a),Vector(b);o=box(name,(a+b)/2,(width,depth or width,(b-a).length),mat,bevel)
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o


def tube(name,points,r,mat,closed=False):
    if len(points)==3:
        a,m,b=map(Vector,points);control=2*m-(a+b)/2
        points=[(1-t)**2*a+2*(1-t)*t*control+t*t*b for t in [i/16 for i in range(17)]]
    data=bpy.data.curves.new(name,'CURVE');data.dimensions='3D';data.resolution_u=1
    data.bevel_depth=r;data.bevel_resolution=2
    spline=data.splines.new('POLY');spline.points.add(len(points)-1)
    for v,p in zip(spline.points,points):v.co=(*p,1)
    spline.use_cyclic_u=closed
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.data.materials.append(mat)
    bpy.context.view_layer.objects.active=o;o.select_set(True)
    bpy.ops.object.convert(target='MESH');o=bpy.context.object;o.select_set(False)
    return o


def ring(name,center,r,mat,thickness=.035,plane='xy',segments=96):
    c=Vector(center)
    points=[]
    for i in range(segments):
        a=i*TAU/segments
        v=(r*math.cos(a),r*math.sin(a),0) if plane=='xy' else (r*math.cos(a),0,r*math.sin(a)) if plane=='xz' else (0,r*math.cos(a),r*math.sin(a))
        points.append(c+Vector(v))
    return tube(name,points,thickness,mat,True)


def mesh(name,vertices,faces,mat):
    data=bpy.data.meshes.new(name);data.from_pydata(vertices,[],faces);data.materials.append(mat)
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);return o


def leaf(name,a,b,width,mat):
    a,b=Vector(a),Vector(b);d=b-a
    side=d.cross(Vector((0,0,1)))
    if side.length<.01:side=Vector((1,0,0))
    side.normalize();mid=a+d*.5
    vertices=[a,a+d*.25+side*width*.65,a+d*.60+side*width,b,a+d*.60-side*width,a+d*.25-side*width,mid+Vector((0,0,width*.12))]
    obj=mesh(name,vertices,[(i,(i+1)%6,6) for i in range(6)],mat)
    for face in obj.data.polygons:face.use_smooth=True
    return obj


def part(name,maker):
    before=set(bpy.data.objects);maker()
    objects=[o for o in bpy.data.objects if o not in before and o.type=='MESH']
    for index,obj in enumerate(objects): obj.name=name+'/part-'+str(index)
    root=create_component(name,objects)
    PARTS.append(root)
    return root


def move(root,p,heading=0,scale=1):
    root.location=p;root.rotation_euler.z=heading;root.scale=(scale,)*3;bpy.context.view_layer.update();return root


def repeat(root,name,p,heading=0,scale=1,variant=False):
    return duplicate_component(root,name,location=p,rotation=(0,0,heading),scale=(scale,)*3,variant=variant)


def setup(name):
    global PARTS
    PARTS=[];random.seed(141)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene;scene.name=name
    col=bpy.data.collections.new('AGARTHA_MODEL');scene.collection.children.link(col)
    bpy.context.view_layer.active_layer_collection=bpy.context.view_layer.layer_collection.children[col.name]
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.use_denoising=True
    scene.render.threads_mode='FIXED';scene.render.threads=6
    scene.view_settings.view_transform='AgX'
    return scene


def palette():
    p={
      'cream':material('Ivory enamel','#ddd9c6',.32),
      'stone':material('Warm travertine','#b6a68c',.79),
      'darkstone':material('Basalt','#313d3b',.83),
      'brass':material('Satin champagne brass','#bf9554',.27,.82),
      'darkbrass':material('Aged bronze','#5a5541',.42,.72),
      'green':material('Deep botanical green','#264a3b',.5),
      'leaf':material('New growth','#6b9254',.53),
      'lightleaf':material('Leaf highlights','#a8bc65',.51),
      'jade':material('Celadon glaze','#749d8a',.24),
      'terracotta':material('Fired clay','#a66342',.76),
      'wood':material('Smoked walnut','#553c2c',.54),
      'glass':material('Sage glass','#b7d1be',.09,0,.075),
      'water':material('Glazed turquoise water','#387b78',.2,.2),
      'warm':material('Warm paper light','#ffc67a',.52,0,1,1.5),
      'red':material('Vermilion lacquer','#974737',.36),
      'paper':material('Linen paper','#e5cf9e',.65),
    }
    # Use the production authoring/baking path; these are original editable graphs.
    wood_source=weathered_boards('Fine walnut grain')
    for node in wood_source.node_tree.nodes:
        if node.type=='TEX_BRICK':node.inputs['Mortar Size'].default_value=0
        if node.type=='VALTORGB' and len(node.color_ramp.elements)==2 and node.color_ramp.elements[0].color[0]<.2:
            for stop in node.color_ramp.elements:stop.color=tuple(v*.5 for v in stop.color[:3])+(1,)
    p['wood']=bake_material(wood_source,resolution=512,tile_size=2)
    p['stone']=bake_material(cut_limestone('Fine dressed limestone'),resolution=512,tile_size=2)
    for key in ['green','leaf','lightleaf']:
        shader=p[key].node_tree.nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=.83;shader.inputs['Specular IOR Level'].default_value=.15
    return p


def mapped(obj,mat,tile=2):
    assign_material(obj,mat,tile_size=tile,projection='surface');return obj


def pot_plant(p,name='Fern',height=1):
    def build():
        cyl(name+' pot',(0,0,.22),.24,.42,p['terracotta'],32,bevel=.025)
        ring(name+' pot lip',(0,0,.43),.255,p['terracotta'],.045,segments=40)
        cyl(name+' soil',(0,0,.44),.215,.025,p['darkstone'],32)
        for k in range(15):
            a=k*TAU/15+.21;h=height*(.6+.35*random.random());r=.45+.2*random.random()
            end=Vector((math.cos(a)*r,math.sin(a)*r,.44+h))
            stem=[(0,0,.43),tuple(end*.45+Vector((0,0,.38))),tuple(end)]
            tube(name+' stem',stem,.009,p['green'])
            start=Vector((0,0,.45))
            for j in range(3,8):
                f=j/8;c=start.lerp(end,f);c.z+=.13*math.sin(f*math.pi)
                for sign in [-1,1]:
                    direction=Vector((math.cos(a+sign*.9),math.sin(a+sign*.9),.05))
                    leaf(name+' leaflet',c,c+direction*(.25*(1-f)+.12),.11*(1-f)+.055,p['leaf'] if j%2 else p['lightleaf'])
        for k in range(7):
            a=k*TAU/7+.4
            base=Vector((0,0,.46));end=Vector((math.cos(a)*.66,math.sin(a)*.66,.46+height*(.8+.3*random.random())))
            leaf(name+' broad frond',base,end,.16,p['green'] if k%2 else p['leaf'])
    return part(name,build)


def conservatory():
    setup('The Verdant Conservatory');p=palette()
    mapped(box('Garden island',(0,0,.1),(10.4,8.6,.6),p['stone'],.22),p['stone'],2)
    box('Floating brass reveal',(0,0,-.19),(10.08,8.28,.075),p['brass'],.08)
    box('Lower plinth',(0,0,-.34),(10.0,8.2,.22),p['darkstone'],.1)
    box('Garden soil',(0,0,.44),(9.9,8.05,.1),p['green'],.12)
    # Tile promenade around the glasshouse.
    for x in range(-7,8):
        for y in [-5,-4,4,5]:
            box('Terrace paving',(x*.64,y*.63,.54),(.60,.59,.12),p['cream'],.025)
    for x in [-7,-6,6,7]:
        for y in range(-3,4):box('Side paving',(x*.64,y*.63,.54),(.60,.59,.12),p['cream'],.025)
    for i in range(3):mapped(box('Entrance tread',(0,-4.27-i*.24,.42-i*.12),(2.25,.5,.18),p['stone'],.04),p['stone'])
    # A modular narrow Victorian frame with structural mullions and fanlight.
    def window():
        box('Window glass',(0,0,1.4),(1.05,.018,2.35),p['glass'],0)
        for x in [-.57,.57]:beam('Cast iron upright',(x,0,0),(x,0,2.8),.06,p['cream'],bevel=.012)
        for z in [.07,.82,1.66,2.43]:beam('Glazing rail',(-.57,0,z),(.57,0,z),.045,p['cream'])
        beam('Central mullion',(0,0,.03),(0,0,2.5),.035,p['cream'])
        for d in [-1,1]:tube('Fanlight arch',[(d*.54*math.cos(a),0,2.25+.5*math.sin(a)) for a in [i*math.pi/2/20 for i in range(21)]],.021,p['cream'])
        cyl('Brass frame foot',(-.57,0,.08),.08,.16,p['brass'],24)
        cyl('Brass frame foot',(.57,0,.08),.08,.16,p['brass'],24)
    frame=part('Conservatory window module',window)
    move(frame,(-2.28,-2.48,.64))
    n=0
    for y in [-2.48,2.48]:
        for x in [-2.28,-1.14,0,1.14,2.28]:
            if y<0 and abs(x)<.01:continue
            if x==-2.28 and y<0:continue
            n+=1;repeat(frame,'Conservatory window '+str(n),(x,y,.64))
    for x in [-2.85,2.85]:
        for y in [-1.86,-.62,.62,1.86]:
            n+=1;repeat(frame,'End window '+str(n),(x,y,.64),math.pi/2)
    # Door variant has an inviting brass handle and transom.
    door=repeat(frame,'Entrance door',(0,-2.50,.64),variant=True)
    door['agarthaVariantPurpose']='Entrance frame with warmer brass accents'
    for x in [-.32,.32]:cyl('Door pull',(x,-2.57,1.78),.026,.27,p['brass'],24)
    for z in [.69,3.38]:box('Cornice',(0,0,z),(5.88,5.12,.13),p['cream'],.03)
    # Open gable roof: transparent panes with closely spaced ribs.
    for y in [-2.5,-1.875,-1.25,-.625,0,.625,1.25,1.875,2.5]:
        beam('Roof rib left',(-2.9,y,3.42),(0,y,4.98),.052,p['cream'])
        beam('Roof rib right',(0,y,4.98),(2.9,y,3.42),.052,p['cream'])
    for side in [-1,1]:
        for j in range(4):
            f=(j+.5)/4;x=side*2.9*f;z=4.98-1.56*f
            beam('Roof longitudinal', (x,-2.55,z),(x,2.55,z),.032,p['cream'])
        mesh('Roof glass',[(0,-2.5,4.96),(side*2.87,-2.5,3.41),(side*2.87,2.5,3.41),(0,2.5,4.96)],[(0,1,2,3)],p['glass'])
    beam('Roof ridge',(0,-2.74,5),(0,2.74,5),.07,p['brass'])
    for y in [-2.67,-1.9,-1.15,-.38,.38,1.15,1.9,2.67]:
        cyl('Ridge finial',(0,y,5.16),.028,.29,p['brass'],16)
        sphere('Finial pearl',(0,y,5.32),.055,p['brass'],segments=12,rings=6)
    # Raised botanist tables and lush repeated plant variants.
    for x in [-1.65,1.65]:
        mapped(box('Plant bench',(x,0,1.17),(1.05,3.9,.13),p['wood'],.035),p['wood'])
        for y in [-1.65,1.65]:beam('Bench support',(x,y,.66),(x,y,1.1),.095,p['darkbrass'])
    fern=pot_plant(p,'Botanical fern',.8);move(fern,(-1.65,-1.55,1.26))
    for i,(x,y) in enumerate([(x,y) for x in [-1.65,1.65] for y in [-1.5,-.5,.5,1.5]][1:]):
        repeat(fern,'Fern arrangement '+str(i),(x,y,1.26),i*.6,scale=.84+(i%3)*.13)
    palm=pot_plant(p,'Tall fern',1.4);move(palm,(0,1.6,.64),scale=1.35)
    for i,(x,y) in enumerate([(-3.78,-2.7),(3.78,-2.7),(-3.78,2.7),(3.78,2.7)]):repeat(palm,'Terrace plant '+str(i),(x,y,.62),i*.7,scale=.95)
    # Small exterior benches provide human scale.
    def bench_part():
        for y in [-.21,-.07,.07,.21]:mapped(box('Bench slat',(0,y,.48),(1.55,.105,.08),p['wood'],.015),p['wood'])
        for x in [-.59,.59]:
            beam('Bench leg',(x,0,.07),(x,0,.44),.055,p['darkbrass'])
            beam('Bench back support',(x,.21,.05),(x,.30,1),.05,p['darkbrass'])
        for z in [.73,.92]:mapped(box('Back slat',(0,.29,z),(1.55,.085,.115),p['wood'],.018),p['wood'])
    bench=part('Garden bench',bench_part);move(bench,(-3.83,0,.61),-math.pi/2)
    repeat(bench,'Opposite garden bench',(3.83,0,.61),math.pi/2)
    return {'title':'The Verdant Conservatory','camera':(12,-15,11),'target':(0,0,2),'size':14.6,'background':'#e8e7dc','world':.55,'key':'#fff2d8'}


def courtyard():
    setup('The Lantern Courtyard');p=palette()
    box('Dark island',(0,0,.05),(10.4,8.7,.6),p['darkstone'],.3)
    box('Bronze plinth rim',(0,0,.30),(10.1,8.4,.09),p['brass'],.1)
    box('Courtyard stone',(0,.05,.44),(9.8,8.1,.23),p['stone'],.12)
    # Reflecting pool, inset against layered stepping stones.
    box('Pool dark basin',(1.2,-1.55,.57),(5.4,4.5,.14),p['darkstone'],.14)
    water=box('Still water',(1.2,-1.55,.65),(5.1,4.2,.07),p['water'],.12)
    for i in range(7):
        x=-.88+i*.54;y=-3.4+i*.48
        mapped(box('Floating stepping stone',(x,y,.77),(.65,.59,.17),p['stone'],.07),p['stone'])
    for x,y in [(2.45,-2.75),(2.85,-2.32),(2.7,-3.15)]:
        cyl('Lily pad',(x,y,.70),.3,.012,p['leaf'],24)
        sphere('Lotus center',(x,y,.78),.055,p['warm'],segments=12,rings=6)
        for j in range(7):
            a=j*TAU/7;leaf('Lotus petal',(x,y,.74),(x+.19*math.cos(a),y+.19*math.sin(a),.81),.08,p['paper'])
    # Timber tea pavilion: repeated panel kit, raised deck and copper roof.
    mapped(box('Tea pavilion deck',(-1.45,1.35,.83),(5.6,3.45,.32),p['wood'],.08),p['wood'])
    for i in range(3):mapped(box('Tea steps',(-1.45,-.5-i*.24,.74-i*.12),(2,.48,.14),p['wood'],.035),p['wood'])
    def screen():
        box('Paper screen',(0,0,1.25),(1.0,.025,2.2),p['paper'],0)
        for x in [-.55,.55]:mapped(beam('Lacquer post',(x,0,0),(x,0,2.6),.10,p['wood']),p['wood'])
        for z in [.13,.65,1.17,1.69,2.23,2.56]:beam('Screen rail',(-.55,-.025,z),(.55,-.025,z),.035,p['darkbrass'])
        for x in [-.27,0,.27]:beam('Screen lattice',(x,-.03,.13),(x,-.03,2.25),.024,p['wood'])
    panel=part('Tea pavilion screen',screen);move(panel,(-3.65,2.82,1))
    for i in range(1,5):repeat(panel,'Rear screen '+str(i),(-3.65+i*1.1,2.82,1))
    for i,y in enumerate([.1,1.2,2.3]):repeat(panel,'Side screen '+str(i),(-4.22,y,1),math.pi/2)
    for x in [-4.22,1.33]:mapped(beam('Front veranda post',(x,-.16,.95),(x,-.16,3.73),.15,p['wood']),p['wood'])
    mapped(box('Eave beam',(-1.45,1.35,3.68),(6.2,3.82,.18),p['wood'],.06),p['wood'])
    # Curved roof tile courses, each a slender overlapping planar ribbon.
    roof=material('Oxidized teal roof','#395c5a',.43,.26)
    for side in [-1,1]:
        for j in range(13):
            x=-4.52+j*.505
            vertices=[]
            for k in range(13):
                f=k/12;y=1.35+side*(2.26*f);z=4.65-.96*f+.28*f**5
                vertices.extend([(x-.247,y,z),(x+.247,y,z)])
            mesh('Curved roof tile strip',vertices,[(2*k,2*k+1,2*k+3,2*k+2) for k in range(12)],roof)
            tube('Roof tile seam',[(x+.244,1.35+side*(2.26*k/12),4.67-.96*k/12+.28*(k/12)**5) for k in range(13)],.024,p['darkbrass'])
    tube('Roof ridge',[(-4.75,1.35,4.77),(-4.5,1.35,4.73),(1.62,1.35,4.73),(1.92,1.35,4.86)],.095,roof)
    for y in [-.94,3.64]:beam('Roof edge',(-4.7,y,3.98),(1.8,y,3.98),.13,roof)
    # Low table, cushions, ceramic tea set.
    mapped(box('Tea table',(-1.5,1.4,1.56),(1.75,1.05,.10),p['wood'],.055),p['wood'])
    for x in [-2.12,-.88]:
        for y in [1.05,1.75]:beam('Table leg',(x,y,1.02),(x,y,1.51),.07,p['wood'])
    for x in [-2.7,-.3]:box('Floor cushion',(x,1.4,1.08),(.65,.72,.15),p['red'],.14)
    cyl('Tea tray',(-1.5,1.4,1.63),.34,.025,p['brass'],48)
    sphere('Celadon teapot',(-1.53,1.4,1.79),.16,p['jade'],scale=(1,1,.75))
    cyl('Teapot lid',(-1.53,1.4,1.91),.085,.035,p['jade'],32)
    for x in [-1.91,-1.13]:cyl('Tea cup',(x,1.4,1.73),.085,.13,p['jade'],24)
    # Paper lantern module; independent shapes plus spiral ribs.
    def lantern():
        cyl('Lantern top',(0,0,.70),.19,.08,p['darkbrass'],32)
        sphere('Paper lantern',(0,0,.40),.29,p['warm'],scale=(1,1,1.08),segments=24,rings=16)
        for j in range(9):
            z=.13+j*.066;r=.29*math.sqrt(max(.05,1-((z-.4)/.32)**2))
            ring('Bamboo lantern rib',(0,0,z),r,p['darkbrass'],.009,segments=40)
        cyl('Lantern base',(0,0,.09),.17,.065,p['darkbrass'],32)
        beam('Lantern cord',(0,0,.74),(0,0,1.2),.017,p['darkbrass'],bevel=0)
        for dx in [-.025,0,.025]:beam('Silk tassel',(dx,0,.03),(dx,0,-.20),.013,p['red'],bevel=0)
    lamp=part('Paper lantern',lantern);move(lamp,(-3.9,-.23,2.47))
    for i,x in enumerate([-2.65,-1.4,-.15,1.05]):repeat(lamp,'Veranda lantern '+str(i),(x,-.23,2.47),i*.12,scale=.82+(i%2)*.12)
    # Sculpted courtyard tree with hundreds of hand-shaped leaves.
    trunk=material('Bonsai bark','#5b4939',.86)
    for a,b,r in [((3.35,2,.63),(3.15,2,2.1),.16),((3.15,2,2.1),(2.7,2,3.1),.12),((3.05,2,2.35),(3.95,2.15,3.28),.10),((2.8,2,2.9),(2.1,1.85,3.55),.06),((3.65,2.1,3),(4.1,2.4,3.85),.055)]:
        tube('Pine bough',[a,tuple(Vector(a).lerp(Vector(b),.52)+Vector((.1,.05,.1))),b],r,trunk)
    for cx,cy,cz,s in [(2.5,2,3.5,1),(3.95,2.2,3.8,.8),(3.45,2.1,2.85,.68)]:
        for j in range(85):
            a=random.random()*TAU;r=random.random()**.5*s
            start=(cx+math.cos(a)*r,cy+math.sin(a)*r*.7,cz+random.uniform(-.15,.2))
            end=Vector(start)+Vector((random.uniform(-.35,.35),random.uniform(-.35,.35),random.uniform(.03,.22)))
            leaf('Pine foliage',start,end,.12,p['green'] if j%3 else p['leaf'])
    for x,y,r in [(3.2,1.8,.6),(4.0,1.8,.32),(3.4,2.6,.43),(-4.4,-2,.37)]:
        sphere('Garden stone',(x,y,.71),r,p['darkstone'],scale=(1,.8,.6),segments=12,rings=6)
    fern=pot_plant(p,'Courtyard fern',.85);move(fern,(-3.75,-2.5,.60))
    repeat(fern,'Gate fern',(-4.32,-1.6,.60),.6,scale=.8)
    # Gravel and moss make the courtyard read as a planted miniature landscape.
    moss=material('Soft moss','#49664b',.96)
    for i in range(110):
        x=random.uniform(2.0,4.55);y=random.uniform(.95,3.7)
        if random.random()<.6:sphere('Moss mound',(x,y,.66),random.uniform(.06,.13),moss,scale=(1,1,.45),segments=8,rings=4)
        else:sphere('Gravel',(x,y,.64),random.uniform(.025,.055),p['stone'],scale=(1,.8,.5),segments=8,rings=4)
    for x,y,z in [(2.45,-2.75,.704),(2.85,-2.32,.704)]:
        for r in [.39,.48]:ring('Quiet water ripple',(x,y,z),r,p['water'],.003,segments=64)
    return {'title':'The Lantern Courtyard','camera':(12,-15,11),'target':(0,.1,1.8),'size':14.6,'background':'#293e43','world':.16,'key':'#bdd4e5','night':True,'lanterns':[(x,-.23,2.80) for x in [-3.9,-2.65,-1.4,-.15,1.05]]}


def orrery():
    setup('The Celestial Engine');p=palette()
    midnight=material('Midnight enamel','#172c47',.23,.2)
    ivory=material('Engraved ivory','#e5d6b1',.38)
    # A single crafted instrument; no artificial decomposition requirement.
    cyl('Obsidian display plinth',(0,0,.08),3.7,.40,p['darkstone'],96,bevel=.08)
    cyl('Champagne lower rim',(0,0,.31),3.52,.11,p['brass'],96,bevel=.025)
    mapped(cyl('Walnut instrument base',(0,0,.54),3.36,.39,p['wood'],96,bevel=.04),p['wood'])
    cyl('Navy enamel dial',(0,0,.78),3.15,.09,midnight,128)
    for r in [2.72,3.04,3.17,2.30,1.75]:ring('Engraved circular scale',(0,0,.837),r,p['brass'],.012,segments=144)
    for i in range(120):
        a=TAU*i/120;r=3.01;end=r-(.19 if i%10==0 else .11 if i%5==0 else .055)
        beam('Dial graduation',(r*math.cos(a),r*math.sin(a),.845),(end*math.cos(a),end*math.sin(a),.845),.014,p['brass'],bevel=0)
    for i in range(12):
        a=TAU*i/12
        sphere('Dial cabochon',(2.58*math.cos(a),2.58*math.sin(a),.86),.035,ivory,segments=12,rings=6)
    # Visible gear train with genuine tooth geometry and pierced spokes.
    def gear(name,x,y,z,r,teeth):
        cyl(name+' hub',(x,y,z),r*.26,.13,p['brass'],32)
        ring(name+' toothed rim',(x,y,z),r*.79,p['brass'],r*.14,segments=64)
        for j in range(6):
            a=j*TAU/6;beam(name+' spoke',(x,y,z),(x+r*.75*math.cos(a),y+r*.75*math.sin(a),z),r*.12,p['brass'],bevel=.015)
        for j in range(teeth):
            a=j*TAU/teeth;o=box(name+' tooth',(x+r*math.cos(a),y+r*math.sin(a),z),(r*.20,r*.13,.14),p['brass'],.012);o.rotation_euler.z=a
        cyl(name+' pin',(x,y,z+.10),.065,.17,p['darkbrass'],24)
    gear('Primary gear',0,0,1.05,1.20,36)
    gear('Moon train',1.58,0,1.03,.40,16)
    gear('Planet train',-.95,-1.17,1.04,.48,18)
    cyl('Central pillar',(0,0,1.68),.15,1.15,p['darkbrass'],48)
    for z in [1.13,1.30,1.65,1.94,2.19]:cyl('Pillar collar',(0,0,z),.22,.075,p['brass'],48)
    # Offset circular orbit supports and jewel-like planets.
    planets=[(.77,1.92,.45,.12,'#b89972'),(1.12,2.08,2.1,.18,'#c97851'),(1.53,2.26,3.5,.24,'#518d94'),(1.98,2.44,5.35,.19,'#b75942'),(2.47,2.65,1.2,.39,'#ccb184'),(2.95,2.86,3.0,.30,'#b3a774')]
    for i,(radius,z,a,pr,hex) in enumerate(planets):
        ring('Planet orbit '+str(i),(0,0,z),radius,p['brass'],.018,segments=120)
        x,y=radius*math.cos(a),radius*math.sin(a)
        beam('Orbital arm '+str(i),(0,0,z),(x,y,z),.036,p['darkbrass'])
        cyl('Planet spindle '+str(i),(x,y,z+.13),.032,.28,p['brass'],16)
        pm=material('Planet enamel '+str(i),hex,.27,.16)
        sphere('Planet '+str(i),(x,y,z+.35),pr,pm,segments=32,rings=16)
        if i==5:
            ring('Saturn ivory ring',(x,y,z+.35),pr*1.65,ivory,.025,segments=96)
            ring('Saturn dark gap',(x,y,z+.35),pr*1.40,p['darkbrass'],.014,segments=96)
        if i==2:
            for j in range(9):
                b=j*2.399;r=pr*.95
                sphere('Earth enamel continent',(x+r*.65*math.cos(b),y+r*.65*math.sin(b),z+.35+r*.55),.048,p['jade'],scale=(1.5,1,.7),segments=12,rings=6)
            sphere('Moon',(x+.4,y-.15,z+.5),.06,ivory,segments=16,rings=8)
    sunmat=material('Solar gold','#e3b653',.23,.62)
    sphere('The sun',(0,0,2.69),.53,sunmat,segments=48,rings=24)
    for r,plane in [(3.38,'xz'),(3.26,'yz')]:
        ring('Celestial meridian',(0,0,2.66),r,p['brass'],.055,plane,segments=192)
    # Outer sphere's lower arcs meet the base through slender supports.
    for x,y in [(-3.33,0),(3.33,0),(0,-3.22),(0,3.22)]:
        beam('Meridian support',(x,y,.86),(x,y,2.66),.055,p['darkbrass'])
        cyl('Support foot',(x,y,.89),.10,.12,p['brass'],24)
    for i in range(48):
        a=TAU*i/48
        x=3.38*math.cos(a);z=2.66+3.38*math.sin(a)
        if z<.9:continue
        beam('Meridian tick',(x,0,z),(x*.975,0,2.66+(z-2.66)*.975),.015,p['darkbrass'],bevel=0)
    cyl('Zenith crown',(0,0,6.08),.12,.15,p['brass'],32)
    sphere('Zenith finial',(0,0,6.22),.09,p['brass'],segments=24,rings=12)
    return {'title':'The Celestial Engine','camera':(10,-14,10),'target':(0,0,2.55),'size':8.9,'background':'#e2e0d5','world':.45,'key':'#fff0d4'}


def presentation(config):
    scene=bpy.context.scene
    studio=bpy.data.collections.new('AGARTHA_STUDIO');scene.collection.children.link(studio)
    bpy.context.view_layer.active_layer_collection=bpy.context.view_layer.layer_collection.children[studio.name]
    backdrop=material('Studio paper',config['background'],.82)
    box('Presentation ground',(0,0,-.53),(200,200,.15),backdrop,0)
    world=bpy.data.worlds.new('Neutral studio');world.use_nodes=True
    world.node_tree.nodes['Background'].inputs[0].default_value=(*color('#e8edf1'),1)
    world.node_tree.nodes['Background'].inputs[1].default_value=config['world'];scene.world=world
    for name,pos,energy,size,tint in [('Key',(-6,-8,12),1700,8,config['key']),('Fill',(8,-3,7),950,7,'#d6e6ff'),('Rim',(1,7,10),2200,6,'#fff4dd')]:
        data=bpy.data.lights.new(name,'AREA');data.energy=energy*(.65 if config.get('night') else 1);data.shape='DISK';data.size=size;data.color=color(tint)
        o=bpy.data.objects.new(name,data);studio.objects.link(o);o.location=pos;o.rotation_euler=(Vector(config['target'])-o.location).to_track_quat('-Z','Y').to_euler()
    for i,pos in enumerate(config.get('lanterns',[])):
        light=bpy.data.lights.new('Lantern glow '+str(i),'POINT');light.energy=38;light.color=color('#ffc173');light.shadow_soft_size=.27
        obj=bpy.data.objects.new(light.name,light);studio.objects.link(obj);obj.location=pos
    data=bpy.data.cameras.new('Hero');camera=bpy.data.objects.new('Hero',data);studio.objects.link(camera)
    camera.location=config['camera'];camera.rotation_euler=(Vector(config['target'])-camera.location).to_track_quat('-Z','Y').to_euler()
    data.type='ORTHO';data.ortho_scale=config['size'];data.lens=55;scene.camera=camera
    scene.render.resolution_x=1600 if QUALITY=='final' else 1000
    scene.render.resolution_y=1400 if QUALITY=='final' else 875
    scene.render.resolution_percentage=100
    scene.cycles.samples=96 if QUALITY=='final' else 32
    scene.cycles.use_adaptive_sampling=True;scene.cycles.adaptive_threshold=.025 if QUALITY=='final' else .05
    scene.cycles.max_bounces=8;scene.cycles.transparent_max_bounces=12
    scene.render.image_settings.file_format='PNG'
    return scene


def output(slug,config):
    directory=OUT/slug;directory.mkdir(parents=True,exist_ok=True)
    scene=presentation(config)
    stats=kit.export_runtime(str(directory/'model.glb'),collection='AGARTHA_MODEL')
    manifest=assembly_manifest();(directory/'assembly.json').write_text(json.dumps(manifest,indent=2))
    # Preserve native graphs and assembly hierarchy in the full editable scene.
    bpy.ops.wm.save_as_mainfile(filepath=str(directory/'model.blend'),check_existing=False,compress=False)
    scene.render.filepath=str(directory/'preview.png');bpy.ops.render.render(write_still=True)
    component_records=[]
    for root in PARTS[:3]:
        paths=export_component(root,directory/'components'/root.name.lower().replace(' ','-'))
        component_records.append({'name':root.name,'files':paths})
    provenance={'title':config['title'],'createdWith':'Local Blender 4.5 and Agartha production components/material helpers','hostingComputeCents':0,'paidInferenceCalls':0,'geometrySource':'Original agent-authored scripts','runtime':bpy.app.version_string,'quality':QUALITY,'statistics':stats,'assembly':manifest,'components':component_records,'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    (directory/'provenance.json').write_text(json.dumps(provenance,indent=2))
    print('SHOWCASE_RESULT',slug,json.dumps({'triangles':stats['triangles'],'bytes':stats['bytes'],'components':len(manifest['components']),'preview':scene.render.filepath}),flush=True)


for slug,build in [('verdant-conservatory',conservatory),('lantern-courtyard',courtyard),('celestial-engine',orrery)]:
    if ONLY in ['all',slug]:output(slug,build())
