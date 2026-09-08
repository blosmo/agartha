"""The Commons: a weathered gathering hall facing a curved pond and open lawn.
Y-up, 25.8m island. Open building rectangle X[-10,-2], Z[3,11].
"""
import math
reset_scene('The Commons')
grass=material('sage lawn','#7D9067'); soil=material('island earth','#655B48')
stone=material('warm limestone','#B6ADA0'); dark=material('stone seams','#7B7B6B')
wood=material('aged oak','#785336'); cut=material('oak endgrain','#AD8150')
roof=material('weathered green roof','#45645E'); water=material('pond jade','#527E78',roughness=.24)
leaf=material('grove olive','#607649'); lightleaf=material('grove new growth','#8B9B59')
metal=material('old bronze','#9C8651',metallic=.5); flower=material('cream blossoms','#E4D3A6')
cube('island strata',(0,-.48,0),(25.8,.95,25.8),soil,bevel=.24)
cube('lawn surface',(0,-.015,0),(25.6,.23,25.6),grass,bevel=.18)
# Modulated blocks read as a crafted retaining edge; gateway midpoints stay level.
for side in (-1,1):
    for i in range(18):
        q=-12.05+i*1.42
        for axis in (0,1):
            loc=(q,-.34,side*12.65) if axis==0 else (side*12.65,-.34,q)
            cube('edge limestone %s %s %s'%(side,i,axis),loc,(1.33,.42,.31) if axis==0 else (.31,.42,1.33),stone,bevel=.045)
# A global footprint registry leaves real gaps, including at path junctions.
_path_pavers=[]
def pathline(label,points):
    for j,(a,b) in enumerate(zip(points,points[1:])):
        dx=b[0]-a[0]; dz=b[1]-a[1]
        yaw=math.atan2(dx,dz)
        across=(math.cos(yaw),-math.sin(yaw)); along=(math.sin(yaw),math.cos(yaw))
        axes=(across,along); half=(1.38/2,0.66/2)
        n=max(1,int(math.dist(a,b)/0.78))
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
            paver=cube(label+str(j)+' '+str(k),(x,0.13,z),(1.38,0.12,0.66),stone,bevel=0.11)
            paver.rotation_euler.z=yaw
            _path_pavers.append((x,z,axes))
pathline('east walk ',[(12.1,0),(9.6,0),(8,4),(1.2,4),(0,7),(0,12.4)])
pathline('west walk ',[(-12.1,0),(-9,0),(-4,0),(0,1.5),(1.2,4)])
pathline('rear walk ',[(0,-12.4),(0,-9),(1,-5),(0,1.5)])
# Hall: open front, framed bays, genuine roof thickness and exposed rafters.
cube('hall limestone plinth',(-5.5,.26,-5),(9.7,.38,6.8),stone,bevel=.1)
for k in range(17):
    cube('hall floorboard '+str(k),(-5.5,.49,-8.1+k*.38),(9.35,.12,.35),wood,bevel=.02)
for x in (-9.7,-5.5,-1.3):
    for z in (-7.7,-2.3):
        cube('post stone shoe',(x,.68,z),(.67,.42,.67),dark,bevel=.06)
        cube('oak hall post',(x,2.04,z),(.34,2.6,.34),wood,bevel=.045)
        for dx in (-.72,.72):
            beam('pegged knee brace',(x,2.45,z),(x+dx,3.25,z),.17,cut)
        cylinder('joinery peg',(x,3.14,z+.2),.07,.08,metal,vertices=8,rotation=(math.pi/2,0,0))
for z in (-7.7,-2.3):
    beam('long header',(-10,3.34,z),(-1,3.34,z),.28,wood)
# Roof longitudinal ridge along X, its low front eave reveals the gathering room.
for x in (-10,-8.5,-7,-5.5,-4,-2.5,-1):
    beam('roof rafter',(x,3.4,-8.7),(x,5.35,-5),.19,cut)
    beam('roof rafter',(x,5.35,-5),(x,3.4,-1.3),.19,cut)
beam('ridge cap timber',(-10.4,5.37,-5),(-.6,5.37,-5),.25,wood)
for slope in (-1,1):
    for row in range(7):
        d0=row*.54; d1=d0+.58
        for col in range(12):
            x=-10.5+col*.83
            z0=-5+slope*d0; z1=-5+slope*d1
            y0=5.46-d0*.527; y1=5.46-d1*.527
            mesh('individual roof shingle',[(x,y0,z0),(x+.79,y0,z0),(x+.79,y1,z1),(x,y1,z1)],[(3,2,1,0) if slope==1 else (0,1,2,3)],roof)
