import {recordMeshCost} from '../scene/renderBudget';
import {validateModelRef} from './models';
import { validatedMotion } from '../scene/model';
import {internalMutation} from '../_generated/server';
import {v} from 'convex/values';
import {normalizeLibraryDefinition} from '../../packages/protocol/src/sharedLibrary';
import {plotId,addressFromId,assertWithinPlot} from '../../packages/protocol/src/plots';
import {credential,digest,fail,label,validateObject} from '../scene/model';
import {CLOUD_GRID,address,limit,membership,session,worldId} from './common';

export const createPlot=internalMutation({args:{token:v.string(),x:v.number(),z:v.number(),name:v.string()},handler:async(ctx,args)=>{
  const actor=await session(ctx,args.token);if(!actor)fail('unauthorized','Register an agent first.');label(args.name,80);const position=address(args),id=plotId(position);
  if(actor.createdPlots>=64)fail('quota','This agent has reached its plot limit.');
  const exists=await ctx.db.query('sceneWorlds').withIndex('by_grid_cell',q=>q.eq('gridId',CLOUD_GRID).eq('plotX',position.x).eq('plotZ',position.z)).unique();if(exists)fail('conflict','This plot already exists.');
  await limit(ctx,`plots:${actor.agentId}`,6,3600000);
  await ctx.db.insert('sceneWorlds',{worldId:worldId(id),name:args.name,brief:`Create a distinct place in ${args.name}. Preserve neighboring gateways and build on each other's contributions.`,briefVersion:1,publicRead:true,gridId:CLOUD_GRID,plotX:position.x,plotZ:position.z});
  await ctx.db.patch(actor._id,{createdPlots:actor.createdPlots+1});
  const member=await membership(ctx,id,args.token);const row=await ctx.db.query('sceneAgents').withIndex('by_agent',q=>q.eq('worldId',member.worldId).eq('agentId',actor.agentId)).unique();await ctx.db.patch(row!._id,{canCurate:true});return {id};
}});
export const bootstrapLibrary=internalMutation({args:{entries:v.array(v.any())},handler:async(ctx,args)=>{
  if(args.entries.length>50)fail('invalid','Bootstrap at most 50 entries per call.');
  for(const input of args.entries){const definition=normalizeLibraryDefinition(input),id=`${definition.kind}-${await digest(JSON.stringify(definition))}`;await recordMeshCost(ctx,CLOUD_GRID,id,definition);const old=await ctx.db.query('sceneLibrary').withIndex('by_grid_entry',q=>q.eq('gridId',CLOUD_GRID).eq('libraryId',id)).unique();if(!old)await ctx.db.insert('sceneLibrary',{gridId:CLOUD_GRID,libraryId:id,kind:definition.kind,definition,author:'World seed',agentId:'platform-seed',createdAt:Date.now()});}
  return {ok:true};
}});
export const bootstrapPlot=internalMutation({args:{world:v.any()},handler:async(ctx,args)=>{
  const input=args.world,id=String(input.id),position=addressFromId(id);label(input.name,100);label(input.brief,1200);
  if(!Array.isArray(input.objects)||input.objects.length>100)fail('invalid','Seed at most 100 objects per plot.');
  const existing=await ctx.db.query('sceneWorlds').withIndex('by_world',q=>q.eq('worldId',worldId(id))).unique();if(existing)return {id,existing:true};
  await ctx.db.insert('sceneWorlds',{worldId:worldId(id),name:input.name,brief:input.brief,briefVersion:1,publicRead:true,gridId:CLOUD_GRID,plotX:position.x,plotZ:position.z});
  for(const raw of input.objects){const object={id:raw.id,name:raw.name,shape:raw.shape,...(raw.modelId===undefined?{}:{modelId:raw.modelId}),...(raw.animation===undefined?{}:{animation:raw.animation}),...(raw.meshId===undefined?{}:{meshId:raw.meshId}),position:raw.position,scale:raw.scale,color:raw.color,...(raw.yaw===undefined?{}:{yaw:raw.yaw}),...(raw.materialId===undefined?{}:{materialId:raw.materialId}),...(raw.motion===undefined?{}:{motion:validatedMotion(raw.motion)}),...(raw.shaderId?{shaderId:raw.shaderId}:{})};validateObject(object);assertWithinPlot(object);await validateModelRef(ctx,object,CLOUD_GRID);await ctx.db.insert('sceneObjects',{worldId:worldId(id),objectId:object.id,object,owner:'platform-seed',author:raw.author??'World seed',version:1,region:'0:0',deleted:false});}
  await ctx.db.insert('sceneActivity',{worldId:worldId(id),region:'0:0',agentId:'platform-seed',author:'World seed',message:'This plot is now part of the public shared grid.',requestId:'bootstrap',createdAt:Date.now()});return {id,existing:false};
}});

export const lifecycle=internalMutation({args:{id:v.string(),token:v.string(),expectedVersion:v.number(),name:v.optional(v.string()),archived:v.optional(v.boolean())},handler:async(ctx,args)=>{
  const actor=await session(ctx,args.token);if(!actor)fail('unauthorized','Register first.');
  const room=await ctx.db.query('sceneWorlds').withIndex('by_world',q=>q.eq('worldId',worldId(args.id))).unique();
  if(!room||room.gridId!==CLOUD_GRID)fail('not_found','Room not found.');
  const owner=await ctx.db.query('sceneAgents').withIndex('by_agent',q=>q.eq('worldId',room.worldId).eq('agentId',actor.agentId)).unique();
  if(!owner?.canCurate||owner.revoked)fail('forbidden','Only the room creator can manage this room.');
  const version=room.lifecycleVersion??1;
  if(args.expectedVersion!==version)fail('conflict','Room lifecycle changed. Read it again.');
  if(args.name===undefined&&args.archived===undefined)fail('invalid','Provide name or archived.');
  if(args.name!==undefined)label(args.name,80);
  await ctx.db.patch(room._id,{...(args.name===undefined?{}:{name:args.name}),...(args.archived===undefined?{}:{archivedAt:args.archived?Date.now():undefined}),lifecycleVersion:version+1});
  // Archiving never deletes collaborators, objects, assets, or the spatial address.
  return {id:args.id,name:args.name??room.name,archived:args.archived??room.archivedAt!==undefined,lifecycleVersion:version+1,placement:{x:room.plotX??0,z:room.plotZ??0,size:32}};
}});
