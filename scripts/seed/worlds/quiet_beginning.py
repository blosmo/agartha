"""A Quiet Beginning — a stone circle, red maples and an open meditation deck.
Exec after starter_kit.py. Coordinates are Y-up; component_ is the moon gate.
"""
# Refinement plan: replace crossing paving with one fitted center stone. Add a low raked limestone garden in X -10..-2, Z 3..11: rectangular coping, flowing rake lines and three substantial contemplation stones. Preserve the entire X 1..11, Z 2..11 clearing.
import math

reset_scene('A Quiet Beginning')
q_grass = material('Quiet / celadon turf', '#728874')
q_soil = material('Quiet / earth edge', '#484C40')
q_stone = material('Quiet / warm limestone', '#B7B3A3')
q_light = material('Quiet / cut stone', '#D5D0BC')
q_dark = material('Quiet / shadow stone', '#7C8179')
q_wood = material('Quiet / silver cedar', '#81725B')
q_bark = material('Quiet / maple bark', '#53493E')
q_red = material('Quiet / vermilion leaves', '#AF4436')
q_rust = material('Quiet / copper leaves', '#CF6945')
q_moss = material('Quiet / moss cushions', '#5C7150')
q_water = material('Quiet / still basin', '#547B7A', roughness=.28)

cube('earth foundation', (0,-.29,0), (25.8,.58,25.8), q_soil)
cube('unoccupied soft ground', (0,.06,0), (25.8,.08,25.8), q_grass)
# Approaches remain within the five-unit gateways; the east/front quadrant is free.
for i in range(19):
    for axis in ('x','z'):
        p=-12.15+i*1.35
        if abs(p)<.7:
            continue
        loc=(p,.118,0) if axis=='x' else (0,.118,p)
        cube('approach '+axis+str(i),loc,(1.19,.036,1.06) if axis=='x' else (1.06,.036,1.19),q_stone,bevel=.025)
cube('single fitted path junction',(0,.118,0),(1.42,.036,1.42),q_stone,bevel=.025)
for i in range(7):
    cube('meditation approach '+str(i),(-1-i*.74,.14,-1.2-i*.29),(.61,.08,.78),q_light,bevel=.04)

# Individually jointed voussoirs make the opening readable from the world camera.
# Three shallow rings share one stone circle rather than a torus primitive.
for band,(inner,outer,z,mat) in enumerate(((2.38,2.68,-4.37,q_light),(2.68,3.03,-4.15,q_stone),(2.38,2.68,-3.93,q_light))):
    for i in range(64):
        a=2*math.pi*(i+.035)/64
        b=2*math.pi*(i+.965)/64
        verts=[]
        for zz in (z-.105,z+.105):
            for radius,angle in ((inner,a),(outer,a),(outer,b),(inner,b)):
                verts.append((-6+radius*math.cos(angle),3.16+radius*math.sin(angle),zz))
        mesh('component_moongate ring %d stone %02d'%(band,i),verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat)
for x in (-8.65,-3.35):
    cube('component_moongate footing '+str(x),(x,.28,-4.15),(.95,.36,.95),q_dark,bevel=.06)
    cube('component_moongate plinth '+str(x),(x,.5,-4.15),(.72,.18,.75),q_light,bevel=.04)
# A low, roofless deck leaves the circle and sky as the principal silhouette.
cube('deck recessed foundation',(-6,.23,-1.3),(6.8,.25,3.45),q_dark)
for i in range(33):
    cube('cedar meditation plank %02d'%i,(-9.23+i*.202,.42,-1.3),(.19,.14,3.38),q_wood,bevel=.017)
for x in (-9.31,-2.69):
    cube('deck stone end '+str(x),(x,.39,-1.3),(.13,.25,3.53),q_light,bevel=.02)
cube('low sitting bench',(-6,.87,-2.5),(3.5,.16,.65),q_wood,bevel=.04)
for x in (-7.2,-4.8):
    cube('bench stone support '+str(x),(x,.63,-2.5),(.3,.4,.51),q_stone,bevel=.03)

# Two asymmetric sculptural maples: branch architecture and overlapping broad crowns.
for t,(x,z,h,spread) in enumerate(((-10,-7.5,5.8,1.75),(-2.9,-8.7,5.1,1.85))):
    beam('maple %d main trunk'%t,(x,.1,z),(x+.32,h*.7,z+.18),.27,q_bark)
    for j in range(7):
        a=j*2.399+t*.4
        tip=(x+math.cos(a)*spread*.82,h*(.65+.035*(j%3)),z+math.sin(a)*spread*.8)
        beam('maple %d branch %d'%(t,j),(x+.2,h*.38,z),tip,.12,q_bark)
        for k in range(4):
            angle=a+k*1.57
            sphere('maple %d leaf tier %d %d'%(t,j,k),(tip[0]+math.cos(angle)*.42,tip[1]+.28+k*.2,tip[2]+math.sin(angle)*.42),(.84,.37,.71),q_red if (j+k)%3 else q_rust,segments=12,rings=7)
    for j in range(5):
        a=j*math.tau/5
        beam('maple %d exposed root %d'%(t,j),(x,.23,z),(x+math.cos(a)*.8,.11,z+math.sin(a)*.8),.14,q_bark)
# Carved basin beside the approach, with a dry lip around the inset water.
cylinder('basin foot',(-10.1,.27,-.6),.58,.32,q_dark,vertices=32)
cylinder('basin bowl',(-10.1,.55,-.6),.81,.3,q_stone,vertices=40)
cylinder('basin inset',(-10.1,.708,-.6),.65,.018,q_water,vertices=40)
for i in range(48):
    a=i*math.tau/48
    b=(i+1)*math.tau/48
    beam('basin rim %02d'%i,(-10.1+.72*math.cos(a),.75,-.6+.72*math.sin(a)),(-10.1+.72*math.cos(b),.75,-.6+.72*math.sin(b)),.13,q_light)
for j,(x,z) in enumerate(((-11,-5),(-10.8,-9),(-7.4,-9.4),(-4,-10.4),(-2,-6.7),(-10.4,3.3))):
    sphere('moss bed '+str(j),(x,.2,z),(.8,.19,.63),q_moss,segments=16,rings=6)
    sphere('weathered garden stone '+str(j),(x+.3,.33,z-.2),(.45,.3,.37),q_dark,segments=12,rings=6)
# Broad raked garden gives the left foreground a calm, intentional landscape.
cube('raked garden limestone bed',(-6,.135,7),(7.7,.07,7.7),q_stone)
for x in (-9.93,-2.07):
    cube('raked garden side coping '+str(x),(x,.19,7),(.15,.18,8),q_dark)
for z in (3.07,10.93):
    cube('raked garden end coping '+str(z),(-6,.19,z),(7.72,.18,.15),q_dark)
for row in range(10):
    z=3.75+row*.71
    points=[(-9.5+i*7/12,.183,z+.16*math.sin(i*math.pi/6)) for i in range(13)]
    curve('long raked ripple %02d'%row,points,.017,q_light)
for i,(x,z,sx,sy,sz) in enumerate(((-7.5,5.15,.75,.48,.51),(-5.7,7.35,.52,.75,.65),(-4.55,8.65,.83,.3,.46))):
    sphere('contemplation stone '+str(i),(x,.19+sy*.7,z),(sx,sy,sz),q_dark,segments=10,rings=6)
finish_scene()
