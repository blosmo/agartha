"""Common Future — rain-washed tea pavilion with a sweeping teal roof.
Rear hero X -11.5..-.5, Z -9..-1, eaves 4.6, ridge cap 6.5. Tea courtyard
spills toward center; front-right X 2..10, Z 3..11 stays flat at Y .1.
Five-wide gateway zones stay open. Positive-X/positive-Z view sees the table
through the open pavilion. Roof is teal, open corners lift visibly, pale
flowering tree is the western counterweight. component_* is table/service.
11 materials, no image textures, deterministic polygon roof tiles.
"""
import math
reset_scene('Common Future')
earth=material('Rain darkened earth',(.30,.36,.31))
stone=material('Blue grey border stone',(.42,.49,.48))
pale=material('Pale courtyard limestone',(.68,.72,.64))
wood=material('Rain washed cedar',(.34,.25,.17))
end=material('Cedar cut end',(.53,.39,.24))
teal=material('Deep teal ceramic',(.075,.30,.30),.43)
tilelight=material('Glazed teal tile variation',(.12,.40,.37),.4)
brass=material('Weathered brass',(.50,.39,.20),.43,.55)
porcelain=material('Ivory tea porcelain',(.84,.84,.71),.28)
leaf=material('Sage foliage',(.39,.53,.39))
flower=material('Pale flowering petals',(.88,.82,.69))
cube('Layered island',(0,-.6,0),(25.8,1.2,25.8),stone)
cube('Garden ground',(0,-.04,0),(25.5,.28,25.5),earth)
for axis in (0,1):
    for i in range(-10,11):
        if abs(i)<=1: continue  # One plaza replaces the crossing courses.
        p=i*1.18
        cube('Gateway paver',((p if axis==0 else 0),.13,(0 if axis==0 else p)),(1.12,.06,2.5) if axis==0 else (2.5,.06,1.12),pale)
cube('Unbroken tea courtyard crossing',(0,.13,0),(3.48,.06,3.48),pale)
# Stone perimeter has interrupted five-unit entries.
for edgeaxis in (0,1):
    for side in (-1,1):
        for i in range(-8,9):
            u=i*1.47
            if abs(u)<2.6: continue
            pos=(u,.14,side*12.55) if edgeaxis==0 else (side*12.55,.14,u)
            cube('Low border coping',pos,(1.37,.27,.44) if edgeaxis==0 else (.44,.27,1.37),pale,.025)
# Pavilion floor floats one low step above a smaller broad terrace.
cube('Terrace stone footing',(-6,.29,-5),(10.3,.38,7.4),stone,.055)
for row in range(26): cube('Deck cedar board',(-6,.53,-8.48+row*.27),(10,.12,.247),end if row%6==0 else wood)
for i in range(3): cube('Tea terrace step',(-5,.17+i*.105,-.45-i*.3),(6.4,.14,.42),pale,.025)
for x in (-10.4,-6,-1.6):
    for z in (-8,-2):
        cube('Post stone shoe',(x,.75,z),(.62,.43,.62),pale,.04)
        beam('Cedar pavilion post',(x,.86,z),(x,4.45,z),.21,wood)
        cube('Post brass foot band',(x,1,z),(.255,.16,.255),brass)
        for dx in (-.75,.75): beam('Mortised diagonal bracket',(x,3.53,z),(x+dx,4.31,z),.16,wood)
        for dz in (-.55,.55): beam('Cross bracket',(x,3.9,z),(x,4.38,z+dz),.13,end)
for z in (-8,-2): beam('Long pavilion lintel',(-10.75,4.4,z),(-1.25,4.4,z),.24,wood)
# Gentle upturned eaves and raised ridge; quadrilateral strips retain a thin edge.
def roof_y(x,z):
    cross=abs((z+5)/4.0)
    longitudinal=abs((x+6)/5.5)
    return 5.95-1.9*cross+.55*cross**4+.32*longitudinal**6
