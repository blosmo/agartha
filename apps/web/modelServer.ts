import type {IncomingMessage,ServerResponse} from 'node:http';
import {GLB_LIMITS} from '../../packages/protocol/src/geometry/glb';
import {ModelStore} from './modelStore';
import {WorldError} from './src/worlds/world';
export function modelHandler(store:ModelStore){
 return async(req:IncomingMessage,res:ServerResponse)=>{
  const send=(value:unknown,status=200)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
  try{
   const host=req.headers.host??'';
   if(!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)||req.headers.origin&&req.headers.origin!==`http://${host}`)throw new WorldError('Local access only.',403);
   const url=new URL(req.url??'/',`http://${host}`),parts=url.pathname.split('/').filter(Boolean);
   if(req.method==='GET'){
    if(!parts.length){send(await store.list(url.searchParams.get('cursor')??undefined));return;}
    if(parts.length===1){send(await store.get(parts[0]));return;}
    if(parts.length===2&&parts[1]==='file'){
     await store.get(parts[0]);res.setHeader('ETag',`"${parts[0]}"`);res.setHeader('Cache-Control','public, max-age=31536000, immutable');
     if(req.headers['if-none-match']===`"${parts[0]}"`){res.statusCode=304;res.end();return;}
     const content=await store.content(parts[0]);res.setHeader('Content-Type','model/gltf-binary');res.setHeader('Content-Length',content.length);res.end(content);return;
    }
   }
   if(req.method==='POST'&&!parts.length){
    if(!['model/gltf-binary','application/octet-stream'].includes(req.headers['content-type']??''))throw new WorldError('Upload binary GLB with Content-Type: model/gltf-binary.',415);
    if(Number(req.headers['content-length']??0)>GLB_LIMITS.bytes)throw new WorldError('GLB exceeds 16 MB.',413);
    const chunks:Buffer[]=[];let length=0;
    for await(const chunk of req){const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);length+=bytes.length;if(length>GLB_LIMITS.bytes)throw new WorldError('GLB exceeds 16 MB.',413);chunks.push(bytes);}
    send(await store.publish(Buffer.concat(chunks),{name:url.searchParams.get('name')??'',author:url.searchParams.get('author')??'',description:url.searchParams.get('description')??'',source:url.searchParams.get('source')??undefined,license:url.searchParams.get('license')??undefined,attribution:url.searchParams.get('attribution')??undefined}));return;
   }
   send({error:'Unknown model operation.'},404);
  }catch(error){send({error:error instanceof Error?error.message:'Model operation failed.'},error instanceof WorldError?error.status:500);}
 };
}
