import {anyApi,httpActionGeneric,type HttpRouter} from 'convex/server';
import {ConvexError} from 'convex/values';
import {inspectGlb} from '../../packages/protocol/src/geometry/inspectGlb';
import {GLB_LIMITS} from '../../packages/protocol/src/geometry/glb';
import {digest} from '../scene/model';
import type {Id} from '../_generated/dataModel';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store'};
export function registerModelUpload(router:HttpRouter){
 router.route({path:'/model-upload',method:'OPTIONS',handler:httpActionGeneric(async()=>new Response(null,{status:204,headers}))});
 router.route({path:'/model-upload',method:'POST',handler:httpActionGeneric(async(ctx,request)=>{
  const json=(value:unknown,status=200,extra:Record<string,string>={})=>new Response(JSON.stringify(value),{status,headers:{...headers,'Content-Type':'application/json',...extra}});
  let storageId:Id<'_storage'>|undefined,retained=false;
  try{
   const token=request.headers.get('authorization')?.replace(/^Bearer /,'');if(!token||!/^[a-f0-9]{64}$/.test(token))return json({error:'Upload ticket required.'},401);
   const ticketHash=await digest(token);await ctx.runMutation(anyApi.cloud.models.authorizeUpload,{ticketHash});
   if(!['model/gltf-binary','application/octet-stream'].includes(request.headers.get('content-type')??''))return json({error:'Upload binary GLB content.'},415);
   if(Number(request.headers.get('content-length')??0)>GLB_LIMITS.bytes)return json({error:'GLB exceeds 16 MB.'},413);
   const reader=request.body?.getReader();if(!reader)return json({error:'GLB body required.'},400);
   const chunks:Uint8Array[]=[];let size=0;
   while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>GLB_LIMITS.bytes){await reader.cancel();return json({error:'GLB exceeds 16 MB.'},413);}chunks.push(next.value);}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   let inspection;try{inspection=inspectGlb(bytes);}catch(error){return json({error:error instanceof Error?error.message:'Invalid GLB.'},400);}
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
   storageId=await ctx.storage.store(new Blob([bytes],{type:'model/gltf-binary'}));
   const result=await ctx.runMutation(anyApi.cloud.models.commit,{ticketHash,storageId,modelId:`model-${hash}`,inspection});retained=result.retained;
   return json(result.model);
  }catch(error){
   const data=error instanceof ConvexError?error.data:null;
   if(data&&typeof data==='object'&&!Array.isArray(data)&&'code'in data){const status:Record<string,number>={unauthorized:401,forbidden:403,conflict:409,invalid:400,quota:429,rate_limited:429};return json({error:'message'in data?String(data.message):String(data.code)},status[String(data.code)]??400,'retryAfter'in data?{'Retry-After':String(data.retryAfter)}:{});}
   return json({error:'Model upload could not complete. Retry the same ticket and file.'},503);
  }finally{if(storageId&&!retained){try{if(!await ctx.runQuery(anyApi.cloud.models.storageReferenced,{storageId}))await ctx.storage.delete(storageId);}catch{console.error('Temporary model cleanup could not be verified.');}}}
 })});
}
