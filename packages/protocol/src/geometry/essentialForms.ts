import {MESH_LIMITS,normalizeMesh,type MeshGeometry} from './mesh';

type Vec3=[number,number,number];
type MeshParts={positions:number[];indices:number[];normals:number[];uvs:number[]};

const EPSILON=1e-9;
const MINIMUM_FEATURE=0.0001;
const MINIMUM_FEATURE_TOLERANCE=Number.EPSILON*8;

function finiteNumber(value:unknown,label:string):number {
  if(typeof value!=='number'||!Number.isFinite(value))throw new Error(`${label} must be a finite number.`);
  return value;
}

function positiveNumber(value:unknown,label:string,max:number):number {
  const number=finiteNumber(value,label);
  if(number<=0||number>max)throw new Error(`${label} must be greater than 0 and at most ${max}.`);
  return number;
}

function belowMinimumFeature(value:number):boolean {
  return value+MINIMUM_FEATURE_TOLERANCE<MINIMUM_FEATURE;
}

function featureNumber(value:unknown,label:string,max:number):number {
  const number=finiteNumber(value,label);
  if(belowMinimumFeature(number))throw new Error(`${label} must be at least ${MINIMUM_FEATURE} source units.`);
  if(number>max)throw new Error(`${label} must be at most ${max}.`);
  return number;
}

function integer(value:unknown,fallback:number,min:number,max:number):number {
  const number=value??fallback;
  if(typeof number!=='number'||!Number.isInteger(number)||number<min||number>max){
    throw new Error(`Use an integer between ${min} and ${max}.`);
  }
  return number;
}

function optionalBoolean(value:unknown,fallback:boolean,label:string):boolean {
  if(value===undefined)return fallback;
  if(typeof value!=='boolean')throw new Error(`${label} must be boolean.`);
  return value;
}

function vec3(value:unknown,label:string,maxAbsolute:number,positive=false):Vec3 {
  if(!Array.isArray(value)||value.length!==3||value.some(component=>
    typeof component!=='number'||!Number.isFinite(component)||Math.abs(component)>maxAbsolute||positive&&component<=0,
  ))throw new Error(`${label} must contain three ${positive?'positive ':''}finite numbers no greater than ${maxAbsolute}.`);
  return [value[0],value[1],value[2]];
}

