import {anyApi,httpActionGeneric,type HttpRouter} from 'convex/server';
import {ConvexError} from 'convex/values';
import {ASSET_LIMITS,markedArtifactContentType,validateArtifactSignature,type ArtifactRole} from '../../packages/protocol/src/canonicalAssets';
import {digest} from '../scene/model';
import type {Id} from '../_generated/dataModel';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store'};
export function registerAssetUpload(router:HttpRouter){for(const role of ['source','preview'] as ArtifactRole[]){
 const path=`/asset-upload/${role}`;
 router.route({path,method:'OPTIONS',handler:httpActionGeneric(async()=>new Response(null,{status:204,headers}))});
 router.route({path,method:'POST',handler:httpActionGeneric(async(ctx,request)=>{
  const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json'}});let storageId:Id<'_storage'>|undefined,retained=false;
  try{
   const token=request.headers.get('authorization')?.replace(/^Bearer /,'');if(!token||!/^[a-f0-9]{64}$/.test(token))return json({error:'Upload ticket required.'},401);
   const ticketHash=await digest(token),{expected}=await ctx.runMutation(anyApi.cloud.assets.authorizeUpload,{ticketHash,role});
   if(!['application/octet-stream',role==='source'?'application/x-blender':'image/png'].includes(request.headers.get('content-type')??''))return json({error:'Unsupported artifact content type.'},415);
   if(Number(request.headers.get('content-length')??0)>Math.min(expected.bytes,ASSET_LIMITS[role]))return json({error:'Artifact exceeds expected size.'},413);
   const reader=request.body?.getReader();if(!reader)return json({error:'Artifact body required.'},400);const chunks:Uint8Array[]=[];let size=0;
   while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>Math.min(expected.bytes,ASSET_LIMITS[role])){await reader.cancel();return json({error:'Artifact exceeds expected size.'},413);}chunks.push(next.value);}
   if(size!==expected.bytes)return json({error:'Artifact size mismatch.'},400);const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   try{validateArtifactSignature(role,bytes);}catch(error){return json({error:error instanceof Error?error.message:'Invalid artifact.'},400);}
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');if(hash!==expected.sha256)return json({error:'Artifact checksum mismatch.'},400);
   storageId=await ctx.storage.store(new Blob([bytes],{type:markedArtifactContentType(role)}));const result=await ctx.runMutation(anyApi.cloud.assets.stage,{ticketHash,role,storageId});retained=result.retained;return json({role,sha256:hash,bytes:size});
  }catch(error){const data=error instanceof ConvexError?error.data:null;if(data&&typeof data==='object'&&!Array.isArray(data)&&'code'in data)return json({error:'message'in data?String(data.message):String(data.code)},({unauthorized:401,forbidden:403,conflict:409,invalid:400,quota:429,rate_limited:429} as Record<string,number>)[String(data.code)]??400);return json({error:'Asset upload could not complete. Retry the same ticket and file.'},503);
  }finally{if(storageId&&!retained)try{await ctx.runMutation(anyApi.cloud.assets.deleteUnreferenced,{storageId});}catch{console.error('Temporary canonical artifact cleanup deferred.');}}
 })});
}}
