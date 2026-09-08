"""Rolling Meadow: contoured terraces and a crafted windmill above a usable lawn.
World Y-up; front clearing X[2,11], Z[2,11] remains flat at Y .1.
"""
import math
reset_scene('Rolling Meadow')
grass=material('meadow grass','#89966C'); ridge=material('ridge grass','#73865B')
soil=material('terrace earth','#76634B'); stone=material('dry stone limestone','#ACA48B')
shade=material('stone shadow','#827C68'); wood=material('windmill oak','#79593E')
cut=material('warm blade timber','#B29869'); roof=material('slate cap','#536969')
water=material('rill water','#698B83',roughness=.25); stalk=material('wildflower stems','#63724A')
petal=material('meadow ivory','#E3DAB8'); golden=material('meadow ochre','#CBAC5D')
cube('earth island',(0,-.48,0),(25.8,.95,25.8),soil,bevel=.22)
cube('flat meadow',(0,-.03,0),(25.6,.26,25.6),grass,bevel=.15)
def terrace(name,points,top,mat):
    n=len(points); verts=[(x,.1,z) for x,z in points]+[(x,top,z) for x,z in points]
    faces=[tuple(range(n)),tuple(range(n*2-1,n-1,-1))]
    faces.extend((i+n,(i+1)%n+n,(i+1)%n,i) for i in range(n))
    mesh(name,verts,faces,mat)
# Nested contours form a rear ridge, with a low toe toward the entry.
terrace('broad contoured slope',[(-12.3,-11.9),(-3.1,-12.1),(-1.7,-9.6),(-1.5,-6.5),(-2.8,-3.6),(-6.1,-2.8),(-10.7,-3.4),(-12.3,-5.3)],.85,ridge)
terrace('middle hill contour',[(-12,-11.7),(-4.1,-11.7),(-2.7,-9.2),(-3.4,-6.2),(-5.4,-4.6),(-8.8,-4.3),(-11.8,-5.8)],1.6,grass)
terrace('windmill ridge',[(-11.7,-11.3),(-5.2,-11.4),(-4.4,-9.2),(-4.8,-6.8),(-6.4,-5.5),(-9.2,-5.5),(-11.7,-7.3)],2.25,ridge)
terrace('rear crest',[(-11.7,-11.1),(-8.8,-11.2),(-8.4,-9.7),(-9.2,-8.5),(-11.7,-8.9)],2.95,grass)
# Carefully fitted seams trace the contour without becoming a fence around the view.
for points,y in (([(-11.7,-5.9),(-9,-4.5),(-6.4,-4.7),(-3.5,-6.25)],1.4),([(-12,-5.25),(-10.6,-3.6),(-6.2,-3),(-3,-3.9)],.65)):
    for a,b in zip(points,points[1:]):
        n=int(math.dist(a,b)/.47)
        for j in range(n+1):
            t=j/n; x=a[0]+(b[0]-a[0])*t; z=a[1]+(b[1]-a[1])*t
            for row in range(2):
                sphere('dry stone contour course',(x+(row%2)*.1,y-.32+row*.24,z),(.3,.17,.24),stone if j%4 else shade,segments=8,rings=4)
# Reusable mill: tapered eight-sided masonry, timber cap and four lattice sails.
cx=-7.1; cz=-7.3; bottom=2.25; top=6.12
verts=[]
for y,r in ((bottom,1.15),(top,.76)):
    for j in range(8):
        a=j*math.tau/8+math.pi/8; verts.append((cx+math.cos(a)*r,y,cz+math.sin(a)*r))
mesh('component_windmill tapered tower',verts,[tuple(range(8)),tuple(range(15,7,-1))]+[(j+8,(j+1)%8+8,(j+1)%8,j) for j in range(8)],stone)
for row in range(10):
    y=bottom+.21+row*.365; radius=1.15-(y-bottom)/(top-bottom)*.39
    for j in range(8):
        a=j*math.tau/8+math.pi/8; b=(j+1)*math.tau/8+math.pi/8
        beam('component_windmill masonry bed seam',(cx+math.cos(a)*(radius+.008),y,cz+math.sin(a)*(radius+.008)),(cx+math.cos(b)*(radius+.008),y,cz+math.sin(b)*(radius+.008)),.023,shade)
        a+=(math.pi/8 if row%2 else 0)
        beam('component_windmill vertical mortar',(cx+math.cos(a)*(radius+.012),y,cz+math.sin(a)*(radius+.012)),(cx+math.cos(a)*(radius-.027),y+.31,cz+math.sin(a)*(radius-.027)),.025,shade)