for row in range(18):
    z0=-9+row*8/18;z1=z0+8/18-.025
    for col in range(22):
        x0=-11.5+col*11/22;x1=x0+11/22-.022
        vs=[(x0,roof_y(x0,z0),z0),(x1,roof_y(x1,z0),z0),(x1,roof_y(x1,z1),z1),(x0,roof_y(x0,z1),z1)]
        vs += [(a,b-.075,c) for a,b,c in vs]
        mesh('Individual glazed roof tile',vs,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],tilelight if (col+row*3)%7==0 else teal)
for col in range(12):
    x=-11.4+col*.98
    curve('Exposed curved roof rafter',[(x,roof_y(x,-9+i*.5)-.18,-9+i*.5) for i in range(17)],.075,wood)
for z in (-9,-1):
    curve('Raised edge tile',[(x,roof_y(x,z)+.05,z) for x in [-11.5+i*.275 for i in range(41)]],.11,teal)
for x in (-11.5,-.5):
    curve('Curved cedar bargeboard',[(x,roof_y(x,-9+i*.25)-.04,-9+i*.25) for i in range(33)],.105,end)
curve('Glazed ridge cap',[(x,roof_y(x,-5)+.12,-5) for x in [-11.5+i*.275 for i in range(41)]],.14,tilelight)
# Tea table is independently reusable, with engraved radial invitation motif.
for x in (-7.4,-4.6):
    for z in (-5.7,-4.3):
        beam('component_table_leg',(x,.62,z),(x,1.49,z),.16,wood)
        cube('component_leg_collar',(x,.82,z),(.185,.085,.185),brass)
beam('component_low_stretcher',(-7.4,.95,-5),(-4.6,.95,-5),.13,wood)
cube('component_tea_table',(-6,1.6,-5),(3.5,.2,2.1),end,.065)
for z in (-5.88,-4.12): beam('component_table_inlay',(-7.55,1.706,z),(-4.45,1.706,z),.022,brass)
curve('component_engraved_circle',[(-6+.48*math.cos(math.tau*i/40),1.707,-5+.48*math.sin(math.tau*i/40)) for i in range(41)],.012,wood)
for i in range(12):
    a=math.tau*i/12
    beam('component_engraved_ray',(-6+.5*math.cos(a),1.707,-5+.5*math.sin(a)),(-6+.62*math.cos(a),1.707,-5+.62*math.sin(a)),.013,wood)
cylinder('component_tea_tray',(-5.9,1.735,-5),.74,.055,wood,24)
sphere('component_teapot',(-5.85,1.98,-5),(.30,.25,.27),porcelain,16,8)
cylinder('component_pot_lid',(-5.85,2.22,-5),.18,.05,teal,16)
sphere('component_lid_knob',(-5.85,2.28,-5),(.065,.05,.065),brass)
curve('component_teapot_handle',[(-6.09,1.94,-5),(-6.32,1.91,-5),(-6.38,2.12,-5),(-6.13,2.16,-5)],.05,teal)
curve('component_teapot_spout',[(-5.60,1.95,-5),(-5.40,2.04,-5),(-5.33,2.17,-5)],.065,porcelain)
for x,z in ((-6.6,-5.4),(-6.6,-4.6),(-5.25,-5.45),(-5.25,-4.55)):
    cylinder('component_cup_saucer',(x,1.745,z),.18,.035,teal,16)
    cylinder('component_tea_cup',(x,1.83,z),.12,.15,porcelain,16)
    cylinder('component_tea_surface',(x,1.91,z),.093,.008,wood,16)
    curve('component_cup_rim',[(x+.118*math.cos(math.tau*i/16),1.91,z+.118*math.sin(math.tau*i/16)) for i in range(17)],.015,porcelain)
# Matching benches, suspended slatted lanterns, and a tea preparation shelf.
for z in (-6.6,-3.4):
    cube('Gathering bench',(-6,1.03,z),(4.1,.17,.58),wood,.045)
    for x in (-7.65,-4.35): cube('Bench foot',(x,.76,z),(.22,.5,.48),stone,.025)
