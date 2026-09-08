"""Open Ground — an open compass lawn enclosed by low, patterned garden edges.
Exec after starter_kit.py. component_ exports one useful curved garden bench.
"""
# Refinement plan: trim perimeter masonry before all four corners, close each with a single non-overlapping cap. Add three low formal parterre beds around the existing arcs, with clipped inset planting and geometric paths; preserve X 3..11, Z 3..11 lawn and all gateways.
import math

reset_scene('Open Ground')
o_grass=material('Ground / garden green','#819777')
o_earth=material('Ground / foundation earth','#575448')
o_stone=material('Ground / ivory limestone','#C9C5AF')
o_cut=material('Ground / cut edges','#E1DCC5')
o_dark=material('Ground / slate inlay','#626F69')
o_wood=material('Ground / weathered oak','#9E8461')
o_brass=material('Ground / compass bronze','#A99359',metallic=.5,roughness=.48)
o_leaf=material('Ground / clipped herbs','#5D7650')
o_silver=material('Ground / silver sage','#A0AA8D')
o_flower=material('Ground / cream blossom','#E9DDBB')

cube('garden foundation',(0,-.29,0),(25.8,.58,25.8),o_earth)
cube('usable lawn',(0,.06,0),(25.8,.08,25.8),o_grass)
# Four clear edge entrances lead straight to the low meeting stone.
for axis in range(2):
    for i in range(22):
        d=-12.32+i*1.173
        if abs(d)<2.3:
            continue
        for side in (-1,1):
            loc=(d,.12,side*.48) if axis==0 else (side*.48,.12,d)
            cube('cross path %d %d %d'%(axis,i,side),loc,(1.105,.04,.89) if axis==0 else (.89,.04,1.105),o_stone)
        for side in (-1,1):
            loc=(d,.145,side*1.01) if axis==0 else (side*1.01,.145,d)
            cube('path dark stitch %d %d %d'%(axis,i,side),loc,(.4,.025,.055) if axis==0 else (.055,.025,.4),o_dark)
# Compact compass plaza is a low-scale communal focus, never a tall hero.
cylinder('compass plaza bed',(0,.14,0),2.48,.08,o_dark,vertices=64)
cylinder('compass pale disk',(0,.188,0),2.34,.035,o_stone,vertices=64)
for j in range(16):
    a=j*math.tau/16
    b=a+.05
    r=2.12 if j%4==0 else 1.78
    mesh('compass directional inlay %02d'%j,[(0,.21,0),(r*math.cos(a),.21,r*math.sin(a)),(.68*math.cos(a+b),.21,.68*math.sin(a+b))],[(0,2,1)],o_brass if j%4==0 else o_dark)
for i in range(64):
    a=i*math.tau/64
    b=(i+1)*math.tau/64
    beam('compass inset ring %02d'%i,(2.2*math.cos(a),.218,2.2*math.sin(a)),(2.2*math.cos(b),.218,2.2*math.sin(b)),.045,o_brass)
cylinder('meeting stone recessed foot',(0,.33,0),.84,.26,o_dark,vertices=12)
cylinder('meeting stone shared table',(0,.68,0),1.06,.45,o_stone,vertices=12)
cylinder('meeting stone honed top',(0,.917,0),1.01,.034,o_cut,vertices=12)
for j in range(8):
    a=j*math.tau/8
    beam('table compass engraving '+str(j),(.25*math.cos(a),.938,.25*math.sin(a)),(.78*math.cos(a),.938,.78*math.sin(a)),.024,o_brass)
# Low garden borders have visible recessed courses and wider coping stones.
# Geometry at the positive-positive corner stays outside the 3..11 building lawn.
for edge in range(4):
    for sign in (-1,1):
        for j in range(10):
            d=sign*(3.12+j*.898)
            x,z=(d,12.05) if edge==0 else (d,-12.05) if edge==1 else (12.05,d) if edge==2 else (-12.05,d)
            long=(.93,.23,.5) if edge<2 else (.5,.23,.93)
            cube('boundary lower course %d %d %d'%(edge,sign,j),(x,.24,z),long,o_dark)
            cube('boundary limestone course %d %d %d'%(edge,sign,j),(x,.45,z),long,o_stone)
            cube('boundary pale coping %d %d %d'%(edge,sign,j),(x,.6,z),(.965,.09,.62) if edge<2 else (.62,.09,.965),o_cut)