# Communal table and stools sheltered under the eaves.
for x in (-7.2,-3.8):
    for z in (-5.65,-4.35): cube('table legs',(x,1.06,z),(.21,1.1,.21),wood,bevel=.03)
for i in range(5): cube('table top plank',(-5.5,1.65,-5.8+i*.4),(4.15,.18,.37),cut,bevel=.025)
for x in (-8,-5.6,-3.2):
    for z in (-6.7,-3.2):
        cylinder('low stool seat',(x,.94,z),.43,.15,cut,vertices=10)
        for dx,dz in ((-.22,-.18),(.22,-.18),(0,.24)): beam('stool leg',(x+dx,.55,z+dz),(x+dx*.8,.87,z+dz*.8),.11,wood)
# Pond with irregular twelve-sided outline, broad coping and two inset terraces.
pond=[(2.3,-2.7),(4.3,-3.4),(7,-3.2),(8.9,-1.8),(9.2,.6),(8.1,2.25),(5.9,2.8),(3.7,2.25),(2.2,.9),(1.8,-.9)]
mesh('shallow jade pond',[(x,.12,z) for x,z in pond],[tuple(reversed(range(len(pond))))],water)
for i,a in enumerate(pond):
    b=pond[(i+1)%len(pond)]; n=3
    for j in range(n):
        t=(j+.5)/n; x=a[0]+(b[0]-a[0])*t; z=a[1]+(b[1]-a[1])*t
        sphere('hand fitted pond coping',(x,.23,z),(.51,.21,.4),stone,segments=8,rings=4)
for i in range(9):
    z=-1.6+i*.38
    cube('pond bridge deck',(2.15,.44,z),(2.25,.16,.32),cut,bevel=.025)
for x in (1.16,3.14):
    beam('bridge stringer',(x,.29,-1.8),(x,.29,1.65),.19,wood)
# The reusable bench is one crafted object group, carefully legible in foreground.
for z in (5.4,6.05,6.7): cube('component_bench seat slat',(6.2,.91,z),(3.8,.14,.54),cut,bevel=.045)
for x in (4.75,7.65):
    for z in (5.6,6.5): beam('component_bench splayed leg',(x,.13,z),(x+(.12 if x<6 else -.12),.84,z),.23,wood)
    beam('component_bench carved back upright',(x,.13,5.25),(x,1.98,5.04),.22,wood)
    sphere('component_bench carved finial',(x,2.04,5.03),(.19,.23,.19),cut,segments=8,rings=4)
for y in (1.28,1.67): cube('component_bench back rail',(6.2,y,5.12),(3.65,.27,.13),cut,bevel=.055)
beam('component_bench stretcher',(4.75,.42,6),(7.65,.42,6),.17,wood)
# Asymmetric grove behind the hall; clustered leaf tiers rather than random scatter.
for i,(x,z,h,r) in enumerate(((-10.2,-10.1,6.8,1.8),(-6.8,-10.3,7.5,1.9),(5.4,-9.7,5.4,1.8),(9.5,-7.7,4.4,1.7))):
    tree('rear grove '+str(i),(x,.1,z),h,wood,leaf,radius=r)
    for k in range(7):
        a=k*math.tau/7
        sphere('grove dappled crown',(x+math.cos(a)*r*.68,h*.8,z+math.sin(a)*r*.65),(r*.6,.75,r*.6),lightleaf if k%3==0 else leaf,segments=10,rings=5)
for cx,cz in ((9,-4.9),(9.3,5.5),(-10.7,1.6),(3,-8.4)):
    for j in range(9):
        a=j*2.399; r=.23*math.sqrt(j)
        x=cx+math.cos(a)*r; z=cz+math.sin(a)*r
        for k in range(3):
            b=k*math.tau/3
            mesh('planted path iris',[(x,.12,z),(x+math.cos(b)*.24,.58,z+math.sin(b)*.24),(x+.07,.28,z+.06)],[(0,1,2)],leaf)
        if j%2==0:sphere('iris cream flower',(x,.65,z),(.12,.1,.12),flower,segments=6,rings=3)
finish_scene()