for x in (-9.6,-2.4):
    curve('Lantern chain',[(x,4.4,-2),(x,3.55,-2)],.025,brass)
    for y in (2.85,3.52): cube('Lantern frame cap',(x,y,-2),(.64,.10,.64),wood,.02)
    cube('Lantern ivory shade',(x,3.18,-2),(.48,.56,.48),porcelain)
    for dx in (-.28,.28):
        for dz in (-.28,.28): beam('Lantern frame slat',(x+dx,2.88,-2+dz),(x+dx,3.5,-2+dz),.045,wood)
cube('Tea shelf',(-9.55,1.7,-6.6),(1.35,.13,2.1),end,.025)
for z in (-7.45,-5.75): cube('Tea shelf leg',(-9.55,1.1,z),(.9,1.1,.15),wood)
for i in range(3): cylinder('Tea storage jar',(-9.55,1.97,-7.2+i*.58),.20,.4,teal,16)
# Low sculptural planting is outside all reserved ground and edge approaches.
tree('Flowering courtyard tree',(-10,.1,4),4.1,wood,leaf,1.5)
for i in range(16):
    a=i*2.39996
    r=.45+(.7*(i%4)/3)
    sphere('Pale blossom cluster',(-10+r*math.cos(a),3.2+.65*math.sin(i*1.4),4+r*math.sin(a)),(.29,.23,.29),flower,8,4)
for x,z in ((7,-8),(9,-9),(-8,9)):
    cylinder('Garden basin',(x,.29,z),.67,.36,stone,16)
    tree('Garden shrub',(x,.46,z),1.25,wood,leaf,.56)
# A quiet rain garden occupies the left-front quadrant, leaving the entire
# opposite X 2..10 / Z 3..11 clearing untouched. Low water gives the roof a
# companion horizontal shape; two viewing seats invite use of the courtyard.
cube('Rain garden terrace',(-6.3,.16,7.3),(7.4,.16,7.2),stone)
cube('Rain garden gravel',(-6.3,.252,7.3),(7.1,.025,6.85),earth)
cube('Rain basin dark lining',(-6.6,.28,7.7),(4.8,.09,3.4),stone)
cube('Rain basin teal water',(-6.6,.335,7.7),(4.34,.02,2.94),teal)
for z in (5.99,9.41):
    cube('Rain basin long coping',(-6.6,.41,z),(5.1,.23,.28),pale,.025)
for x in (-9.01,-4.19):
    cube('Rain basin end coping',(x,.41,7.7),(.28,.23,3.15),pale,.025)
# One shallow inlet cascade is readable at landscape scale.
cube('Rainwater inlet pedestal',(-9.25,.64,7.2),(.6,.73,.75),stone)
cube('Rainwater copper channel',(-8.96,.94,7.2),(1.05,.12,.25),brass)
cube('Rainwater falling sheet',(-8.46,.64,7.2),(.03,.57,.20),tilelight)
for x in (-7.5,-5.7):
    cube('Rain garden seat slab',(x,.78,4.6),(1.55,.19,.68),wood,.035)
    for xx in (x-.5,x+.5): cube('Rain garden seat foot',(xx,.5,4.6),(.22,.47,.51),stone)
for i in range(4): cube('Rain garden approach step',(-3.1,.2,2.5+i*.58),(.9,.13,.48),pale)
for i in range(6): cube('Rain garden rear stepping stone',(-9+i*.87,.30,10.25),(.71,.08,.72),pale)
# Structured reed clumps grow only in the planted strip, not scattered on paths.
for x in (-9.45,-3.2):
    cube('Reed bed border',(x,.42,8.7),(.56,.32,1.6),stone)
    for j in range(5):
        z=8.11+j*.27
        beam('Rain garden reed',(x,.58,z),(x+(.16 if j%2 else -.16),1.25+(j%3)*.15,z+.06),.04,leaf)
        sphere('Reed seed head',(x+(.16 if j%2 else -.16),1.29+(j%3)*.15,z+.06),(.075,.16,.075),flower,6,3)
finish_scene()