# A single square corner stack closes each pair of runs without overlapping faces.
for x in (-12.05,12.05):
    for z in (-12.05,12.05):
        cube('corner dark foot %.2f %.2f'%(x,z),(x,.24,z),(.62,.23,.62),o_dark)
        cube('corner limestone %.2f %.2f'%(x,z),(x,.45,z),(.62,.23,.62),o_stone)
        cube('single corner coping %.2f %.2f'%(x,z),(x,.6,z),(.7,.09,.7),o_cut)
# Curved bench assemblies face the center, fitted with radiating timber slats.
for bench,(start,end) in enumerate(((111,153),(201,243),(291,333))):
    prefix='component_' if bench==0 else 'garden_%d_'%bench
    for j in range(34):
        a=math.radians(start+(end-start)*(j+.5)/34)
        for radius in (9.8,10.45):
            if j%12==0:
                cylinder(prefix+'stone bench leg %02d %.2f'%(j,radius),(radius*math.cos(a),.4,radius*math.sin(a)),.17,.6,o_dark,vertices=8)
        beam(prefix+'radial seat slat %02d'%j,(9.55*math.cos(a),.77,9.55*math.sin(a)),(10.72*math.cos(a),.77,10.72*math.sin(a)),.17,o_wood,depth=.13,bevel=.015)
    for radius in (9.68,10.57):
        for j in range(28):
            a=math.radians(start+(end-start)*j/28)
            b=math.radians(start+(end-start)*(j+1)/28)
            beam(prefix+'curved apron %.2f %02d'%(radius,j),(radius*math.cos(a),.6,radius*math.sin(a)),(radius*math.cos(b),.6,radius*math.sin(b)),.12,o_dark,depth=.18)
# Rhythmic clipped planting is a formal border, not scattered decorative clutter.
for edge in range(4):
    for sign in (-1,1):
        for j in range(4):
            d=sign*(4+j*2)
            x,z=(d,11.58) if edge==0 else (d,-11.58) if edge==1 else (11.58,d) if edge==2 else (-11.58,d)
            sphere('clipped sage %d %d %d'%(edge,sign,j),(x,.38,z),(.58,.26,.32) if edge<2 else (.32,.26,.58),o_leaf if j%2 else o_silver,segments=12,rings=6)
            # Simple broad blossom fans remain large enough to read at garden scale.
            for petal in range(5):
                a=petal*math.tau/5
                mesh('border bloom %d %d %d %d'%(edge,sign,j,petal),[(x,.65,z),(x+.18*math.cos(a-.4),.69,z+.18*math.sin(a-.4)),(x+.26*math.cos(a),.64,z+.26*math.sin(a)),(x+.18*math.cos(a+.4),.69,z+.18*math.sin(a+.4))],[(3,2,1,0)],o_flower)
# Paired low entrance markers sit outside each five-unit approach opening.
for x in (-2.8,2.8):
    cube('south entrance marker '+str(x),(x,.44,11.95),(.45,.68,.5),o_stone,bevel=.035)
    cube('entrance bronze cap '+str(x),(x,.79,11.95),(.47,.04,.52),o_brass,bevel=.01)
# Three inset parterres make the broad lawns read as an intentional formal garden.
# Positive X/positive Z stays available for a future community pavilion.
for bed,(x,z) in enumerate(((-5.5,-5.5),(-5.5,5.5),(5.5,-5.5))):
    cylinder('parterre stone disk '+str(bed),(x,.145,z),2.28,.08,o_stone,vertices=40)
    cylinder('parterre dark inset '+str(bed),(x,.194,z),2.08,.018,o_dark,vertices=40)
    for quadrant in range(4):
        a=quadrant*math.pi/2+.07
        b=(quadrant+1)*math.pi/2-.07
        vertices=[(x,.22,z)]+[(x+1.95*math.cos(a+(b-a)*i/8),.22,z+1.95*math.sin(a+(b-a)*i/8)) for i in range(9)]
        mesh('parterre herb quadrant %d %d'%(bed,quadrant),vertices,[(0,i+2,i+1) for i in range(8)],o_leaf if quadrant%2 else o_silver)
    cylinder('parterre low central herb '+str(bed),(x,.33,z),.5,.2,o_leaf,vertices=12)
finish_scene()
