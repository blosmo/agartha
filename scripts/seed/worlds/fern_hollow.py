"""Fern Hollow: ancient leaning tree, winding stream and fern-lined bridge.
Reserved clearing X[2,10], Z[3,11], top Y .1. World coordinates are Y-up.
"""
import math
reset_scene('Fern Hollow')
grass=material('deep moss lawn','#73816A'); soil=material('peat bank','#574F41')
stone=material('lichen stone','#92978A'); water=material('shallow stream','#597F7A',roughness=.23)
wood=material('ancient bark','#655044'); cut=material('exposed heartwood','#AD936D')
leaf=material('fern dark','#46634A'); young=material('fern light','#849564')
canopy=material('canopy sage','#668063'); pale=material('canopy sunlit','#95A176')
cap=material('terracotta mushrooms','#B27858'); cream=material('mushroom ivory','#D6C8A9')
cube('peat island',(0,-.49,0),(25.8,.96,25.8),soil,bevel=.23)
cube('moss top',(0,-.03,0),(25.6,.26,25.6),grass,bevel=.16)
# Stream is an authored ribbon; banks follow its actual bends, not scattered props.
stream=[(5.7,-12.75),(5.9,-10.2),(4.7,-7.1),(3.5,-4.8),(1.3,-2.4),(-.4,.2),(-2.4,2.7),(-4.3,5.9),(-5.5,9),(-5.7,12.7)]
for i,(a,b) in enumerate(zip(stream,stream[1:])):
    dx=b[0]-a[0]; dz=b[1]-a[1]; length=math.hypot(dx,dz); nx=-dz/length; nz=dx/length
    half=.64 if i%3 else .84
    verts=[(a[0]+nx*half,.12,a[1]+nz*half),(a[0]-nx*half,.12,a[1]-nz*half),(b[0]-nx*half,.12,b[1]-nz*half),(b[0]+nx*half,.12,b[1]+nz*half)]
    mesh('winding stream segment',verts,[(3,2,1,0)],water)
    for side in (-1,1):
        for j in range(4):
            t=(j+.5)/4; x=a[0]+dx*t+nx*(half+.24)*side; z=a[1]+dz*t+nz*(half+.24)*side
            if abs(z)>12.2:continue
            sphere('exposed stream bank',(x,.16,z),(.6,.25,.55),soil,segments=6,rings=3)
            sphere('bank moss mantle',(x,.32,z),(.48,.1,.44),grass,segments=6,rings=3)
# Four gateway paths merge across the bridge, leaving the southeast clearing whole.
def stepping(label,points):
    for i,(a,b) in enumerate(zip(points,points[1:])):
        n=max(1,int(math.dist(a,b)/1.03))
        for j in range(n+1):
            t=j/n; x=a[0]+(b[0]-a[0])*t; z=a[1]+(b[1]-a[1])*t
            sphere(label,(x,.12,z),(.68,.105,.53),stone,segments=7,rings=3)
stepping('west stepping walk',[(-12.2,0),(-7.5,0),(-3,0)])
stepping('east stepping walk',[(2.1,0),(7,0),(12.2,0)])
stepping('north stepping walk',[(0,-12.3),(0,-8.7),(-1.1,-4.1),(-2.7,0)])
stepping('south stepping walk',[(1.3,0),(0,4.7),(0,8.5),(0,12.3)])
# Curved plank footbridge: two continuous stringers, infill planks, pegged rails.
for j in range(15):
    x=-3.25+j*.37; y=.34+.48*math.sin(j/14*math.pi)
    cube('arched footbridge plank',(x,y,0),(.32,.15,1.95),cut,bevel=.025)
for z in (-.8,.8):
    pts=[(-3.4+j*.39,.26+.48*math.sin(j/14*math.pi),z) for j in range(15)]
    curve('footbridge oak stringer',pts,.115,wood)
    for j in (0,4,10,14):
        x=-3.4+j*.39; y=.26+.48*math.sin(j/14*math.pi)
        beam('bridge handrail upright',(x,y,z),(x,y+1.08,z),.1,wood)
    curve('flowing handrail',[(x,y+1.05,z) for x,y,z in pts],.065,cut)
# Ancient tree is a portable component, including its buttress roots and crown.
trunk=[(-6,.1,-5),(-6.2,1.4,-5.1),(-5.98,3,-5.0),(-5.5,4.6,-4.85),(-4.85,6.1,-4.65),(-4.6,7,-4.5)]
for j,(a,b) in enumerate(zip(trunk,trunk[1:])):
    beam('component_ancient_tree twisted trunk '+str(j),a,b,1.18-j*.13,wood,depth=1.04-j*.1,bevel=.1)
# Broad organic buttresses are low-poly sculpted wedges, rather than conical roots.
for k in range(9):
    a=k*math.tau/9; r=2.45+(k%3)*.25
    dx=math.cos(a); dz=math.sin(a); nx=-dz*.27; nz=dx*.27
    verts=[(-6+nx,.13,-5+nz),(-6-nx,.13,-5-nz),(-6+dx*r,.12,-5+dz*r),(-6+dx*.6,1.55,-5+dz*.6),(-6+dx*r*.67,.34,-5+dz*r*.67)]
    mesh('component_ancient_tree root buttress',verts,[(0,1,3),(0,3,4),(1,4,3),(0,4,2),(1,2,4),(0,2,1)],wood)
    curve('component_ancient_tree root ridge',[(-6+dx*.3,.9,-5+dz*.3),(-6+dx*1.3,.25,-5+dz*1.3),(-6+dx*r,.14,-5+dz*r)],.09,cut)
