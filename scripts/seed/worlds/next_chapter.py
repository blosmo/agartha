"""The Next Chapter — a partial fan roof and a deliberately unfinished reading bay.
Exec after starter_kit.py; component_ selects a reading bench with book cart.
"""
# Refinement plan: replace overlapping crossing pavers with one fitted central junction. Add a three-tier, open curved reading amphitheater centered at (-6,6), radius at most 4, height below .8. Preserve the future reading-bay clearing X 2..11, Z 2..11.
import math

reset_scene('The Next Chapter')
n_grass=material('Chapter / sage lawn','#7D9175')
n_earth=material('Chapter / dark earth','#514C41')
n_stone=material('Chapter / parchment limestone','#CDC6AE')
n_darkstone=material('Chapter / recessed stone','#8B8B7B')
n_wood=material('Chapter / warm oak','#A78050')
n_darkwood=material('Chapter / endgrain','#654D37')
n_roof=material('Chapter / muted jade roof','#567E79')
n_brass=material('Chapter / aged brass','#B19A65',metallic=.5,roughness=.45)
n_book=material('Chapter / oxblood bookcloth','#864D46')
n_paper=material('Chapter / paper edges','#E7D9B8')
n_leaf=material('Chapter / olive foliage','#657E54')

cube('soil block',(0,-.29,0),(25.8,.58,25.8),n_earth)
cube('open lawn',(0,.06,0),(25.8,.08,25.8),n_grass)
for axis in range(2):
    for i in range(20):
        p=-12.25+i*(24.5/19)
        if abs(p)<1.3:
            continue
        cube('gateway path %d %d'%(axis,i),(p,.12,0) if axis==0 else (0,.12,p),(1.19,.04,1.6) if axis==0 else (1.6,.04,1.19),n_stone,bevel=.025)
cube('single fitted crossing',(0,.12,0),(2.6,.04,2.6),n_stone,bevel=.025)
# The radial building opens toward positive X/Z, leaving the front-right lawn intact.
cx,cz=-5,-3.4
for ring,(r0,r1,y,mat) in enumerate(((0,5.75,.17,n_darkstone),(0,5.6,.27,n_stone))):
    verts=[(cx,y,cz)]+[(cx+r1*math.cos(math.radians(155+i*190/48)),y,cz+r1*math.sin(math.radians(155+i*190/48))) for i in range(49)]
    mesh('fan terrace '+str(ring),verts,[(0,i+2,i+1) for i in range(48)],mat)
# Deck is thin radial strips, with seams and a raised visible rim.
for i in range(48):
    a=math.radians(155+i*190/48+.2)
    b=math.radians(155+(i+1)*190/48-.2)
    verts=[(cx+r*math.cos(t),y,cz+r*math.sin(t)) for y in (.2,.29) for r,t in ((.65,a),(5.45,a),(5.45,b),(.65,b))]
    mesh('oak fan flooring %02d'%i,verts,[(1,2,3,0),(7,6,5,4),(4,5,1,0),(5,6,2,1),(6,7,3,2),(7,4,0,3)],n_wood)
# Every rib is a visibly assembled bent beam. The last two bays intentionally lack roof panels.
for j in range(12):
    a=math.radians(155+j*190/11)
    points=[(cx+r*math.cos(a),5.7-.045*r*r,cz+r*math.sin(a)) for r in [0.65+k*.49 for k in range(11)]]
    for k in range(10):
        beam('fan roof rib %02d segment %02d'%(j,k),points[k],points[k+1],.16,n_darkwood,depth=.22)
    end=points[-1]
    if j%2==0 or j==11:
        beam('outer oak post %02d'%j,(end[0],.3,end[2]),end,.19,n_wood,bevel=.02)
        cylinder('stone post shoe %02d'%j,(end[0],.4,end[2]),.23,.24,n_darkstone,vertices=8)
        beam('post knee brace %02d'%j,(end[0],end[1]-1,end[2]),points[-3],.13,n_darkwood)
    if j<9:
        b=math.radians(155+(j+1)*190/11)
        for k in range(13):
            r0=.7+k*.37
            r1=r0+.345
            verts=[(cx+r*math.cos(t),5.75-.045*r*r,cz+r*math.sin(t)) for r,t in ((r0,a),(r1,a),(r1,b),(r0,b))]
            mesh('finished roof shingle %02d %02d'%(j,k),verts,[(3,2,1,0)],n_roof)
# Concentric roof purlins bridge the rib structure, exposed over the unfinished bay.
for r in (1.2,2.65,4.15,5.4):
    for j in range(44):
        a=math.radians(155+j*190/44)
        b=math.radians(155+(j+1)*190/44)
        beam('roof purlin %.2f %02d'%(r,j),(cx+r*math.cos(a),5.61-.045*r*r,cz+r*math.sin(a)),(cx+r*math.cos(b),5.61-.045*r*r,cz+r*math.sin(b)),.095,n_wood)
