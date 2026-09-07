import {normalizeMesh,type MeshGeometry} from './mesh';

type Vector=[number,number,number];
function vector(value:unknown,fallback:Vector,label:string,min:number,max:number):Vector {
 if(value===undefined)return fallback;
 if(!Array.isArray(value)||value.length!==3||!value.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max))throw new Error(`${label} must contain three numbers from ${min} to ${max}.`);
 return [...value] as Vector;
}
function rotate([x,y,z]:Vector,angles:Vector):Vector {
 for(let axis=0;axis<3;axis++){
  const a=angles[axis]*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  if(axis===0)[y,z]=[y*c-z*s,y*s+z*c];
  else if(axis===1)[x,z]=[x*c+z*s,-x*s+z*c];
  else [x,y]=[x*c-y*s,x*s+y*c];
 }
 return [x,y,z];
}
/** Construct around the source bounding-box center. Returned bounds retain intended proportions. */
export function transformModeledMesh(mesh:MeshGeometry,input:unknown):MeshGeometry {
 if(input===undefined)return mesh;
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Expected a construction transform object.');
 const transform=input as Record<string,unknown>;
 if(Object.keys(transform).some(key=>key!=='rotation'&&key!=='scale'))throw new Error('Construction transforms support rotation and scale; set position on the placed object.');
 const rotation=vector(transform.rotation,[0,0,0],'Rotation in degrees',-360,360);
 const scale=vector(transform.scale,[1,1,1],'Construction scale',.01,100);
 if(rotation.every(n=>n===0)&&scale.every(n=>n===1))return mesh;
 const positions:number[]=[],normals:number[]=[];
 for(let i=0;i<mesh.positions.length;i+=3){
  const sourcePosition=mesh.positions.slice(i,i+3).map((n,axis)=>n*(mesh.bounds[axis]||1)*scale[axis]) as Vector;
  // Undo the original normalization, then apply the inverse-transpose scale.
  const sourceNormal=mesh.normals.slice(i,i+3).map((n,axis)=>n/(mesh.bounds[axis]||1)/scale[axis]) as Vector;
  positions.push(...rotate(sourcePosition,rotation));normals.push(...rotate(sourceNormal,rotation));
 }
 return normalizeMesh({positions,indices:mesh.indices,normals,uvs:mesh.uvs,uvs1:mesh.uvs1,colors:mesh.colors});
}
