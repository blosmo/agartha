import {recordMeshCost} from './renderBudget';
import {validateModelRef} from '../cloud/models';
import { compileSurface } from '../../packages/protocol/src/surfaceShaders';
import { mutation, query } from '../_generated/server';
import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { agent, canRead, executeSceneEdit } from './authority';
import { digest, fail, identifier, REQUESTS_PER_MINUTE } from './model';
import { ENTRY_ID, instantiateAsset, normalizeLibraryDefinition, type AssetDefinition } from '../../packages/protocol/src/sharedLibrary';

export const publish=mutation({args:{worldId:v.string(),token:v.string(),definition:v.any()},handler:async(ctx,args)=>{
  const actor=await agent(ctx,args.worldId,args.token),source=await canRead(ctx,args.worldId,args.token);
  if(!source.gridId)fail('invalid','Publish reusable work from a grid plot.');
  let definition;try{definition=normalizeLibraryDefinition(args.definition);}catch(error){fail('invalid',error instanceof Error?error.message:'Invalid library definition.');}
  const libraryId=`${definition.kind}-${await digest(JSON.stringify(definition))}`;
  const existing=await ctx.db.query('sceneLibrary').withIndex('by_grid_entry',q=>q.eq('gridId',source.gridId!).eq('libraryId',libraryId)).unique();
  await recordMeshCost(ctx,source.gridId,libraryId,definition);
  if(existing)return {id:libraryId,...existing.definition,author:existing.author,createdAt:existing.createdAt};
  if((actor.publishedEntries??0)>=1000)fail('quota','Agent library quota reached.');
  const now=Date.now(),fresh=now-actor.windowStart>=60000;
  if(!fresh&&actor.windowRequests>=REQUESTS_PER_MINUTE)throw new ConvexError({code:'rate_limited',message:'Agent publish limit reached.',retryAfter:Math.max(1,Math.ceil((actor.windowStart+60000-now)/1000))});
  if(definition.kind==='asset')for(const object of definition.objects)await validateModelRef(ctx,object,source.gridId);
  if(definition.kind==='asset')for(const id of new Set(definition.objects.flatMap(object=>object.meshId?[object.meshId]:[]))){const mesh=await ctx.db.query('sceneLibrary').withIndex('by_grid_entry',q=>q.eq('gridId',source.gridId!).eq('libraryId',id)).unique();if(!mesh||mesh.kind!=='mesh')fail('invalid','Publish referenced meshes to this grid first.');}
  if(definition.kind==='asset')for(const id of new Set(definition.objects.flatMap(object=>object.shaderId?[object.shaderId]:[]))){const shader=await ctx.db.query('sceneLibrary').withIndex('by_grid_entry',q=>q.eq('gridId',source.gridId!).eq('libraryId',id)).unique();if(!shader||shader.kind!=='shader')fail('invalid','Publish referenced shaders to this grid first.');}
  await ctx.db.insert('sceneLibrary',{gridId:source.gridId,libraryId,kind:definition.kind,definition,author:actor.name,agentId:actor.agentId,createdAt:now});
  await ctx.db.patch(actor._id,{publishedEntries:(actor.publishedEntries??0)+1,windowStart:fresh?now:actor.windowStart,windowRequests:fresh?1:actor.windowRequests+1});
  return {id:libraryId,...definition,author:actor.name,createdAt:now};
}});
export const list=query({args:{worldId:v.string(),token:v.optional(v.string()),kind:v.union(v.literal('asset'),v.literal('shader'),v.literal('mesh')),paginationOpts:paginationOptsValidator},handler:async(ctx,args)=>{
  const source=await canRead(ctx,args.worldId,args.token);if(!source.gridId)fail('invalid','This world is not in a grid.');
  if(!Number.isInteger(args.paginationOpts.numItems)||args.paginationOpts.numItems<1||args.paginationOpts.numItems>20)fail('invalid','Read 1–20 library entries per page.');
  const result=await ctx.db.query('sceneLibrary').withIndex('by_kind',q=>q.eq('gridId',source.gridId!).eq('kind',args.kind)).paginate({...args.paginationOpts,maximumRowsRead:20,maximumBytesRead:256000});
  return {...result,page:result.page.map(row=>({id:row.libraryId,kind:row.kind,name:row.definition.name,description:row.definition.description,author:row.author,createdAt:row.createdAt,...(row.definition.kind==='asset'?{objectCount:row.definition.objects.length,bounds:row.definition.bounds}:row.definition.kind==='mesh'?{vertexCount:row.definition.geometry.positions.length/3,triangleCount:row.definition.geometry.indices.length/3,bounds:row.definition.geometry.bounds}:{expression:row.definition.expression,usesTime:row.definition.usesTime})}))};
}});
export const get=query({args:{worldId:v.string(),token:v.optional(v.string()),id:v.string()},handler:async(ctx,args)=>{
  const source=await canRead(ctx,args.worldId,args.token);if(!source.gridId)fail('invalid','This world is not in a grid.');if(!ENTRY_ID.test(args.id))fail('invalid','Invalid library ID.');
  const row=await ctx.db.query('sceneLibrary').withIndex('by_grid_entry',q=>q.eq('gridId',source.gridId!).eq('libraryId',args.id)).unique();if(!row)fail('not_found','Library entry not found.');
  return {id:row.libraryId,...row.definition,author:row.author,createdAt:row.createdAt,...(row.definition.kind==='shader'?{wgsl:compileSurface(row.definition.expression).wgsl,glsl:compileSurface(row.definition.expression).glsl}:{})};
}});
export const place=mutation({args:{worldId:v.string(),token:v.string(),assetId:v.string(),requestId:v.string(),issuedAt:v.number(),parameters:v.any(),preview:v.boolean()},handler:async(ctx,args)=>{
  const actor=await agent(ctx,args.worldId,args.token),source=await canRead(ctx,args.worldId,args.token);if(!source.gridId)fail('invalid','Place assets in a grid plot.');identifier(args.requestId);
  if(!ENTRY_ID.test(args.assetId)||!args.assetId.startsWith('asset-'))fail('invalid','Choose a reusable asset.');
  const row=await ctx.db.query('sceneLibrary').withIndex('by_grid_entry',q=>q.eq('gridId',source.gridId!).eq('libraryId',args.assetId)).unique();if(!row||row.definition.kind!=='asset')fail('not_found','Asset not found.');
  const prefix=`a-${(await digest(`${args.worldId}:${actor.agentId}:${args.requestId}`)).slice(0,48)}`;
  let objects;try{objects=instantiateAsset(row.definition as AssetDefinition,args.parameters,prefix);}catch(error){fail('invalid',error instanceof Error?error.message:'Invalid placement.');}
  if(args.preview)return {assetId:args.assetId,objects,objectCount:objects.length,requestId:args.requestId};
  return executeSceneEdit(ctx,{worldId:args.worldId,token:args.token,requestId:args.requestId,issuedAt:args.issuedAt,message:`Placed shared asset: ${row.definition.name}`,changes:objects.map(object=>({id:object.id,expectedVersion:0,object}))},100);
}});
