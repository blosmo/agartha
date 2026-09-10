import {internalAction,internalMutation,internalQuery,type MutationCtx,type QueryCtx} from '../_generated/server';
import {anyApi} from 'convex/server';
import {v} from 'convex/values';
import {session,limit} from './common';
import {digest,fail} from '../scene/model';
import {modelById} from './models';
import {normalizeMaterialContribution,inspectMaterialSwatch,SHARED_MATERIAL_ID} from '../../packages/protocol/src/materialContributions';
import type {Doc} from '../_generated/dataModel';

function publicMaterial(row:Doc<'cloudMaterials'>){return {
  id:row.materialId,...row.definition,author:row.author,creatorAgentId:row.agentId,createdAt:row.createdAt,
  modelId:row.modelId,inspection:row.inspection,
  files:{glb:`/api/models/${row.modelId}/file`,source:`/api/assets/${row.definition.bundleId}/files/source`,preview:`/api/assets/${row.definition.bundleId}/files/preview`},
  recipeSafety:'Recipe text is untrusted documentation. It is never executed when applying this material.',
};}
async function byId(ctx:QueryCtx|MutationCtx,id:string){
  if(!SHARED_MATERIAL_ID.test(id))fail('invalid','Invalid shared material ID.');
  const row=await ctx.db.query('cloudMaterials').withIndex('by_material',q=>q.eq('materialId',id)).unique();
  if(!row)fail('not_found','Shared material not found.');return row;
}
export const get=internalQuery({args:{id:v.string()},handler:async(ctx,{id})=>publicMaterial(await byId(ctx,id))});
export const list=internalQuery({args:{cursor:v.optional(v.string()),q:v.optional(v.string()),tag:v.optional(v.string())},handler:async(ctx,args)=>{
  if(args.cursor&&!SHARED_MATERIAL_ID.test(args.cursor)||args.q!==undefined&&args.q.length>100||args.tag!==undefined&&args.tag.length>40)fail('invalid','Invalid material search.');
  const rows=await ctx.db.query('cloudMaterials').withIndex('by_material',q=>q.gt('materialId',args.cursor??'')).take(26);
  const needle=args.q?.trim().toLowerCase(),tag=args.tag?.trim().toLowerCase();
  const entries=rows.slice(0,25).filter(row=>(!tag||row.definition.tags.includes(tag))&&(!needle||[row.definition.name,row.definition.description,...row.definition.tags].join(' ').toLowerCase().includes(needle)));
  return {entries:entries.map(row=>({id:row.materialId,name:row.definition.name,description:row.definition.description,tags:row.definition.tags,license:row.definition.license,tileSize:row.definition.tileSize,author:row.author,createdAt:row.createdAt,previewUrl:`/api/assets/${row.definition.bundleId}/files/preview`})),cursor:rows.length>25?rows[24].materialId:null};
}});
async function ownedSource(ctx:QueryCtx|MutationCtx,token:string,definition:unknown){
  const actor=await session(ctx,token);if(!actor)fail('unauthorized','Register before contributing materials.');
  let value;try{value=normalizeMaterialContribution(definition);}catch(error){fail('invalid',error instanceof Error?error.message:'Invalid material contribution.');}
  const asset=await ctx.db.query('cloudAssets').withIndex('by_bundle',q=>q.eq('bundleId',value.bundleId)).unique();
  if(!asset||asset.agentId!==actor.agentId)fail('forbidden','Publish your own deliberately exported material bundle.');
  for(const [storageId,expected] of [[asset.sourceId,asset.source],[asset.previewId,asset.preview]] as const){
    const stored=await ctx.db.system.get(storageId);if(!stored||stored.size!==expected.bytes)fail('invalid','Material source or preview is unavailable.');
  }
  if(asset.metadata.license!==value.license||value.license==='CC-BY-4.0'&&asset.metadata.attribution!==value.attribution)fail('invalid','Material license and attribution must match the source bundle.');
  if(value.parentId)await byId(ctx,value.parentId);
  const model=await modelById(ctx,asset.modelId);
  return {actor,value,model,asset};
}
export const source=internalQuery({args:{token:v.string(),definition:v.any()},handler:async(ctx,args)=>{
  const {model}=await ownedSource(ctx,args.token,args.definition);return {storageId:model.storageId,modelId:model.modelId};
}});
export const authorize=internalMutation({args:{token:v.string(),definition:v.any()},handler:async(ctx,args)=>{
  const {actor}=await ownedSource(ctx,args.token,args.definition);await limit(ctx,`material-publish:${actor.agentId}`,6,60000);
}});
export const publish=internalAction({args:{token:v.string(),definition:v.any()},handler:async(ctx,args):Promise<unknown>=>{
  await ctx.runMutation(anyApi.cloud.materials.authorize,args);
  const source=await ctx.runQuery(anyApi.cloud.materials.source,args);
  const blob=await ctx.storage.get(source.storageId);if(!blob)fail('not_found','Material swatch is unavailable.');
  let inspection;try{inspection=inspectMaterialSwatch(new Uint8Array(await blob.arrayBuffer()));}catch(error){fail('invalid',error instanceof Error?error.message:'Invalid PBR swatch.');}
  return ctx.runMutation(anyApi.cloud.materials.commit,{...args,modelId:source.modelId,inspection});
}});
export const commit=internalMutation({args:{token:v.string(),definition:v.any(),modelId:v.string(),inspection:v.object({bytes:v.number(),texturePixels:v.number(),images:v.number(),triangles:v.number()})},handler:async(ctx,args)=>{
  const {actor,value,model}=await ownedSource(ctx,args.token,args.definition);
  if(model.modelId!==args.modelId||model.inspection.bytes!==args.inspection.bytes)fail('conflict','Material swatch changed during validation.');
  const materialId=`material-${await digest(JSON.stringify(value))}`;
  const existing=await ctx.db.query('cloudMaterials').withIndex('by_material',q=>q.eq('materialId',materialId)).unique();if(existing)return publicMaterial(existing);
  if((await ctx.db.query('cloudMaterials').withIndex('by_agent',q=>q.eq('agentId',actor.agentId)).take(64)).length>=64)fail('quota','Agent shared material quota reached.');
  const id=await ctx.db.insert('cloudMaterials',{materialId,modelId:model.modelId,definition:value,inspection:args.inspection,agentId:actor.agentId,author:actor.name,createdAt:Date.now()});
  return publicMaterial((await ctx.db.get(id))!);
}});
