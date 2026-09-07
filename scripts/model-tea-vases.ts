import {writeFile,mkdir} from 'node:fs/promises';
import type {SharedWorld} from '../apps/web/src/worlds/world';
const origin='http://127.0.0.1:5174';
async function request(path:string,body?:unknown){const response=await fetch(origin+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});const value=await response.json();if(!response.ok)throw new Error(`${response.status}: ${value.error}`);return value;}
const positions:number[]=[],indices:number[]=[],uvs:number[]=[],normals:number[]=[];
const profile=[[.45,0],[.65,.15],[.9,.65],[.85,1.15],[.5,1.65],[.4,2],[.52,2.1]];
const segments=24;
for(let row=0;row<profile.length;row++)for(let j=0;j<=segments;j++){
 const a=j/segments*Math.PI*2;positions.push(Math.cos(a)*profile[row][0],profile[row][1],Math.sin(a)*profile[row][0]);uvs.push(j/segments,row/(profile.length-1));
 const before=profile[Math.max(0,row-1)],after=profile[Math.min(profile.length-1,row+1)];
 const dr=after[0]-before[0],dy=after[1]-before[1],length=Math.hypot(dr,dy);normals.push(dy*Math.cos(a)/length,-dr/length,dy*Math.sin(a)/length);
 if(row<profile.length-1&&j<segments){const stride=segments+1,first=row*stride+j,next=first+1;indices.push(first,first+stride,next,next,first+stride,next+stride);}
}
const original=await request('/api/library',{plotId:'plot-1-1',author:'Codex',definition:{kind:'mesh',name:'Lathed tea vase',description:'An original vase modeled through the agent lathe command.',recipe:{kind:'lathe',profile,segments,capEnd:false}}});
const obj=positions.reduce((s,_,i)=>i%3===0?s+`v ${positions.slice(i,i+3).join(' ')}\n`:s,'# Agartha original vase exported as triangulated OBJ\n')+uvs.reduce((s,_,i)=>i%2===0?s+`vt ${uvs.slice(i,i+2).join(' ')}\n`:s,'')+normals.reduce((s,_,i)=>i%3===0?s+`vn ${normals.slice(i,i+3).join(' ')}\n`:s,'')+indices.reduce((s,_,i)=>i%3===0?s+`f ${indices.slice(i,i+3).map(n=>`${n+1}/${n+1}/${n+1}`).join(' ')}\n`:s,'');
await mkdir(new URL('./fixtures/',import.meta.url),{recursive:true});await writeFile(new URL('./fixtures/tea-vase.obj',import.meta.url),obj);
const imported=await request('/api/library',{plotId:'plot-1-1',author:'Codex',definition:{kind:'mesh',name:'OBJ tea vase',description:'Imported from a triangulated OBJ file through the agent library API.',obj}});
const world:SharedWorld=await request('/api/plots/plot-1-1');
const result=await request('/api/plots/plot-1-1',{baseRevision:world.revision,author:'Codex',message:'Modeled and imported ceramic tea vases using custom mesh geometry.',objects:[
 {id:'modeled-tea-vase',name:'Modeled celadon vase',shape:'mesh',meshId:original.id,position:[6,1.5,5],scale:[2.4,3,2.4],color:'#ffffff',materialId:'pbr-ceramic'},
 {id:'imported-tea-vase',name:'Imported clay vase',shape:'mesh',meshId:imported.id,position:[8,1.25,7],scale:[2,2.5,2],color:'#ffffff',materialId:'pbr-clay'},
]});
console.log(JSON.stringify({original:original.id,imported:imported.id,originalVertices:original.geometry.positions.length/3,originalTriangles:original.geometry.indices.length/3,importedVertices:imported.geometry.positions.length/3,importedTriangles:imported.geometry.indices.length/3,revision:result.revision}));
