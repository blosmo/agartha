import {essentialForm} from './essentialForms';
import {transformModeledMesh} from './modelTransform';
import {MESH_LIMITS,normalizeMesh,type MeshGeometry} from './mesh';
type Point=[number,number];
function points(value:unknown,label:string,min:number):Point[]{
 if(!Array.isArray(value)||value.length<min||value.length>128)throw new Error(`${label} needs ${min}–128 points.`);
 return value.map(point=>{if(!Array.isArray(point)||point.length!==2||!point.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=30))throw new Error(`Invalid ${label} point.`);return [...point] as Point;});
}
function integer(value:unknown,fallback:number,min:number,max:number){const n=value??fallback;if(typeof n!=='number'||!Number.isInteger(n)||n<min||n>max)throw new Error(`Use an integer between ${min} and ${max}.`);return n;}
const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function triangulate(outline:Point[]):number[]{
 const area=outline.reduce((sum,p,i)=>{const q=outline[(i+1)%outline.length];return sum+p[0]*q[1]-q[0]*p[1];},0);
 if(Math.abs(area)<1e-8)throw new Error('Outline needs nonzero area.');
 const onSegment=(a:Point,b:Point,p:Point)=>Math.abs(cross(a,b,p))<1e-9&&p[0]>=Math.min(a[0],b[0])&&p[0]<=Math.max(a[0],b[0])&&p[1]>=Math.min(a[1],b[1])&&p[1]<=Math.max(a[1],b[1]);
 for(let i=0;i<outline.length;i++)for(let j=i+1;j<outline.length;j++){
  if(j===i+1||i===0&&j===outline.length-1)continue;
  const a=outline[i],b=outline[(i+1)%outline.length],c=outline[j],d=outline[(j+1)%outline.length];
  if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0||onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b))throw new Error('Outline must not cross or touch itself.');
 }
 const remaining=outline.map((_,i)=>i);if(area<0)remaining.reverse();
 const result:number[]=[];
 while(remaining.length>3){
  let found=false;
  for(let i=0;i<remaining.length;i++){
   const a=remaining[(i+remaining.length-1)%remaining.length],b=remaining[i],c=remaining[(i+1)%remaining.length];
   if(cross(outline[a],outline[b],outline[c])<=1e-9)continue;
   const contains=remaining.some(p=>p!==a&&p!==b&&p!==c&&cross(outline[a],outline[b],outline[p])>=-1e-9&&cross(outline[b],outline[c],outline[p])>=-1e-9&&cross(outline[c],outline[a],outline[p])>=-1e-9);
   if(contains)continue;result.push(a,b,c);remaining.splice(i,1);found=true;break;
  }
  if(!found)throw new Error('Outline cannot be triangulated; remove duplicate or collinear corners.');
 }
 result.push(...remaining);return result;
}
/** Shape-preserving Hermite interpolation in radius/height space. */
function interpolateProfile(control:Point[],steps:number,smooth:boolean):{profile:Point[];slopes?:number[]} {
 if(steps===1&&!smooth)return {profile:control};
 const intervals=control.slice(1).map((p,i)=>p[1]-control[i][1]);
 const secants=control.slice(1).map((p,i)=>(p[0]-control[i][0])/intervals[i]);
 if(secants.some(n=>!Number.isFinite(n)))throw new Error('Lathe profile heights are too close to interpolate reliably.');
 const tangents=control.map((_,i)=>{
  if(i===0)return secants[0];if(i===control.length-1)return secants[secants.length-1];
  const before=secants[i-1],after=secants[i];if(before*after<=0)return 0;
  const w1=2*intervals[i]+intervals[i-1],w2=intervals[i]+2*intervals[i-1];
  return (w1+w2)/(w1/before+w2/after);
 });
 const profile:Point[]=[],slopes:number[]=[];
 for(let i=0;i<control.length-1;i++)for(let j=0;j<steps;j++){
  const t=j/steps,t2=t*t,t3=t2*t,h=intervals[i],a=control[i][0],b=control[i+1][0];
  const radius=smooth?(2*t3-3*t2+1)*a+(t3-2*t2+t)*h*tangents[i]+(-2*t3+3*t2)*b+(t3-t2)*h*tangents[i+1]:a+(b-a)*t;
  const slope=((6*t2-6*t)*a+(3*t2-4*t+1)*h*tangents[i]+(-6*t2+6*t)*b+(3*t2-2*t)*h*tangents[i+1])/h;
  profile.push([radius,control[i][1]+h*t]);slopes.push(slope);
 }
 profile.push(control[control.length-1]);slopes.push(tangents[tangents.length-1]);
 return {profile,...(smooth?{slopes}:{})};
}
export function modelGeometry(input:unknown):MeshGeometry {
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Expected a modeling recipe.');
 const recipe=input as Record<string,unknown>;
 if(['roundedBox','torus','sweep'].includes(String(recipe.kind)))return transformModeledMesh(essentialForm(recipe),recipe.transform);
 const positions:number[]=[],indices:number[]=[],normals:number[]=[],uvs:number[]=[];
 const vertex=(x:number,y:number,z:number,nx:number,ny:number,nz:number,u:number,v:number)=>{const id=positions.length/3;positions.push(x,y,z);const length=Math.hypot(nx,ny,nz);normals.push(nx/length,ny/length,nz/length);uvs.push(u,v);return id;};
 if(recipe.kind==='lathe'){
  const control=points(recipe.profile,'Lathe profile',2),segments=integer(recipe.segments,32,3,96);
  if(control.some((p,i)=>p[0]<=0||i>0&&p[1]<=control[i-1][1]))throw new Error('Lathe radii must be positive and profile heights strictly increasing.');
  for(const key of ['capStart','capEnd'])if(recipe[key]!==undefined&&typeof recipe[key]!=='boolean')throw new Error('Cap settings must be boolean.');
  if(recipe.smooth!==undefined&&typeof recipe.smooth!=='boolean')throw new Error('Lathe smooth must be boolean.');
  const smooth=recipe.smooth===true,steps=integer(recipe.steps,smooth?4:1,1,8),rings=(control.length-1)*steps+1;
  const caps=Number(recipe.capStart!==false)+Number(recipe.capEnd!==false);
  if(rings>256||(rings+caps)*(segments+1)>MESH_LIMITS.vertices||(2*(rings-1)+caps)*segments>MESH_LIMITS.triangles)throw new Error('Lathe exceeds its rings or geometry budget; reduce steps or segments.');
  const {profile,slopes}=interpolateProfile(control,steps,smooth);
  const stride=segments+1;
  for(let row=0;row<profile.length;row++)for(let j=0;j<=segments;j++){
   const angle=j/segments*Math.PI*2,before=profile[Math.max(0,row-1)],after=profile[Math.min(profile.length-1,row+1)],dr=after[0]-before[0],dy=after[1]-before[1];
   vertex(Math.cos(angle)*profile[row][0],profile[row][1],Math.sin(angle)*profile[row][0],(slopes?1:dy)*Math.cos(angle),-(slopes?.[row]??dr),(slopes?1:dy)*Math.sin(angle),j/segments,row/(profile.length-1));
   if(row<profile.length-1&&j<segments){const a=row*stride+j,b=a+1;indices.push(a,a+stride,b,b,a+stride,b+stride);}
  }
  for(const end of [0,1])if(recipe[end?'capEnd':'capStart']!==false){
   const [r,y]=profile[end?profile.length-1:0],ny=end?1:-1,center=vertex(0,y,0,0,ny,0,.5,.5),start=positions.length/3;
   for(let j=0;j<segments;j++){const a=j/segments*Math.PI*2;vertex(Math.cos(a)*r,y,Math.sin(a)*r,0,ny,0,.5+Math.cos(a)*.5,.5+Math.sin(a)*.5);}
   for(let j=0;j<segments;j++){const a=start+j,b=start+(j+1)%segments;indices.push(center,...(end?[b,a]:[a,b]));}
  }
 }else if(recipe.kind==='extrude'){
  let outline=points(recipe.outline,'Extrusion outline',3);
  const depth=recipe.depth??1;if(typeof depth!=='number'||!Number.isFinite(depth)||depth<.1||depth>60)throw new Error('Extrusion depth must be 0.1–60.');
  const signed=outline.reduce((sum,p,i)=>{const q=outline[(i+1)%outline.length];return sum+p[0]*q[1]-q[0]*p[1];},0);if(signed<0)outline=outline.reverse();
  const triangles=triangulate(outline),min=[Math.min(...outline.map(p=>p[0])),Math.min(...outline.map(p=>p[1]))],max=[Math.max(...outline.map(p=>p[0])),Math.max(...outline.map(p=>p[1]))];
  for(const top of [false,true])for(let i=0;i<triangles.length;i+=3){const face=triangles.slice(i,i+3);if(top)face.reverse();for(const corner of face){const p=outline[corner];indices.push(vertex(p[0],top?depth:0,p[1],0,top?1:-1,0,(p[0]-min[0])/(max[0]-min[0]),(p[1]-min[1])/(max[1]-min[1])));}}
  for(let i=0;i<outline.length;i++){
   const a=outline[i],b=outline[(i+1)%outline.length],dx=b[0]-a[0],dz=b[1]-a[1];if(Math.hypot(dx,dz)<1e-8)throw new Error('Outline has a duplicate corner.');
   const base=vertex(a[0],0,a[1],dz,0,-dx,0,0);vertex(a[0],depth,a[1],dz,0,-dx,0,1);vertex(b[0],0,b[1],dz,0,-dx,1,0);vertex(b[0],depth,b[1],dz,0,-dx,1,1);indices.push(base,base+1,base+2,base+2,base+1,base+3);
  }
 }else throw new Error('Choose a lathe, extrude, roundedBox, torus, or sweep modeling recipe.');
 return transformModeledMesh(normalizeMesh({positions,indices,normals,uvs}),recipe.transform);
}
