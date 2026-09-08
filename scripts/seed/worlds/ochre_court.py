"""Ochre Court — planned carved sandstone threshold and recessed civic plaza.
Hero X -11..1, Z -7.5..-4.5, height 9; opening centered X -5.
Court X/Z -9..9/-8..8, surface -.2. Clearing X -9..-2, Z 5..11,
surface -.2, remains empty. Access ramps connect four five-wide gateways.
Camera +X/+Z sees through the carved arch; sundial stands beyond it.
Reusable component_* selects the arch, piers, carved bands and imposts.
Texture-free 10-material scheme, polygon wedges instead of boolean masonry.
"""
import math
reset_scene('Ochre Court')
base=material('Court strata',(.46,.30,.18))
sand=material('Honey sandstone',(.68,.46,.25))
light=material('Fresh carved sandstone',(.82,.63,.37))
dark=material('Weathered ochre joints',(.48,.31,.18))
paving=material('Court paving',(.66,.51,.34))
copper=material('Aged copper inlay',(.26,.43,.36),.6,.45)
wood=material('Desert cedar',(.30,.18,.09))
clay=material('Terracotta vessels',(.58,.27,.14))
leaf=material('Dry olive leaves',(.39,.44,.24))
iron=material('Sundial bronze',(.29,.23,.13),.4,.6)
cube('Geological island',(0,-1.0,0),(25.8,1.4,25.8),base)
cube('Sunken court ground',(0,-.31,0),(25.6,.22,25.6),paving)
# Outside rim returns to .1, except the deliberately sunken southwest clearing.
for x in (-11.1,11.1):
    for z in (-10.7,-7,-3.3,.4,4.1,7.8,11):
        if abs(z)>2.5 and not (x<0 and z>4): cube('Raised border',(x,-.05,z),(3.2,.3,3.25),sand)
for z in (-11.5,11.5):
    for x in (-7.5,-3.8,3.8,7.5):
        if not(z>0 and x<0): cube('Raised border',(x,-.05,z),(3.5,.3,2.4),sand)
# Fine pavement seams occupy only the circulation cross, not building clearing.
for axis in range(2):
    for i in range(-10,11):
        if abs(i)<=1: continue  # One plaza replaces the crossing courses.
        p=i*1.18
        cube('Processional paving',((p if axis==0 else 0),-.18,(0 if axis==0 else p)),(1.12,.045,2.5) if axis==0 else (2.5,.045,1.12),light)
cube('Unbroken central court slab',(0,-.18,0),(3.48,.045,3.48),light)
# Four gently inclined gateway thresholds within the island footprint.
for sign in (-1,1):
    for axis in (0,1):
        def pos(a,b,y): return (a,y,b) if axis==0 else (b,y,a)
        verts=[pos(sign*10.2,-2.5,-.16),pos(sign*12.8,-2.5,.1),pos(sign*12.8,2.5,.1),pos(sign*10.2,2.5,-.16)]
        mesh('Gateway ramp',verts,[(0,1,2,3)],paving)
# Massive layered feet and independent masonry courses retain readable joints.
for x in (-9.45,-.55):
    cube('component_stepped_foot',(x,.03,-6),(3.1,.45,3.5),dark,.06)
    cube('component_foot_cap',(x,.34,-6),(2.85,.18,3.15),light,.045)
    for course in range(9):
        y=.76+course*.55
        for half in (-1,1):
            cube('component_pier_masonry',(x+half*.575,y,-6),(1.12,.515,2.65),sand if (course+half)%3 else light,.035)
        if course in (1,6):
            cube('component_relief_belt',(x,y,-6),(2.43,.13,2.81),light,.025)
    cube('component_impost',(x,5.55,-6),(2.65,.35,3),light,.055)
# Semicircular voussoirs span a 6.6 opening, extruded with front/back relief.
xc=-5; spring=5.55; inner=3.3; outer=4.5
for i in range(21):
    a0=math.pi*i/21+.008; a1=math.pi*(i+1)/21-.008
    vv=[]
    for z in (-7.34,-4.66):
        for r,a in ((inner,a0),(outer,a0),(outer,a1),(inner,a1)):
            vv.append((xc+r*math.cos(a),spring+r*math.sin(a)*.75,z))
    mesh('component_arch_voussoir',vv,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],light if i%4==2 else sand)
    # Recessed front rosette: simple chisel-cut diamond within each arch block.
    a=(a0+a1)/2;r=3.94
    cx=xc+r*math.cos(a);cy=spring+r*.75*math.sin(a)
    mesh('component_chisel_rosette',[(cx,cy+.16,-4.62),(cx+.14,cy,-4.62),(cx,cy-.16,-4.62),(cx-.14,cy,-4.62),(cx,cy,-4.54)],[(0,1,4),(1,2,4),(2,3,4),(3,0,4)],dark)