roofverts=[(cx+math.cos(j*math.tau/8)*1.06,6.05,cz+math.sin(j*math.tau/8)*1.06) for j in range(8)]+[(cx,7.07,cz)]
mesh('component_windmill slate cap',roofverts,[(8,(j+1)%8,j) for j in range(8)],roof)
for j in range(8):
    a=j*math.tau/8
    beam('component_windmill cap ribs',(cx+math.cos(a)*1.07,6.05,cz+math.sin(a)*1.07),(cx,7.1,cz),.04,wood)
# Door faces the viewer, inset within a raised oak frame.
cube('component_windmill dark door',(cx,2.98,cz+1.055),(.66,1.4,.08),wood,bevel=.04)
for x in (-.38,.38):cube('component_windmill door jamb',(cx+x,3.01,cz+1.09),(.1,1.52,.13),cut,bevel=.02)
cube('component_windmill door lintel',(cx,3.79,cz+1.09),(.88,.12,.16),cut,bevel=.025)
for j in range(5):cube('component_windmill door board',(cx-.25+j*.125,2.99,cz+1.11),(.11,1.31,.025),wood,bevel=.015)
for y in (2.7,3.3):cube('component_windmill door strap',(cx,y,cz+1.14),(.61,.06,.025),shade)
for x,y in ((-.4,4.5),(.27,5.48)):
    cube('component_windmill small window',(cx+x,y,cz+.91),(.25,.4,.06),shade,bevel=.035)
    cube('component_windmill window sill',(cx+x,y-.23,cz+.97),(.39,.07,.18),cut,bevel=.02)
hub=(cx,6.12,cz+1.27)
cylinder('component_windmill axle',hub,.2,.72,wood,vertices=12,rotation=(math.pi/2,0,0))
sphere('component_windmill hub cap',(cx,6.12,cz+1.65),(.31,.31,.14),cut,segments=12,rings=6)
# Slight diagonal rotation gives a singular silhouette and reveals the door below.
for sail in range(4):
    a=math.pi/4+sail*math.pi/2; dx=math.cos(a); dy=math.sin(a); nx=-dy; ny=dx
    def sailpoint(r,w,z=cz+1.5):return (cx+dx*r+nx*w,6.12+dy*r+ny*w,z)
    beam('component_windmill sail spar',sailpoint(.15,0),sailpoint(2.88,0),.105,wood)
    for w in (.08,.67):beam('component_windmill sail outer frame',sailpoint(1.0,w),sailpoint(2.85,w),.06,cut)
    for j in range(10):
        r=1+j*.2
        beam('component_windmill sail lattice rung',sailpoint(r,.025),sailpoint(r,.71),.055,cut,depth=.075)
    beam('component_windmill sail diagonal',sailpoint(1,.08),sailpoint(2.85,.67),.035,wood)
# Seven broad hillside steps, with a curving gravel walk serving all approaches.
for j in range(9):cube('hill approach tread',(-4.1-j*.33,.18+j*.24,-2.6-j*.38),(1.3,.25,.6),stone,bevel=.06)
# A global footprint registry leaves real gaps, including at path junctions.
_path_pavers=[]
def path(points):
    for j,(a,b) in enumerate(zip(points,points[1:])):
        dx=b[0]-a[0]; dz=b[1]-a[1]
        yaw=math.atan2(dx,dz)
        across=(math.cos(yaw),-math.sin(yaw)); along=(math.sin(yaw),math.cos(yaw))
        axes=(across,along); half=(1.1/2,0.6/2)
        n=max(1,int(math.dist(a,b)/0.8))
        for k in range(n+1):
            t=k/n; x=a[0]+dx*t; z=a[1]+dz*t
            # Oriented-rectangle separation rejects duplicate endpoints and
            # intersecting corner pavers, even when adjacent segments turn.
            blocked=False
            for ox,oz,other_axes in _path_pavers:
                separated=False
                for axis in axes+other_axes:
                    distance=abs((x-ox)*axis[0]+(z-oz)*axis[1])
                    extent=sum(half[i]*abs(axis[0]*basis[0]+axis[1]*basis[1]) for i,basis in enumerate(axes))
                    extent+=sum(half[i]*abs(axis[0]*basis[0]+axis[1]*basis[1]) for i,basis in enumerate(other_axes))
                    if distance>=extent+.045:
                        separated=True
                        break
                if not separated:
                    blocked=True
                    break
            if blocked: continue
            paver=cube('meadow stepping path',(x,0.135,z),(1.1,0.1,0.6),stone,bevel=0.12)
            paver.rotation_euler.z=yaw
            _path_pavers.append((x,z,axes))