function add(a:Vec3,b:Vec3):Vec3{return [a[0]+b[0],a[1]+b[1],a[2]+b[2]];}
function subtract(a:Vec3,b:Vec3):Vec3{return [a[0]-b[0],a[1]-b[1],a[2]-b[2]];}
function scale(vector:Vec3,factor:number):Vec3{return [vector[0]*factor,vector[1]*factor,vector[2]*factor];}
function dot(a:Vec3,b:Vec3):number{return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function cross(a:Vec3,b:Vec3):Vec3{return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function length(vector:Vec3):number{return Math.hypot(...vector);}
function normalize(vector:Vec3,label='vector'):Vec3 {
  const magnitude=length(vector);
  if(magnitude<EPSILON)throw new Error(`${label} is too short to normalize reliably.`);
  return scale(vector,1/magnitude);
}

function preflight(vertexCount:number,triangleCount:number):void {
  if(vertexCount>MESH_LIMITS.vertices||triangleCount>MESH_LIMITS.triangles){
    throw new Error('Essential form exceeds the mesh geometry budget; reduce its segments or steps.');
  }
}

function vertex(parts:MeshParts,position:Vec3,normal:Vec3,u:number,v:number):number {
  const index=parts.positions.length/3;
  parts.positions.push(...position);
  parts.normals.push(...normal);
  parts.uvs.push(u,v);
  return index;
}

function finalize(parts:MeshParts):MeshGeometry {
  // Feature preflights cover individual recipe values. Combined geometry must
  // still pass normalizeMesh's final degeneracy and serialization checks.
  return normalizeMesh(parts);
}

function roundedCoordinates(halfSize:number,radius:number,segments:number):number[] {
  const inner=halfSize-radius;
  const coordinates:number[]=[];
  for(let step=segments;step>=0;step--){
    const angle=step/segments*Math.PI/4;
    coordinates.push(-inner-radius*Math.tan(angle));
  }
  coordinates.push(0);
  for(let step=0;step<=segments;step++){
    const angle=step/segments*Math.PI/4;
    coordinates.push(inner+radius*Math.tan(angle));
  }
  return coordinates;
}

function roundedBox(recipe:Record<string,unknown>):MeshGeometry {
  const size=vec3(recipe.size,'Rounded box size',60,true);
  const radius=featureNumber(recipe.radius,'Rounded box radius',30);
  const shortestHalf=Math.min(...size)/2;
  if(belowMinimumFeature(shortestHalf-radius)){
    throw new Error(`Rounded box inner half-extents must be at least ${MINIMUM_FEATURE} source units; reduce the radius.`);
  }
  const segments=integer(recipe.segments,3,1,8);
  const coordinateCount=segments*2+3;
  preflight(6*coordinateCount**2,12*(coordinateCount-1)**2);

  const half=scale(size,.5),inner=half.map(value=>value-radius) as Vec3;
  const parts:MeshParts={positions:[],indices:[],normals:[],uvs:[]};
  const faces:{axis:number;sign:-1|1;uAxis:number;vAxis:number}[]=[
    {axis:0,sign:1,uAxis:1,vAxis:2},
    {axis:0,sign:-1,uAxis:2,vAxis:1},
    {axis:1,sign:1,uAxis:2,vAxis:0},
    {axis:1,sign:-1,uAxis:0,vAxis:2},
    {axis:2,sign:1,uAxis:0,vAxis:1},
    {axis:2,sign:-1,uAxis:1,vAxis:0},
  ];

  for(const face of faces){
    const uCoordinates=roundedCoordinates(half[face.uAxis],radius,segments);
    const vCoordinates=roundedCoordinates(half[face.vAxis],radius,segments);
    const base=parts.positions.length/3;
    for(let row=0;row<vCoordinates.length;row++)for(let column=0;column<uCoordinates.length;column++){
      const point:[number,number,number]=[0,0,0];
      point[face.axis]=face.sign*half[face.axis];
      point[face.uAxis]=uCoordinates[column];
      point[face.vAxis]=vCoordinates[row];
      const closest=point.map((value,axis)=>Math.max(-inner[axis],Math.min(inner[axis],value))) as Vec3;
      const offset=subtract(point,closest);
      const normal=normalize(offset,'Rounded box projection vector');
      vertex(parts,add(closest,scale(normal,radius)),normal,column/(uCoordinates.length-1),row/(vCoordinates.length-1));
    }
    const stride=uCoordinates.length;
    for(let row=0;row<vCoordinates.length-1;row++)for(let column=0;column<uCoordinates.length-1;column++){
      const a=base+row*stride+column,b=a+1,c=a+stride,d=c+1;
      parts.indices.push(a,b,c,b,d,c);
    }
  }
  return finalize(parts);
}

function torus(recipe:Record<string,unknown>):MeshGeometry {
  const radius=positiveNumber(recipe.radius,'Torus radius',30);
  const tube=featureNumber(recipe.tube,'Torus tube',10);
  if(belowMinimumFeature(radius-tube)){
    throw new Error(`Torus radius-minus-tube gap must be at least ${MINIMUM_FEATURE} source units.`);
  }
  const segments=integer(recipe.segments,32,3,128);
  const tubeSegments=integer(recipe.tubeSegments,12,3,128);
  preflight((segments+1)*(tubeSegments+1),segments*tubeSegments*2);

  const parts:MeshParts={positions:[],indices:[],normals:[],uvs:[]};
  const stride=tubeSegments+1;
  for(let ring=0;ring<=segments;ring++){
    const u=ring/segments*Math.PI*2,cosU=Math.cos(u),sinU=Math.sin(u);
    for(let section=0;section<=tubeSegments;section++){
      const v=section/tubeSegments*Math.PI*2,cosV=Math.cos(v),sinV=Math.sin(v);
      const distance=radius+tube*cosV;
      vertex(parts,[distance*cosU,tube*sinV,distance*sinU],[cosV*cosU,sinV,cosV*sinU],ring/segments,section/tubeSegments);
    }
  }
  for(let ring=0;ring<segments;ring++)for(let section=0;section<tubeSegments;section++){
    const a=ring*stride+section,b=a+stride,c=a+1,d=b+1;
    parts.indices.push(a,c,b,c,d,b);
  }
  return finalize(parts);
}

function catmullRom(path:Vec3[],interval:number,t:number):Vec3 {
  const p0=path[Math.max(0,interval-1)],p1=path[interval],p2=path[interval+1],p3=path[Math.min(path.length-1,interval+2)];
  const t2=t*t,t3=t2*t;
  return [0,1,2].map(axis=>.5*(
    2*p1[axis]+(-p0[axis]+p2[axis])*t+
    (2*p0[axis]-5*p1[axis]+4*p2[axis]-p3[axis])*t2+
    (-p0[axis]+3*p1[axis]-3*p2[axis]+p3[axis])*t3
  )) as Vec3;
}

function interpolatePath(path:Vec3[],steps:number,smooth:boolean):Vec3[] {
  const result:Vec3[]=[];
  for(let interval=0;interval<path.length-1;interval++)for(let step=0;step<steps;step++){
    const t=step/steps;
    result.push(smooth?catmullRom(path,interval,t):add(path[interval],scale(subtract(path[interval+1],path[interval]),t)));
  }
  result.push(path[path.length-1]);
  return result;
}

function pathTangents(centers:Vec3[]):Vec3[] {
  return centers.map((center,index)=>{
    const difference=index===0?subtract(centers[1],center):index===centers.length-1?subtract(center,centers[index-1]):subtract(centers[index+1],centers[index-1]);
    return normalize(difference,'Sweep path tangent');
  });
}

function rotateAroundAxis(vector:Vec3,axis:Vec3,sine:number,cosine:number):Vec3 {
  return add(add(scale(vector,cosine),scale(cross(axis,vector),sine)),scale(axis,dot(axis,vector)*(1-cosine)));
}

function transportedFrames(tangents:Vec3[]):{normal:Vec3;binormal:Vec3}[] {
  const reference=Math.abs(tangents[0][1])<.9?[0,1,0] as Vec3:[1,0,0] as Vec3;
  let normal=normalize(cross(reference,tangents[0]),'Sweep initial frame');
  const frames=[{normal,binormal:normalize(cross(tangents[0],normal),'Sweep initial frame')}];
  for(let index=1;index<tangents.length;index++){
    const previous=tangents[index-1],current=tangents[index];
    const axisVector=cross(previous,current),sine=length(axisVector),cosine=Math.max(-1,Math.min(1,dot(previous,current)));
    if(sine<EPSILON){
      if(cosine<0)throw new Error('Sweep path contains a reversal that leaves no stable tangent frame.');
    }else{
      normal=rotateAroundAxis(normal,scale(axisVector,1/sine),sine,cosine);
    }
    normal=normalize(subtract(normal,scale(current,dot(normal,current))),'Sweep transported frame');
    frames.push({normal,binormal:normalize(cross(current,normal),'Sweep transported frame')});
  }
  return frames;
}

/**
 * Builds a circular sweep as authored. A radius larger than a tight bend may
 * self-intersect; this deterministic mesh builder leaves that visible for
 * headless inspection rather than guessing a repaired shape.
 */
function sweep(recipe:Record<string,unknown>):MeshGeometry {
  if(!Array.isArray(recipe.path)||recipe.path.length<2||recipe.path.length>128)throw new Error('Sweep path needs 2–128 points.');
  const path=recipe.path.map(point=>vec3(point,'Sweep path point',30));
  const directions=path.slice(1).map((point,index)=>{
    const difference=subtract(point,path[index]);
    if(belowMinimumFeature(length(difference))){
      throw new Error(`Sweep path consecutive points must be at least ${MINIMUM_FEATURE} apart; remove duplicate or too-close points.`);
    }
    return normalize(difference,'Sweep path interval');
  });
  for(let index=1;index<directions.length;index++){
    if(dot(directions[index-1],directions[index])<-1+EPSILON)throw new Error('Sweep path contains a reversal that leaves no stable tangent.');
  }
  if(belowMinimumFeature(length(subtract(path[path.length-1],path[0])))){
    throw new Error(`Sweep paths must be open: first and last points must be at least ${MINIMUM_FEATURE} apart. Use a torus for circular loops or raw geometry for other closed paths.`);
  }
  const radius=featureNumber(recipe.radius,'Sweep radius',10);
  const segments=integer(recipe.segments,12,3,32);
  const steps=integer(recipe.steps,1,1,8);
  const smooth=optionalBoolean(recipe.smooth,false,'Sweep smooth setting');
  const capStart=optionalBoolean(recipe.capStart,true,'Sweep capStart setting');
  const capEnd=optionalBoolean(recipe.capEnd,true,'Sweep capEnd setting');
  const ringCount=(path.length-1)*steps+1;
  if(ringCount>256)throw new Error('Sweep subdivisions must produce at most 256 rings.');
  const vertexCount=ringCount*(segments+1)+(capStart?segments+1:0)+(capEnd?segments+1:0);
  const triangleCount=(ringCount-1)*segments*2+(capStart?segments:0)+(capEnd?segments:0);
  preflight(vertexCount,triangleCount);

  const centers=interpolatePath(path,steps,smooth);
  for(let index=1;index<centers.length;index++)if(belowMinimumFeature(length(subtract(centers[index],centers[index-1])))){
    throw new Error(`Sweep sampled rings must be at least ${MINIMUM_FEATURE} apart; adjust the path, steps, or smoothing.`);
  }
  const tangents=pathTangents(centers),frames=transportedFrames(tangents);
  const distances=[0];
  for(let index=1;index<centers.length;index++)distances.push(distances[index-1]+length(subtract(centers[index],centers[index-1])));
  const totalDistance=distances[distances.length-1];
  const parts:MeshParts={positions:[],indices:[],normals:[],uvs:[]};
  const stride=segments+1;
  for(let ring=0;ring<ringCount;ring++)for(let section=0;section<=segments;section++){
    const angle=section/segments*Math.PI*2;
    const radial=add(scale(frames[ring].normal,Math.cos(angle)),scale(frames[ring].binormal,Math.sin(angle)));
    vertex(parts,add(centers[ring],scale(radial,radius)),radial,section/segments,distances[ring]/totalDistance);
  }
  for(let ring=0;ring<ringCount-1;ring++)for(let section=0;section<segments;section++){
    const a=ring*stride+section,b=a+stride,c=a+1,d=b+1;
    parts.indices.push(a,c,b,c,d,b);
  }

  const cap=(ring:number,end:boolean):void=>{
    const normal=scale(tangents[ring],end?1:-1);
    const centerIndex=vertex(parts,centers[ring],normal,.5,.5);
    const rimStart=parts.positions.length/3;
    for(let section=0;section<segments;section++){
      const angle=section/segments*Math.PI*2;
      const cos=Math.cos(angle),sin=Math.sin(angle);
      const radial=add(scale(frames[ring].normal,cos),scale(frames[ring].binormal,sin));
      vertex(parts,add(centers[ring],scale(radial,radius)),normal,.5+cos*.5,.5+sin*.5);
    }
    for(let section=0;section<segments;section++){
      const current=rimStart+section,next=rimStart+(section+1)%segments;
      parts.indices.push(centerIndex,...(end?[current,next]:[next,current]));
    }
  };
  if(capStart)cap(0,false);
  if(capEnd)cap(ringCount-1,true);
  return finalize(parts);
}

export function essentialForm(recipe:Record<string,unknown>):MeshGeometry {
  if(!recipe||typeof recipe!=='object'||Array.isArray(recipe))throw new Error('Expected an essential-form recipe.');
  if(recipe.kind==='roundedBox')return roundedBox(recipe);
  if(recipe.kind==='torus')return torus(recipe);
  if(recipe.kind==='sweep')return sweep(recipe);
  throw new Error('Choose a roundedBox, torus, or sweep essential-form recipe.');
}