for r in (3.32,4.48):
    for z in (-7.38,-4.62):
        curve('component_carved_archivolt',[(xc+r*math.cos(math.pi*i/48),spring+r*.75*math.sin(math.pi*i/48),z) for i in range(49)],.07,light)
# Long narrow vertical relief niches and copper tally inlays on the front piers.
for x in (-9.45,-.55):
    for k in range(3):
        xx=x+(k-1)*.53
        cube('component_recessed_flute',(xx,3.05,-4.651),(.11,3.25,.035),dark)
        for y in (1.54,4.5):
            mesh('component_lotus_relief',[(xx-.18,y,-4.61),(xx,y+.26,-4.61),(xx+.18,y,-4.61),(xx,y-.14,-4.51)],[(0,1,3),(1,2,3),(2,0,3)],light)
    for j in range(6): cube('component_copper_measure',(x-.77+j*.31,5.6,-4.475),(.07,.17,.04),copper)
# Rear stepped sundial remains visible through opening rather than another roof.
for tier in range(4):
    cylinder('Sundial stepped dais',(-5,.03+tier*.2,-10.2),1.7-tier*.25,.2,sand if tier%2 else light,24)
cylinder('Sundial bronze face',(-5,.78,-10.2),.95,.055,iron,32)
mesh('Sundial triangular gnomon',[(-5,.82,-10.8),(-5,.82,-9.65),(-5,2.25,-10.35),(-4.93,.82,-10.8),(-4.93,.82,-9.65),(-4.93,2.25,-10.35)],[(0,1,2),(5,4,3),(0,3,4,1),(1,4,5,2),(2,5,3,0)],copper)
for i in range(12):
    a=math.tau*i/12
    beam('Sundial hour inlay',(-5+.7*math.cos(a),.812,-10.2+.7*math.sin(a)),(-5+.89*math.cos(a),.812,-10.2+.89*math.sin(a)),.025,light)
# Low arcaded seating against eastern flank; raised backs never dominate hero.
for z in (-7.5,-4.1,3.7,7.1):
    for x in (8.45,10.75): cube('Bench carved support',(x,.23,z),(.32,.86,.9),sand,.05)
    cube('Cedar court bench',(9.6,.74,z),(3,.17,1.05),wood,.04)
    cube('Bench stone back',(9.6,1.18,z-.5),(3.1,.72,.25),sand,.04)
    for j in range(7): cube('Bench recessed relief',(8.37+j*.4,1.19,z-.359),(.18,.24,.025),dark)
# Vessels have open mouths and thick curved silhouette built as ring strips.
def vessel(name,x,z,scale):
    profile=[(0,.34),(.15,.52),(.6,.6),(.95,.38),(1.08,.28),(1.13,.32)]
    vertices=[]
    for h,r in profile:
        vertices += [(x+r*scale*math.cos(math.tau*j/16),-.18+h*scale,z+r*scale*math.sin(math.tau*j/16)) for j in range(16)]
    faces=[]
    for row in range(len(profile)-1):
        for j in range(16): faces.append((row*16+j,row*16+(j+1)%16,(row+1)*16+(j+1)%16,(row+1)*16+j))
    mesh(name,vertices,faces,clay)
    curve(name+' rolled lip',[(x+.32*scale*math.cos(math.tau*j/24),-.18+1.13*scale,z+.32*scale*math.sin(math.tau*j/24)) for j in range(25)],.055*scale,light)
for x,z,s in ((5,-8,1.25),(6.2,-8.5,.85),(10,10,1),(-11,-10,.9)): vessel('Water vessel',x,z,s)
for x,z in ((11,-10),(7,10),(-11,3)):
    tree('Olive sapling',(x,-.2,z),2.6,wood,leaf,.75)
finish_scene()
