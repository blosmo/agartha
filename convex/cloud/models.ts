import {internalMutation,internalQuery,type MutationCtx,type QueryCtx} from '../_generated/server';
import {anyApi} from 'convex/server';
import {v} from 'convex/values';
import {CLOUD_GRID,session,limit} from './common';
import {digest,fail} from '../scene/model';
import {MODEL_ID} from '../../packages/protocol/src/modelAssets';
import type {GlbInspection} from '../../packages/protocol/src/geometry/inspectGlb';
import type {SceneObject} from '../scene/model';
import type {Doc} from '../_generated/dataModel';
export const metadataValue=v.object({name:v.string(),description:v.optional(v.string()),source:v.optional(v.string()),license:v.optional(v.string()),attribution:v.optional(v.string())});
export function publicModel(model:Doc<'cloudModels'>){return {id:model.modelId,name:model.name,author:model.author,description:model.description,createdAt:new Date(model.createdAt).toISOString(),inspection:model.inspection as GlbInspection,contentUrl:`/api/models/${model.modelId}/file`,...(model.source?{source:model.source}:{}),...(model.license?{license:model.license}:{}),...(model.attribution?{attribution:model.attribution}:{})};}
export async function modelById(ctx:QueryCtx|MutationCtx,id:string,gridId:string=CLOUD_GRID){
 if(!MODEL_ID.test(id))fail('invalid','Invalid model ID.');
 const model=await ctx.db.query('cloudModels').withIndex('by_model',q=>q.eq('gridId',gridId).eq('modelId',id)).unique();if(!model)fail('not_found','Model is not in this grid library.');return model;
}
export const get=internalQuery({args:{id:v.string()},handler:async(ctx,args)=>publicModel(await modelById(ctx,args.id))});
export const file=internalQuery({args:{id:v.string()},handler:async(ctx,args)=>{const model=await modelById(ctx,args.id),url=await ctx.storage.getUrl(model.storageId);if(!url)fail('not_found','Model file is unavailable.');return {modelFile:true,url,bytes:model.inspection.bytes};}});
export const list=internalQuery({args:{cursor:v.optional(v.string())},handler:async(ctx,args)=>{
 if(args.cursor&&!MODEL_ID.test(args.cursor))fail('invalid','Invalid model cursor.');
 const rows=await ctx.db.query('cloudModels').withIndex('by_model',q=>q.eq('gridId',CLOUD_GRID).gt('modelId',args.cursor??'')).take(26);
 return {entries:rows.slice(0,25).map(publicModel),cursor:rows.length>25?rows[24].modelId:null};
}});
export const begin=internalMutation({args:{token:v.string(),ticketHash:v.string(),metadata:metadataValue},handler:async(ctx,args)=>{
 const actor=await session(ctx,args.token);if(!actor)fail('unauthorized','Register before importing a model.');
 const m=args.metadata;if(!m.name.trim()||m.name.length>80||(m.description?.length??0)>500||(m.source?.length??0)>2000||(m.license?.length??0)>80||(m.attribution?.length??0)>500)fail('invalid','Invalid model metadata.');
 if(!/^[a-f0-9]{64}$/.test(args.ticketHash))fail('invalid','Invalid upload ticket.');
 await limit(ctx,`model-ticket:${actor.agentId}`,3,60000);
 if((actor.modelCount??0)>=64||(actor.modelBytes??0)>=128_000_000)fail('quota','Agent model storage quota reached.');
 const expiresAt=Date.now()+300000,id=await ctx.db.insert('cloudModelUploads',{ticketHash:args.ticketHash,sessionId:actor._id,metadata:{...m,name:m.name.trim()},expiresAt});
 await ctx.scheduler.runAfter(600000,anyApi.cloud.models.expire,{id});
 return {expiresAt,maxBytes:16000000};
}});
async function ticket(ctx:QueryCtx|MutationCtx,hash:string){
 const upload=await ctx.db.query('cloudModelUploads').withIndex('by_ticket',q=>q.eq('ticketHash',hash)).unique();if(!upload||upload.expiresAt<Date.now())fail('unauthorized','Upload ticket expired or invalid.');
 const actor=await ctx.db.get(upload.sessionId);if(!actor||actor.revoked||actor.expiresAt<=Date.now())fail('unauthorized','Agent session expired or revoked.');return {upload,actor};
}
export const authorizeUpload=internalMutation({args:{ticketHash:v.string()},handler:async(ctx,args)=>{const {upload,actor}=await ticket(ctx,args.ticketHash);await limit(ctx,`model-upload:${actor.agentId}`,6,60000);return {expiresAt:upload.expiresAt};}});
export const commit=internalMutation({args:{ticketHash:v.string(),storageId:v.id('_storage'),modelId:v.string(),inspection:v.any()},handler:async(ctx,args)=>{
 const {upload,actor}=await ticket(ctx,args.ticketHash);if(!MODEL_ID.test(args.modelId))fail('invalid','Invalid model digest.');
 if(upload.modelId&&upload.modelId!==args.modelId)fail('conflict','Upload ticket was already used for different content.');
 const stored=await ctx.db.system.get(args.storageId);if(!stored||stored.size!==args.inspection.bytes)fail('invalid','Model storage metadata mismatch.');
 const actual=Array.from(Uint8Array.from(atob(stored.sha256),c=>c.charCodeAt(0)),n=>n.toString(16).padStart(2,'0')).join('');if(`model-${actual}`!==args.modelId)fail('invalid','Model storage checksum mismatch.');
 const existing=await ctx.db.query('cloudModels').withIndex('by_model',q=>q.eq('gridId',CLOUD_GRID).eq('modelId',args.modelId)).unique();
 if(existing){await ctx.db.patch(upload._id,{modelId:existing.modelId});return {model:publicModel(existing),retained:existing.storageId===args.storageId};}
 if((actor.modelCount??0)>=64||(actor.modelBytes??0)+stored.size>128_000_000)fail('quota','Agent model storage quota reached.');
 const metadata=upload.metadata;
 const id=await ctx.db.insert('cloudModels',{gridId:CLOUD_GRID,modelId:args.modelId,storageId:args.storageId,inspection:args.inspection,name:metadata.name,description:metadata.description??'',author:actor.name,agentId:actor.agentId,createdAt:Date.now(),...(metadata.source?{source:metadata.source}:{}),...(metadata.license?{license:metadata.license}:{}),...(metadata.attribution?{attribution:metadata.attribution}:{})});
 await ctx.db.patch(actor._id,{modelCount:(actor.modelCount??0)+1,modelBytes:(actor.modelBytes??0)+stored.size});await ctx.db.patch(upload._id,{modelId:args.modelId});
 return {model:publicModel((await ctx.db.get(id))!),retained:true};
}});
export const expire=internalMutation({args:{id:v.id('cloudModelUploads')},handler:async(ctx,args)=>{const row=await ctx.db.get(args.id);if(row&&row.expiresAt<=Date.now())await ctx.db.delete(row._id);}});

export async function validateModelRef(ctx:QueryCtx|MutationCtx,object:Pick<SceneObject,'modelId'|'animation'>,gridId:string|undefined){
 if(!object.modelId)return;if(!gridId)fail('invalid','Imported models require a grid plot.');
 const model=await modelById(ctx,object.modelId,gridId);if(object.animation&&!(model.inspection as GlbInspection).animations.some(clip=>clip.name===object.animation!.clip))fail('invalid','Choose an animation clip present in the imported model.');
}
export const storageReferenced=internalQuery({args:{storageId:v.id('_storage')},handler:async(ctx,args)=>Boolean(await ctx.db.query('cloudModels').withIndex('by_storage',q=>q.eq('storageId',args.storageId)).first())});
