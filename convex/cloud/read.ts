import { discovery } from '../governance/queries';
import {modelById,publicModel} from './models';
import {internalQuery,type QueryCtx,type MutationCtx} from '../_generated/server';
import {v} from 'convex/values';
import {plotId,addressFromId,DIRECTIONS,neighborAddress,roomLocation,SPATIAL_FRAME} from '../../packages/protocol/src/plots';
import {digest,fail} from '../scene/model';
import {CLOUD_GRID,externalId,publicWorld,session} from './common';
import type {Doc} from '../_generated/dataModel';

type Reader=QueryCtx|MutationCtx;
export async function snapshot(ctx:Reader,world:Doc<'sceneWorlds'>,token?:string,maximum=1000){
  const actor=await session(ctx,token);
  const [rows,events,owners]=await Promise.all([
    ctx.db.query('sceneObjects').withIndex('by_region',q=>q.eq('worldId',world.worldId).eq('region','0:0').eq('deleted',false)).take(maximum+1),
    ctx.db.query('sceneActivity').withIndex('by_region',q=>q.eq('worldId',world.worldId).eq('region','0:0')).order('desc').take(30),
    ctx.db.query('sceneAgents').withIndex('by_owner',q=>q.eq('worldId',world.worldId).eq('canCurate',true).eq('revoked',false)).take(16),
  ]);
  const visible=rows.slice(0,maximum),shaderIds=[...new Set(visible.flatMap(row=>row.object?.shaderId?[row.object.shaderId]:[]))];
  const shaders=await Promise.all(shaderIds.map(async id=>{const row=await ctx.db.query('sceneLibrary').withIndex('by_grid_entry',q=>q.eq('gridId',CLOUD_GRID).eq('libraryId',id)).unique();return row?.definition.kind==='shader'?{id:row.libraryId,...row.definition}:null;}));
  const modelCredits=await Promise.all([...new Set(visible.flatMap(row=>row.object?.modelId?[row.object.modelId]:[]))].map(async id=>{const model=publicModel(await modelById(ctx,id));return {id,name:model.name,...(model.source?{source:model.source}:{}),...(model.license?{license:model.license}:{}),...(model.attribution?{attribution:model.attribution}:{})};}));
  const member=actor?await ctx.db.query('sceneAgents').withIndex('by_agent',q=>q.eq('worldId',world.worldId).eq('agentId',actor.agentId)).unique():null;
  const governance=await discovery(ctx,`world:${externalId(world.worldId)}`,actor?.agentId);
  const version=await digest(JSON.stringify({governance,name:world.name,lifecycle:world.lifecycleVersion??1,archived:world.archivedAt??null,brief:world.briefVersion,objects:visible.map(row=>[row.objectId,row.version]),events:events.map(e=>e._id)}));
  return {schema:1 as const,id:externalId(world.worldId),name:world.name,brief:world.brief,briefVersion:world.briefVersion,revision:visible.reduce((sum,row)=>sum+row.version,world.briefVersion),version,cloud:true,placement:{x:world.plotX??0,z:world.plotZ??0,size:32 as const},
    location:roomLocation({x:world.plotX??0,z:world.plotZ??0}),lifecycleVersion:world.lifecycleVersion??1,archived:world.archivedAt!==undefined,
    objects:visible.filter(row=>row.object).map(row=>({...row.object!,author:row.author??row.owner,owner:row.owner})),modelCredits,objectVersions:Object.fromEntries(visible.map(row=>[row.objectId,row.version])),shaders:shaders.filter(s=>s!==null),hasMoreObjects:rows.length>maximum,
    governance,
    collaboration:{supported:true,owners:owners.map(({agentId,name})=>({agentId,name})),ownerVersion:world.ownerVersion??1,acceptanceAvailable:owners.length>0&&world.archivedAt===undefined,proposals:`/api/plots/${externalId(world.worldId)}/proposals`,events:`/api/plots/${externalId(world.worldId)}/proposal-events`,guide:'/agents/collaboration.md'},
    permissions:{agentId:actor?.agentId??null,canEditBrief:Boolean(member?.canCurate&&!member.revoked&&world.archivedAt===undefined),canManageRoom:Boolean(member?.canCurate&&!member.revoked)},
    events:events.map((event,index)=>({id:event._id,revision:events.length-index,author:event.author,message:event.message,summary:event.message,at:new Date(event.createdAt).toISOString()})),
  };
}
export const plot=internalQuery({args:{id:v.string(),token:v.optional(v.string())},handler:async(ctx,args)=>snapshot(ctx,await publicWorld(ctx,args.id),args.token)});
export const neighborhood=internalQuery({args:{x:v.number(),z:v.number(),token:v.optional(v.string())},handler:async(ctx,args)=>{
  try{plotId(args);}catch{fail('invalid','Invalid grid coordinates.');}
  const cells=[];for(let x=args.x-1;x<=args.x+1;x++)for(let z=args.z-1;z<=args.z+1;z++)if(Math.abs(x)<=10000&&Math.abs(z)<=10000)cells.push({x,z});
  const values=await Promise.all(cells.map(async cell=>{const world=await ctx.db.query('sceneWorlds').withIndex('by_grid_cell',q=>q.eq('gridId',CLOUD_GRID).eq('plotX',cell.x).eq('plotZ',cell.z)).unique();return world?.publicRead?await snapshot(ctx,world,args.token,cell.x===args.x&&cell.z===args.z?1000:200):null;}));
  return {center:{x:args.x,z:args.z},plotSize:32,cloud:true,spatialFrame:SPATIAL_FRAME,plots:values.filter(p=>p!==null&&(!p.archived||(p.placement.x===args.x&&p.placement.z===args.z))),archived:values.filter(p=>p?.archived).map(p=>({id:p!.id,name:p!.name,...p!.placement})),empty:cells.filter((_,i)=>!values[i]).map(cell=>({...cell,id:plotId(cell)}))};
}});
export const neighbors=internalQuery({args:{id:v.string()},handler:async(ctx,args)=>{
  const source=await publicWorld(ctx,args.id),position=addressFromId(args.id);const output=[];
  for(const direction of DIRECTIONS){let next;try{next=neighborAddress(position,direction);}catch{continue;}const world=await ctx.db.query('sceneWorlds').withIndex('by_grid_cell',q=>q.eq('gridId',source.gridId).eq('plotX',next.x).eq('plotZ',next.z)).unique();output.push({...next,id:plotId(next),direction,exists:Boolean(world?.publicRead&&world.archivedAt===undefined),archived:Boolean(world?.publicRead&&world.archivedAt!==undefined),name:world?.publicRead?world.name:undefined});}
  return output;
}});

export const summary=internalQuery({args:{x:v.number(),z:v.number()},handler:async(ctx,args)=>{
  try{plotId(args);}catch{fail('invalid','Invalid grid coordinates.');}
  const rooms=[],empty=[],archived=[];
  for(let x=args.x-1;x<=args.x+1;x++)for(let z=args.z-1;z<=args.z+1;z++){
    if(Math.abs(x)>10000||Math.abs(z)>10000)continue;
    const location=roomLocation({x,z}),room=await ctx.db.query('sceneWorlds').withIndex('by_grid_cell',q=>q.eq('gridId',CLOUD_GRID).eq('plotX',x).eq('plotZ',z)).unique();
    if(!room){empty.push({id:location.roomId,x,z});continue;}
    if(!room.publicRead)continue;
    const item={id:location.roomId,name:room.name,location,lifecycleVersion:room.lifecycleVersion??1};
    if(room.archivedAt!==undefined)archived.push(item);else rooms.push(item);
  }
  return {center:args,spatialFrame:SPATIAL_FRAME,rooms,empty,archived};
}});
