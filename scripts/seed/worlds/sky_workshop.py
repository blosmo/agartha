"""Sky Workshop — exec after starter_kit.py; no exports or compute dispatch.
PLAN: 25.8 square layered island, ground .1. Rear canopy envelope X -11..0,
Z -9..-1, crown 7.0; exposed armillary centered (0,0), diameter 4.6.
ASSEMBLY CLEARING: X 2..10, Z 4..11 is unoccupied, surface .1.
Four 5-wide edge approaches feed stone lanes. Tallest ribs face away from
positive-X/positive-Z camera. Brass circles and a scalloped pale canopy form
the neighborhood silhouette. Reusable selection: component_* instrument.
Materials: 11, texture-free. All curves use four-sided section; no subdivision.
"""
import math
reset_scene('Sky Workshop')
soil=material('Warm workshop gravel',(.43,.43,.32))
edge=material('Weathered island stone',(.38,.40,.34))
stone=material('Warm cut limestone',(.64,.65,.53))
wood=material('Smoked oak',(.23,.14,.075))
cut=material('Fresh oak end grain',(.49,.31,.15))
roof=material('Linen copper washed canopy',(.65,.72,.66))
brass=material('Aged brass',(.56,.37,.105),.36,.65)
patina=material('Verdigris',(.12,.38,.34),.7,.25)
iron=material('Forged charcoal iron',(.10,.13,.14),.5,.5)
paper=material('Ivory plan rolls',(.83,.77,.59))
leaf=material('Dusty sage',(.32,.44,.31))
cube('Island foundation',(0,-.6,0),(25.8,1.2,25.8),edge)
cube('Soil inset',(0,-.04,0),(25.5,.28,25.5),soil)
# The front-right assembly yard remains genuinely flat and empty.
for axis in range(2):
    for i in range(-10,11):
        p=i*1.18
        cube('Gateway paving',((p if axis==0 else 0),.12,(0 if axis==0 else p)),(1.12,.07,2.5) if axis==0 else (2.5,.07,1.12),stone)
for i in range(18):
    for z in (-12.65,12.65):
        x=-12.1+i*1.42
        if abs(x)>2.6: cube('Foundation coping',(x,.04,z),(1.32,.26,.35),stone)
    for x in (-12.65,12.65):
        z=-12.1+i*1.42
        if abs(z)>2.6: cube('Foundation coping',(x,.04,z),(.35,.26,1.32),stone)
# Broad rear floorboards; open front and visible bracing.
for i in range(29):
    cube('Workshop deck board',(-5.5,.29,-8.6+i*.26),(10.4,.18,.235),cut if i%7==0 else wood)
for x in (-10.3,-5.5,-.7):
    for z in (-8.4,-1.5):
        cube('Post stone shoe',(x,.35,z),(.65,.55,.65),stone,.05)
        beam('Canopy oak post',(x,.55,z),(x,4.8,z),.23,wood)
        for dx in (-.8,.8):
            if -11<x+dx<0:
                beam('Knee brace',(x,3.75,z),(x+dx,4.7,z),.17,wood)
        cube('Brass post collar',(x,1,z),(.29,.12,.29),brass)
# Curved barrel-like roof rises at the back; each panel has real thickness.
def profile(t):
    return (-9+8*t,4.8+2.15*math.sin(math.pi*t*.92))
for rib in range(12):
    x=-10.8+rib*.96
    pts=[(x,profile(j/16)[1],profile(j/16)[0]) for j in range(17)]
    curve('Laminated curved oak rib',pts,.105,wood)
    if rib<11:
        for j in range(16):
            z0,y0=profile(j/16);z1,y1=profile((j+1)/16)
            verts=[(x+.06,y0+.10,z0),(x+.9,y0+.10,z0),(x+.9,y1+.10,z1),(x+.06,y1+.10,z1)]
            verts += [(a,b-.07,c) for a,b,c in verts]
            mesh('Hand folded canopy panel',verts,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],roof if j%5 else patina)
for j in (0,4,8,12,16):
    z,y=profile(j/16)
    beam('Roof purlin',(-11,y-.08,z),(-.15,y-.08,z),.15,cut)
for x in (-10.85,-.2):
    curve('Brass edge flashing',[(x,profile(j/24)[1]+.17,profile(j/24)[0]) for j in range(25)],.065,brass)