path([(-12.3,0),(-7,0),(-2,0),(0,0),(6,0),(12.3,0)])
path([(0,-12.3),(0,-7),(0,-3),(0,0),(0,6),(0,12.3)])
path([(-4.1,-2.5),(-3,-1),(-2,0)])
# A narrow stream crossing in the west foreground keeps the buildable meadow dry.
rill=[(-12.6,7.7),(-10.5,7.5),(-8.9,6.8),(-6.4,7.5),(-4.4,9.4),(-3.4,12.65)]
for a,b in zip(rill,rill[1:]):
    dx=b[0]-a[0]; dz=b[1]-a[1]; d=math.hypot(dx,dz); nx=-dz/d*.27; nz=dx/d*.27
    mesh('meadow rill',[(a[0]+nx,.12,a[1]+nz),(a[0]-nx,.12,a[1]-nz),(b[0]-nx,.12,b[1]-nz),(b[0]+nx,.12,b[1]+nz)],[(3,2,1,0)],water)
for j in range(6):cube('rill crossing plank',(-8.85,.27,5.97+j*.3),(1.25,.12,.26),cut,bevel=.025)
for x in (-9.37,-8.33):beam('rill bridge bearer',(x,.2,5.8),(x,.2,7.65),.12,wood)
# Short fence fragments suggest cultivation without enclosing gateways or the lawn.
for points in (([(-11,2.8),(-8.9,2.8),(-6.8,2.8)]),([(4.6,-9.8),(6.8,-9.8),(9,-9.8)])):
    for x,z in points:
        cube('split rail fence post',(x,.7,z),(.17,1.2,.17),wood,bevel=.025)
        sphere('fence rounded end',(x,1.34,z),(.115,.09,.115),cut,segments=6,rings=3)
    for a,b in zip(points,points[1:]):
        for y in (.58,1.06):beam('split fence rail',(a[0],y,a[1]),(b[0],y,b[1]),.12,cut)
# Each flower drift is three editable compound meshes, preserving every leaf,
# stem, petal and faceted seed eye without creating hundreds of tiny objects.
def flora_part(groups,key,vertices,faces):
    out_vertices,out_faces=groups[key]; offset=len(out_vertices)
    out_vertices.extend(vertices)
    out_faces.extend(tuple(offset+i for i in face) for face in faces)
def flora_stem(groups,x,z,h):
    # A square stalk follows the same gentle lean as the original timber beam.
    vertices=[(x+dx,.13,z+dz) for dx,dz in ((-.009,-.009),(.009,-.009),(.009,.009),(-.009,.009))]
    vertices.extend((x+.035+dx,h+.13,z+dz) for dx,dz in ((-.009,-.009),(.009,-.009),(.009,.009),(-.009,.009)))
    flora_part(groups,'stem',vertices,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)])
def flora_eye(groups,x,y,z):
    # Identical six-segment, three-ring faceting to the former sphere primitive.
    vertices=[(x,y+.022,z)]
    for ring in (1,2):
        latitude=math.pi*ring/3
        for k in range(6):
            a=k*math.tau/6
            vertices.append((x+math.sin(latitude)*math.cos(a)*.038,y+math.cos(latitude)*.022,z+math.sin(latitude)*math.sin(a)*.038))
    vertices.append((x,y-.022,z))
    faces=[]
    for k in range(6):
        n=(k+1)%6
        faces.extend([(0,1+n,1+k),(1+k,1+n,7+n,7+k),(13,7+k,7+n)])
    flora_part(groups,'gold',vertices,faces)
# Exactly three intentional flower drifts: ivory, ochre, and a mixed western drift.
for patch,(px,pz,sx,sz) in enumerate(((5.8,-6.3,2,1.2),(9,-4.3,1.8,1.05),(-9.4,10,1.8,1.05))):
    flora={key:([],[]) for key in ('stem','ivory','gold')}
    for j in range(38):
        a=j*2.399; r=math.sqrt((j+.5)/38); x=px+math.cos(a)*r*sx; z=pz+math.sin(a)*r*sz; h=.31+(j%5)*.075
        flora_stem(flora,x,z,h)
        for side in (-1,1):
            flora_part(flora,'stem',[(x,.16,z),(x+side*.2,.29,z+.07),(x+side*.05,.4,z)],[(0,1,2)])
        for k in range(5):
            q=k*math.tau/5; dx=math.cos(q); dz=math.sin(q)
            flora_part(flora,'ivory' if patch==0 or (patch==2 and j%2) else 'gold',[(x,h+.14,z),(x+dx*.075-dz*.04,h+.16,z+dz*.075+dx*.04),(x+dx*.15,h+.15,z+dz*.15),(x+dx*.075+dz*.04,h+.16,z+dz*.075-dx*.04)],[(0,1,2,3)])
        flora_eye(flora,x,h+.158,z)
    for key,mat in (('stem',stalk),('ivory',petal),('gold',golden)):
        vertices,faces=flora[key]
        if vertices: mesh('wildflower drift '+str(patch)+' '+key,vertices,faces,mat)
finish_scene()