# Library bays follow the back arc; rows contain deliberate cloth-bound volumes.
for bay in range(5):
    a=math.radians(176+bay*25)
    center=(cx+4.8*math.cos(a),cz+4.8*math.sin(a))
    tangent=(-math.sin(a),math.cos(a))
    def bp(u,y,radial=0):
        return (center[0]+tangent[0]*u+math.cos(a)*radial,y,center[1]+tangent[1]*u+math.sin(a)*radial)
    for side in (-.86,.86):
        beam('shelf upright %d %.1f'%(bay,side),bp(side,.3),bp(side,2.85),.12,n_darkwood,depth=.35)
    for row in range(4):
        y=.57+row*.58
        beam('library shelf %d %d'%(bay,row),bp(-.88,y),bp(.88,y),.1,n_wood,depth=.43)
        for book in range(8):
            u=-.72+book*.2
            h=.32+(book%3)*.055
            # Beams orient a rectangular book along its vertical spine; all pages share paper material.
            obj=cube('book %d %d %d'%(bay,row,book),bp(u,y+h/2+.06),(.155,h,.28),n_book if book%3 else n_roof)
            obj.rotation_euler[2]=-a
            obj=cube('page block %d %d %d'%(bay,row,book),bp(u,y+h/2+.06,-.022),(.12,h-.035,.28),n_paper)
            obj.rotation_euler[2]=-a
# Reusable bench and cart occupy the sheltered front lip.
for i in range(7):
    cube('component_reading bench slat '+str(i),(-5,.9,-2.4+i*.09),(2.9,.1,.075),n_wood,bevel=.013)
for x in (-6.1,-3.9):
    cube('component_reading bench leg '+str(x),(x,.6,-2.13),(.15,.55,.57),n_darkwood,bevel=.018)
    beam('component_reading bench back post '+str(x),(x,.55,-2.48),(x,1.6,-2.62),.12,n_darkwood)
for y in (1.15,1.4,1.62):
    beam('component_reading bench back '+str(y),(-6.45,y,-2.56),(-3.55,y,-2.56),.13,n_wood)
for y in (.52,1.1):
    cube('component_bookcart tray '+str(y),(-2.55,y,-3.12),(.9,.09,.6),n_wood,bevel=.02)
for x in (-2.94,-2.16):
    for z in (-3.37,-2.87):
        beam('component_bookcart upright %.2f %.2f'%(x,z),(x,.36,z),(x,1.32,z),.065,n_brass)
        sphere('component_bookcart wheel %.2f %.2f'%(x,z),(x,.35,z),(.105,.105,.065),n_darkwood,segments=12,rings=6)
for i in range(4):
    cube('component_bookcart stacked volume '+str(i),(-2.55,1.2+i*.075,-3.12),(.6,.06,.4),n_book if i%2 else n_roof,bevel=.009)
# Unfinished work is legible as building materials aligned with the unroofed bay.
for i in range(6):
    cube('future bay stacked oak '+str(i),(-2.55,.38+i*.13,-5.45),(1.5,.11,.2),n_wood,bevel=.015)
for t,(x,z) in enumerate(((-10.6,-6.5),(-7.8,-10.3))):
    beam('olive trunk '+str(t),(x,.1,z),(x+.16,3.4,z),.22,n_darkwood)
    for j in range(14):
        a=j*2.399
        sphere('olive crown %d %d'%(t,j),(x+math.cos(a)*.65,2.6+(j%4)*.36,z+math.sin(a)*.65),(.7,.5,.64),n_leaf,segments=12,rings=8)
# A small outdoor reading circle opens back toward the library.
cylinder('reading circle inset',(-6,.14,6),3.95,.06,n_darkstone,vertices=48)
cylinder('reading circle pale floor',(-6,.18,6),3.74,.025,n_stone,vertices=48)
for tier,(inner,outer,top) in enumerate(((2.15,2.68,.35),(2.75,3.28,.55),(3.35,3.88,.75))):
    for segment in range(28):
        a=math.pi*(segment+.025)/28
        b=math.pi*(segment+.975)/28
        verts=[(-6+r*math.cos(t),y,6+r*math.sin(t)) for y in (.19,top) for r,t in ((inner,a),(outer,a),(outer,b),(inner,b))]
        mesh('reading amphitheater tier %d stone %02d'%(tier,segment),verts,[(1,2,3,0),(7,6,5,4),(4,5,1,0),(5,6,2,1),(6,7,3,2),(7,4,0,3)],n_stone if tier%2 else n_wood)
for i in range(3):
    cube('reading circle approach '+str(i),(-6,.13,1.1+i*.65),(1.5,.06,.56),n_stone)
finish_scene()