# Mechanical bench, drawers, rolled plans, and weighted hoist.
cube('Workbench top',(-6,1.6,-3.7),(5,.18,1.5),cut,.045)
for x in (-8,-4):
    for z in (-4.2,-3.2): beam('Workbench leg',(x,.4,z),(x,1.5,z),.16,wood)
for i in range(5):
    cube('Tool drawer',(-7.9+i*.96,1.28,-3.4),(.86,.34,.66),wood,.025)
    beam('Drawer brass pull',(-8.08+i*.96,1.29,-3.03),(-7.72+i*.96,1.29,-3.03),.045,brass)
for i in range(4):
    cylinder('Rolled star chart',(-7+i*.6,1.78,-3.75),.095,.9,paper,12,(math.pi/2,0,0))
cube('Open star chart',(-4.75,1.71,-3.7),(.85,.018,.94),paper)
for i in range(5):
    beam('Drafting line',(-5.05,1.725,-4+i*.14),(-4.5,1.725,-4+i*.14),.012,brass)
beam('Hoist arm',(-1.0,4.5,-4),(.4,4.5,-4),.18,wood)
curve('Hanging chain',[(.3,4.5,-4),(.3,2.1,-4)],.025,iron)
cylinder('Hoist counterweight',(.3,1.8,-4),.27,.55,iron)
# Armillary: every reusable piece carries the prefix. Low-poly articulated rings.
cylinder('component_plinth',(0,.3,0),1.55,.4,stone,20)
cylinder('component_turned_foot',(0,.6,0),.95,.24,patina,20)
cylinder('component_pedestal',(0,1.05,0),.38,.8,brass,16)
cylinder('component_pedestal_collar',(0,1.45,0),.55,.16,iron,20)
for angle in (0,2*math.pi/3,4*math.pi/3):
    beam('component_tripod',(math.cos(angle)*1.25,.5,math.sin(angle)*1.25),(0,1.65,0),.14,patina)
center=(0,3.55,0)
for k,tilt in enumerate((0,.65,-.70)):
    r=2.02-k*.19
    pts=[]
    for i in range(65):
        a=math.tau*i/64
        xx=r*math.cos(a); yy=r*math.sin(a)
        pts.append((xx,center[1]+yy*math.cos(tilt),yy*math.sin(tilt)))
    curve('component_meridian_'+str(k),pts,.065 if k else .10,brass)
# Horizontal equator is exposed to the approaching viewer.
curve('component_equator',[(2.12*math.cos(math.tau*i/64),3.55,2.12*math.sin(math.tau*i/64)) for i in range(65)],.085,patina)
for i in range(32):
    a=math.tau*i/32
    beam('component_degree_tick',(2.01*math.cos(a),3.56,2.01*math.sin(a)),((2.23 if i%4==0 else 2.16)*math.cos(a),3.56,(2.23 if i%4==0 else 2.16)*math.sin(a)),.035,brass)
beam('component_polar_axle',(-.4,1.62,-.7),(.4,5.48,.7),.085,iron)
sphere('component_celestial_globe',(0,3.55,0),(.57,.57,.57),patina,20,10)
for i in range(3):
    a=i*math.pi/3
    curve('component_globe_meridian',[(.586*math.cos(math.tau*j/32)*math.cos(a),3.55+.586*math.sin(math.tau*j/32),.586*math.cos(math.tau*j/32)*math.sin(a)) for j in range(33)],.016,brass)
sphere('component_north_finial',(.4,5.55,.7),(.15,.15,.15),brass)
# Sparse planted perimeter and stacks of instrument blanks.
for x,z in ((-10,8),(-10,10),(9,-9),(11,-9)):
    cylinder('Sage planter',(x,.38,z),.6,.55,stone)
    tree('Sage bush',(x,.65,z),1.4,wood,leaf,.55)
for i in range(6): cube('Stored oak beam',(-8,.22+i*.18,1.95),(3.2,.15,.22),cut)
# Strengthen the instrument as the foreground hero without adding mesh cost.
# Component origin stays fixed for predictable independent reuse.
for obj in list(bpy.context.scene.objects):
    if obj.name.startswith('component_'):
        obj.location *= 1.19
        obj.scale *= 1.19
