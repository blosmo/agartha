import {MESH_LIMITS,normalizeMesh,type MeshGeometry} from './mesh';
/** Imports triangulated OBJ geometry. Resource references are never fetched or executed. */
export function importObj(source:string):MeshGeometry {
  if(typeof source!=='string'||new TextEncoder().encode(source).length>MESH_LIMITS.objBytes)throw new Error('OBJ exceeds the 4 MB import limit.');
  const vertices:number[][]=[],texture:number[][]=[],normals:number[][]=[];
  const positions:number[]=[],uvs:number[]=[],outNormals:number[]=[],indices:number[]=[];
  const unique=new Map<string,number>();let hasUv:boolean|undefined,hasNormal:boolean|undefined;
  function vector(parts:string[],size:number){const result=parts.slice(0,size).map(Number);if(result.length!==size||!result.every(Number.isFinite))throw new Error('Invalid OBJ vertex data.');return result;}
  function index(text:string|undefined,length:number){const value=Number(text);if(!text||!Number.isInteger(value)||value===0)throw new Error('Invalid OBJ index.');const result=value<0?length+value:value-1;if(result<0||result>=length)throw new Error('OBJ index is out of range.');return result;}
  for(const raw of source.split(/\r?\n/)){
    const [kind,...parts]=raw.split('#')[0].trim().split(/\s+/);if(!kind)continue;
    if(kind==='v')vertices.push(vector(parts,3));
    else if(kind==='vt')texture.push(vector(parts,2));
    else if(kind==='vn')normals.push(vector(parts,3));
    else if(kind==='f'){
      if(parts.length!==3)throw new Error('Export the OBJ with triangulated faces.');
      for(const part of parts){
        const [v,vt,vn,...extra]=part.split('/');if(extra.length)throw new Error('Invalid OBJ face.');
        const vi=index(v,vertices.length),ti=vt?index(vt,texture.length):undefined,ni=vn?index(vn,normals.length):undefined;
        if(hasUv!==undefined&&hasUv!==(ti!==undefined)||hasNormal!==undefined&&hasNormal!==(ni!==undefined))throw new Error('OBJ faces must consistently include UVs and normals.');
        hasUv=ti!==undefined;hasNormal=ni!==undefined;
        const key=`${vi}/${ti??''}/${ni??''}`;let id=unique.get(key);
        if(id===undefined){id=unique.size;unique.set(key,id);positions.push(...vertices[vi]);if(ti!==undefined)uvs.push(...texture[ti]);if(ni!==undefined)outNormals.push(...normals[ni]);}
        indices.push(id);
      }
    }else if(!['o','g','s','mtllib','usemtl'].includes(kind))throw new Error(`Unsupported OBJ statement: ${kind}.`);
    if(vertices.length>MESH_LIMITS.vertices||texture.length>MESH_LIMITS.vertices||normals.length>MESH_LIMITS.vertices||unique.size>MESH_LIMITS.vertices||indices.length>MESH_LIMITS.triangles*3)throw new Error('OBJ exceeds the geometry budget.');
  }
  return normalizeMesh({positions,indices,...(hasUv?{uvs}:{}),...(hasNormal?{normals:outNormals}:{})});
}