branches=[((-5.9,2.8,-5),(-8.1,4.8,-5.4),(-9.1,6.3,-6.2)),((-5.55,4.2,-4.9),(-6.5,5.8,-7),(-7.1,7.5,-7.3)),((-5.1,5.4,-4.7),(-3.6,6.6,-5.6),(-2.8,7.6,-5.8)),((-5.45,4.6,-4.9),(-6.1,6.1,-2.9),(-6.9,7.35,-2.7)),((-4.8,6.1,-4.6),(-4.7,7.4,-3.3),(-4.3,8.2,-3.2))]
for k,(a,b,c) in enumerate(branches):
    beam('component_ancient_tree main bough',a,b,.47,wood,bevel=.065)
    beam('component_ancient_tree fine bough',b,c,.26,wood,bevel=.04)
    for j in range(3):
        q=j*math.tau/3+k*.8
        tip=(c[0]+math.cos(q)*.9,c[1]+.35,c[2]+math.sin(q)*.9)
        beam('component_ancient_tree branch fork',c,tip,.1,wood)
    for j in range(15):
        q=j*2.399; r=math.sqrt(j/14)*1.22
        x=c[0]+math.cos(q)*r; z=c[2]+math.sin(q)*r; y=c[1]+.3+(j%3)*.22
        sphere('component_ancient_tree layered crown',(x,y,z),(.74,.48,.71),pale if j%5==0 else canopy,segments=10,rings=4)
# Root moss remains part of the reusable tree.
for j in range(13):
    a=j*2.399; r=.5+j*.12
    sphere('component_ancient_tree root moss',(-6+math.cos(a)*r,.23,-5+math.sin(a)*r),(.36,.14,.29),young,segments=7,rings=3)
# Fern fans have a curved spine and paired articulated leaflets.
def fern(name,x,z,size):
    foliage={False:([],[]),True:([],[])}
    for k in range(7):
        a=k*math.tau/7; dx=math.cos(a); dz=math.sin(a)
        pts=[(x,.14,z),(x+dx*size*.35,.14+size*.7,z+dz*size*.35),(x+dx*size,.14+size*.43,z+dz*size)]
        curve(name+' frond stem',pts,.018,leaf)
        for j in range(1,8):
            t=j/8; reach=size*t; y=.14+size*(.75*math.sin(t*math.pi*.78))
            cx=x+dx*reach; cz=z+dz*reach; spread=size*.23*(1-t*.8)
            for side in (-1,1):
                tip=(cx-dz*spread*side+dx*.09,y+.035,cz+dx*spread*side+dz*.09)
                vertices,faces=foliage[k%3==0]; offset=len(vertices)
                vertices.extend([(cx-dx*.075,y,cz-dz*.075),tip,(cx+dx*.12,y+.03,cz+dz*.12)])
                faces.append((offset,offset+1,offset+2))
    for highlighted,(vertices,faces) in foliage.items():
        mesh(name+' paired leaf fan '+str(highlighted),vertices,faces,young if highlighted else leaf)
for x,z,s in ((-9,-3,.9),(-8.8,-7.6,.85),(-3.9,-7.9,.75),(3.1,-6.9,.75),(6.9,-9.2,.8),(-3.5,4.5,.65),(-6.7,7,.85),(-7,10.1,.7),(-9.9,4.1,.9),(8.3,-4.8,.8),(9.4,-6.2,.75),(-2.3,-3.3,.65)):
    fern('bank fern',x,z,s)
# A nurse log lies on the west bank, with visible growth rings at its cut end.
beam('fallen nurse log',(-10.6,.55,3.5),(-8.1,.55,6.6),.63,wood,bevel=.08)
for j in range(4):
    x=-10.2+j*.54; z=3.8+j*.65
    sphere('nurse log moss',(x,.89,z),(.4,.13,.35),young,segments=8,rings=4)
    beam('broken nurse twig',(x,.7,z),(x-.52,1.1,z+.2),.11,wood)
for cx,cz in ((-7.5,-3.2),(-9.9,5.7),(-7.5,7.2),(6.6,-8.2)):
    for j in range(5):
        a=j*2.1; x=cx+math.cos(a)*j*.12; z=cz+math.sin(a)*j*.12; h=.25+(j%3)*.1
        cylinder('mushroom stem',(x,.1+h/2,z),.045,h,cream,vertices=6)
        sphere('mushroom cap',(x,.1+h,z),(.18,.09,.18),cap,segments=8,rings=4)
# Two smaller trunks support the grove character while keeping the hero singular.
for i,(x,z,h) in enumerate(((-10.5,-9.9,4.6),(9.5,-9.4,4.1))):
    tree('companion grove '+str(i),(x,.1,z),h,wood,canopy,radius=1.5)
finish_scene()
