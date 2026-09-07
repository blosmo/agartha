export const MESH_LIMITS = { vertices: 20000, triangles: 30000, objBytes: 4_000_000, serializedBytes:750000, storageBytes:900000 } as const;
export type MeshGeometry = { positions:number[]; indices:number[]; normals:number[]; uvs?:number[]; uvs1?:number[];colors?:number[]; bounds:[number,number,number] };
function numbers(value:unknown,label:string,max:number):number[]{
  if(!Array.isArray(value)||value.length>max||!value.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e6))throw new Error(`Invalid or oversized mesh ${label}.`);
  return value.slice();
}
/** Normalize geometry around its bounding-box center; object scale defines its placed dimensions. */
export function normalizeMesh(input:unknown):MeshGeometry {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Expected indexed mesh geometry.');
  const value=input as Record<string,unknown>;
  const positions=numbers(value.positions,'positions',MESH_LIMITS.vertices*3);
  const indices=numbers(value.indices,'indices',MESH_LIMITS.triangles*3);
  const count=positions.length/3;
  if(count<3||!Number.isInteger(count)||indices.length<3||indices.length%3!==0)throw new Error('A mesh needs XYZ vertices and triangle indices.');
  if(indices.some(index=>!Number.isInteger(index)||index<0||index>=count))throw new Error('Mesh triangle index is outside the vertex array.');
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<positions.length;i++){const axis=i%3;min[axis]=Math.min(min[axis],positions[i]);max[axis]=Math.max(max[axis],positions[i]);}
  const bounds=max.map((n,i)=>n-min[i]) as [number,number,number];
  if(Math.max(...bounds)<1e-8)throw new Error('Mesh has no extent.');
  const normals=value.normals===undefined?new Array(positions.length).fill(0):numbers(value.normals,'normals',positions.length);
  if(normals.length!==positions.length)throw new Error('Provide one XYZ normal per vertex.');
  for(let i=0;i<indices.length;i+=3){
    const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
    const u=[positions[b]-positions[a],positions[b+1]-positions[a+1],positions[b+2]-positions[a+2]];
    const v=[positions[c]-positions[a],positions[c+1]-positions[a+1],positions[c+2]-positions[a+2]];
    const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    if(Math.hypot(...n)<1e-12)throw new Error('Mesh contains a degenerate triangle.');
    if(value.normals===undefined)for(const vertex of [a,b,c])for(let axis=0;axis<3;axis++)normals[vertex+axis]+=n[axis];
  }
  // Rescaling the axes also changes normals; retain correct orientation under that transform.
  for(let i=0;i<normals.length;i+=3){
    const n=normals.slice(i,i+3).map((v,axis)=>v*(bounds[axis]||1));const length=Math.hypot(...n);
    if(length<1e-12)throw new Error('Mesh has an unused vertex or an invalid normal.');
    for(let axis=0;axis<3;axis++)normals[i+axis]=n[axis]/length;
  }
  const uvs=value.uvs===undefined?undefined:numbers(value.uvs,'UVs',count*2);
  if(uvs&&uvs.length!==count*2)throw new Error('Provide one UV pair per vertex.');
  const uvs1=value.uvs1===undefined?undefined:numbers(value.uvs1,'secondary UVs',count*2);
  if(uvs1&&uvs1.length!==count*2)throw new Error('Provide one secondary UV pair per vertex.');
  const colorInput=value.colors===undefined?undefined:numbers(value.colors,'colors',count*4);
  if(colorInput&&(![count*3,count*4].includes(colorInput.length)||colorInput.some(n=>n<0||n>1)))throw new Error('Provide RGB or RGBA vertex colors in 0–1.');
  const colors=colorInput?.length===count*3?colorInput.flatMap((n,i)=>i%3===2?[n,1]:[n]):colorInput;
  const result = {positions:positions.map((n,i)=>(n-(min[i%3]+max[i%3])/2)/(bounds[i%3]||1)),indices,normals,...(uvs?{uvs}:{}),...(uvs1?{uvs1}:{}),...(colors?{colors}:{}),bounds};
  const scalars=result.positions.length+result.normals.length+result.indices.length+(result.uvs?.length??0)+(result.uvs1?.length??0)+(result.colors?.length??0);
  if(scalars*9+1024>MESH_LIMITS.storageBytes)throw new Error('Mesh exceeds its storage budget; reduce geometry complexity.');
  if(new TextEncoder().encode(JSON.stringify(result)).length>MESH_LIMITS.serializedBytes)throw new Error('Mesh exceeds its serialized geometry budget.');
  return result;
}