# The craft garden fills the left foreground while keeping the opposite assembly
# clearing entirely available. Its low stone terraces reveal the island strata.
for tier in range(3):
    cube('Craft garden terraced footing',(-7.5,.20+tier*.21,7.6),(7.8-tier*.5,.21,7.3-tier*.5),edge if tier==0 else stone)
cube('Craft garden gravel inset',(-7.5,.74,7.6),(6.5,.04,6.0),soil)
for row in range(6):
    cube('Terrace approach stone',(-3.5-row*.22,.18+row*.085,5.5),(.52,.17,2.0),stone)
# Warm, low work island: a drafted brass wheel is being assembled on it.
for x in (-9.2,-6.2):
    for z in (6.2,7.8): beam('Garden assembly table leg',(x,.75,z),(x,1.58,z),.18,wood)
cube('Garden assembly table',(-7.7,1.7,7),(3.65,.21,2.1),cut,.045)
for rr in (.65,.9):
    curve('Unfinished brass wheel', [(-7.7+rr*math.cos(math.tau*j/40),1.85,7+rr*math.sin(math.tau*j/40)) for j in range(41)],.055,brass)
for j in range(12):
    a=math.tau*j/12
    beam('Wheel spoke',(-7.7,1.85,7),(-7.7+.86*math.cos(a),1.85,7+.86*math.sin(a)),.055,wood)
cylinder('Wheel hub',(-7.7,1.9,7),.19,.16,patina,16)
# Companion seat and rack carry large, legible blanks rather than tiny scatter.
for x in (-9.3,-6.1): cube('Garden bench support',(x,.99,9),(.34,.5,.6),edge)
cube('Garden bench plank',(-7.7,1.29,9),(3.9,.18,.75),wood,.04)
for j in range(4):
    cube('Long timber stock',(-8,.93+j*.17,10),(5,.14,.3),cut if j%2 else wood)
for x in (-10.3,-4.9):
    cube('Terrace planted pocket',(x,.97,9.25),(.78,.46,2.55),edge,.025)
    for z in (8.5,9.25,10):
        sphere('Sage hedge cushion',(x,1.45,z),(.46,.55,.5),leaf,10,5)
# Rear-right instrument garden uses two broad steps and an aiming telescope;
# this balances the canopy without competing with its height or blocking paths.
for i in range(2):
    cube('Survey terrace',(7.8,.22+i*.23,-6.8),(7.6-i*.6,.24,7.8-i*.6),stone if i else edge)
for i in range(7):
    cube('Survey terrace slab seam',(5.0+i*.85,.59,-6.8),(.79,.035,6.2),stone)
for i in range(3):
    cube('Survey terrace front step',(7.2,.16+i*.11,-2.5-i*.31),(3.2,.15,.48),stone)
cylinder('Survey instrument stone base',(7.2,.78,-6.6),1.3,.36,edge,20)
for a in (0,math.tau/3,math.tau*2/3):
    beam('Survey telescope tripod',(7.2+math.cos(a),.97,-6.6+math.sin(a)),(7.2,2.9,-6.6),.13,wood)
cylinder('Survey telescope bearing',(7.2,2.95,-6.6),.30,.28,brass,16)
beam('Survey telescope brass tube',(6.3,2.96,-5.9),(8.4,3.7,-7.55),.45,brass)
beam('Survey telescope dark aperture',(8.36,3.69,-7.52),(8.46,3.73,-7.60),.50,iron)
for i in range(3):
    cube('Instrument transport chest',(10,.88+i*.34,-4.7),(1.25,.29,1.2),wood,.02)
    for xx in (9.62,10.38): cube('Chest brass strap',(xx,.89+i*.34,-4.69),(.045,.31,1.23),brass)
for z in (-9.7,-8.8,-7.9):
    cube('Rear planter stone wall',(10.4,.97,z),(.78,.7,.82),edge)
    sphere('Rear sage planting',(10.4,1.61,z),(.55,.55,.57),leaf,10,5)
# Continuous stone courses articulate the front island edge in actual daylight.
for i in range(18):
    p=-12.05+i*1.42
    cube('Exposed front foundation ashlar',(p,-.61,12.81),(1.35,.38,.16),stone if i%3==0 else edge)
    cube('Exposed side foundation ashlar',(12.81,-.61,p),(.16,.38,1.35),stone if i%3==0 else edge)
finish_scene()
