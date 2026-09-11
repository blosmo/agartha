import { assertWorldRules } from '../../packages/protocol/src/governance';
import { worldRules } from '../governance/queries';
import {validateRenderBudget} from './renderBudget';
import {validateModelRef} from '../cloud/models';
import { CLOUD_GRID } from '../cloud/common';
import { assertWithinPlot, neighborAddress, validateAddress, type PlotDirection } from '../../packages/protocol/src/plots';
import { BUILDER_CATALOG, generateBuild } from '../../packages/protocol/src/worldbuilding';
import { mutation, query, type MutationCtx, type QueryCtx } from '../_generated/server';
import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { AGENT_OBJECT_QUOTA, MAX_BATCH, REQUESTS_PER_MINUTE, changeValue, credential, digest, fail, identifier, label, regionOf, validateObject, type SceneObject } from './model';
import { parseRoomEnvironment, type RoomEnvironment } from '../../packages/protocol/src/roomEnvironment';

type Reader = QueryCtx | MutationCtx;
async function world(ctx: Reader, worldId: string) {
  identifier(worldId);
  const row = await ctx.db.query('sceneWorlds').withIndex('by_world',q=>q.eq('worldId',worldId)).unique();
  if (!row) fail('not_found','World not found.');
  return row;
}
export async function agent(ctx: Reader, worldId: string, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) fail('unauthorized','Agent credential required.');
  const hash = await digest(token);
  const row = await ctx.db.query('sceneAgents').withIndex('by_token',q=>q.eq('tokenHash',hash)).unique();
  if (!row || row.worldId !== worldId || row.revoked || row.expiresAt <= Date.now()) fail('unauthorized','Agent credential is invalid, expired or revoked.');
  if(row.cloudSessionId){const session=await ctx.db.get(row.cloudSessionId);if(!session||session.revoked||session.expiresAt<=Date.now()||(row.cloudCredentialVersion??0)!==(session.credentialVersion??0))fail('unauthorized','Cloud session expired or revoked.');}
  const source=await world(ctx,worldId);if(source.archivedAt!==undefined)fail('forbidden','This room is archived.');
  return row;
}
export async function canRead(ctx: Reader, worldId: string, token?: string) {
  const row = await world(ctx,worldId);
  if (!row.publicRead) await agent(ctx,worldId,token ?? '');
  return row;
}
function operator(token: string) {
  const expected = process.env.AGARTHA_SCENE_OPERATOR_TOKEN;
  if (!expected || expected.length < 32 || token !== expected) fail('unauthorized','Operator credential required.');
}
function region(value: string) { if (!/^-?\d{1,5}:-?\d{1,5}$/.test(value)) fail('invalid','Region must be x:z tile coordinates.'); }

export const createWorld = mutation({
  args: { operatorToken:v.string(), worldId:v.string(), name:v.string(), brief:v.string(), curatorToken:v.string(), publicRead:v.boolean(), plot:v.optional(v.object({gridId:v.string(),x:v.number(),z:v.number()})) },
  handler: async (ctx,args) => {
    operator(args.operatorToken); identifier(args.worldId); label(args.name,100); label(args.brief,1200); credential(args.curatorToken);
    if (await ctx.db.query('sceneWorlds').withIndex('by_world',q=>q.eq('worldId',args.worldId)).unique()) fail('conflict','World already exists.');
    if (args.plot) {
      identifier(args.plot.gridId);
      try { validateAddress(args.plot); } catch (error) { fail('invalid',error instanceof Error ? error.message : 'Invalid plot address.'); }
      if (await ctx.db.query('sceneWorlds').withIndex('by_grid_cell',q=>q.eq('gridId',args.plot!.gridId).eq('plotX',args.plot!.x).eq('plotZ',args.plot!.z)).unique()) fail('conflict','This grid address is occupied.');
    }
    const tokenHash = await digest(args.curatorToken);
    if (await ctx.db.query('sceneAgents').withIndex('by_token',q=>q.eq('tokenHash',tokenHash)).unique()) fail('conflict','Use a new curator credential.');
    await ctx.db.insert('sceneWorlds',{worldId:args.worldId,name:args.name,brief:args.brief,briefVersion:1,environmentVersion:0,publicRead:args.publicRead,...(args.plot?{gridId:args.plot.gridId,plotX:args.plot.x,plotZ:args.plot.z}:{})});
    await ctx.db.insert('sceneAgents',{worldId:args.worldId,agentId:'curator',name:'Curator',tokenHash,revoked:false,canCurate:true,expiresAt:Date.now()+30*86400000,liveObjects:0,objectsAllocated:0,windowStart:0,windowRequests:0});
    return {worldId:args.worldId};
  },
});
export const invite = mutation({
  args: {worldId:v.string(),token:v.string(),inviteToken:v.string(),maxAgents:v.number()},
  handler: async (ctx,args) => {
    const curator = await agent(ctx,args.worldId,args.token);
    const destination = await world(ctx,args.worldId);
    if(destination.gridId===CLOUD_GRID)fail('forbidden','Use public cloud session registration for this grid.');
    if (!curator.canCurate) fail('forbidden','Only a curator can invite agents.');
    credential(args.inviteToken);
    if (!Number.isInteger(args.maxAgents)||args.maxAgents<1||args.maxAgents>100) fail('invalid','An invitation admits 1–100 agents.');
    const tokenHash=await digest(args.inviteToken);
    if (await ctx.db.query('sceneInvites').withIndex('by_token',q=>q.eq('tokenHash',tokenHash)).unique()) fail('conflict','Use a fresh invitation.');
    const expiresAt=Date.now()+3600000;
    await ctx.db.insert('sceneInvites',{worldId:args.worldId,tokenHash,expiresAt,remaining:args.maxAgents});
    return {expiresAt,maxAgents:args.maxAgents};
  },
});
export const join = mutation({
  args:{worldId:v.string(),inviteToken:v.string(),agentToken:v.string(),name:v.string()},
  handler: async(ctx,args)=>{
    credential(args.inviteToken); credential(args.agentToken); label(args.name,60);
    const destination=await world(ctx,args.worldId);
    if(destination.gridId===CLOUD_GRID)fail('forbidden','Use public cloud session registration for this grid.');
    const tokenHash=await digest(args.agentToken);
    const existing=await ctx.db.query('sceneAgents').withIndex('by_token',q=>q.eq('tokenHash',tokenHash)).unique();
    if(existing){
      if(existing.worldId!==args.worldId||existing.revoked||existing.expiresAt<=Date.now()) fail('unauthorized','Use a new agent credential.');
      return {agentId:existing.agentId,name:existing.name,expiresAt:existing.expiresAt};
    }
    const inviteHash=await digest(args.inviteToken);
    const invitation=await ctx.db.query('sceneInvites').withIndex('by_token',q=>q.eq('tokenHash',inviteHash)).unique();
    if(!invitation||invitation.worldId!==args.worldId||invitation.expiresAt<=Date.now()||invitation.remaining<1) fail('forbidden','Invitation is invalid, expired or exhausted.');
    const agentId=`agent-${tokenHash.slice(0,24)}`;
    const expiresAt=Date.now()+7*86400000;
    await ctx.db.insert('sceneAgents',{worldId:args.worldId,agentId,name:args.name,tokenHash,revoked:false,canCurate:false,expiresAt,liveObjects:0,objectsAllocated:0,windowStart:0,windowRequests:0});
    await ctx.db.patch(invitation._id,{remaining:invitation.remaining-1});
    return {agentId,name:args.name,expiresAt};
  },
});
export const revoke = mutation({
  args:{worldId:v.string(),token:v.string(),agentId:v.string()},
  handler:async(ctx,args)=>{
    const curator=await agent(ctx,args.worldId,args.token);
    if(!curator.canCurate) fail('forbidden','Only a curator can revoke agents.');
    const target=await ctx.db.query('sceneAgents').withIndex('by_agent',q=>q.eq('worldId',args.worldId).eq('agentId',args.agentId)).unique();
    if(!target) fail('not_found','Agent not found.');
    const room=await world(ctx,args.worldId);
    if(room.gridId===CLOUD_GRID&&target.canCurate)fail('forbidden','Remove the room owner role before revoking this agent.');
    await ctx.db.patch(target._id,{revoked:true});
  },
});
export const metadata = query({args:{worldId:v.string(),token:v.optional(v.string())},handler:async(ctx,args)=>{
  const row=await canRead(ctx,args.worldId,args.token);
  return {worldId:row.worldId,name:row.name,brief:row.brief,briefVersion:row.briefVersion,environment:row.environment,environmentVersion:row.environmentVersion??0,regionSize:32,maxBatch:MAX_BATCH,placement:placement(row)};
}});
export const objects = query({args:{worldId:v.string(),token:v.optional(v.string()),region:v.string(),paginationOpts:paginationOptsValidator},handler:async(ctx,args)=>{
  await canRead(ctx,args.worldId,args.token); region(args.region);
  if(!Number.isInteger(args.paginationOpts.numItems)||args.paginationOpts.numItems<1||args.paginationOpts.numItems>100) fail('invalid','Read 1–100 objects per page.');
  const result=await ctx.db.query('sceneObjects').withIndex('by_region',q=>q.eq('worldId',args.worldId).eq('region',args.region).eq('deleted',false)).paginate({...args.paginationOpts,maximumRowsRead:100,maximumBytesRead:256000});
  return {...result,page:result.page.map(row=>({object:row.object,owner:row.owner,version:row.version}))};
}});
export const inspect = query({args:{worldId:v.string(),token:v.optional(v.string()),ids:v.array(v.string())},handler:async(ctx,args)=>{
  await canRead(ctx,args.worldId,args.token);
  if(args.ids.length>20) fail('invalid','Inspect at most 20 IDs.');
  return Promise.all(args.ids.map(async id=>{identifier(id);const row=await ctx.db.query('sceneObjects').withIndex('by_object',q=>q.eq('worldId',args.worldId).eq('objectId',id)).unique();return row?{id,version:row.version,owner:row.owner,deleted:row.deleted,object:row.object}:{id,version:0,deleted:true};}));
}});
export const activity = query({args:{worldId:v.string(),token:v.optional(v.string()),region:v.string()},handler:async(ctx,args)=>{
  await canRead(ctx,args.worldId,args.token); region(args.region);
  const rows=await ctx.db.query('sceneActivity').withIndex('by_region',q=>q.eq('worldId',args.worldId).eq('region',args.region)).order('desc').take(30);
  return rows.map(({author,message,requestId,createdAt})=>({author,message,requestId,createdAt}));
}});
type SceneEdit = { worldId:string; token:string; requestId:string; issuedAt:number; message:string; changes:Array<{id:string;expectedVersion:number;object?:SceneObject}>; environment?:unknown; expectedEnvironmentVersion?:number };
export const edit = mutation({
  args:{worldId:v.string(),token:v.string(),requestId:v.string(),issuedAt:v.number(),message:v.string(),changes:v.array(changeValue),environment:v.optional(v.any()),expectedEnvironmentVersion:v.optional(v.number())},
  handler:executeSceneEdit,
});
export async function executeSceneEdit(ctx:MutationCtx,args:SceneEdit,maxBatch=MAX_BATCH){
    const actor = await agent(ctx,args.worldId,args.token);
    const plotWorld = await world(ctx,args.worldId);
    identifier(args.requestId); label(args.message,300);
    const now=Date.now();
    if(!Number.isFinite(args.issuedAt)||args.issuedAt>now+60000||args.issuedAt<now-86400000) fail('expired','Edits must be issued within the last 24 hours.');
    const hasEnvironment=args.environment!==undefined;
    if((hasEnvironment&&args.changes.length>0)||(!hasEnvironment&&args.changes.length<1)||args.changes.length>maxBatch) fail('invalid',hasEnvironment?'Update the room environment separately from geometry.':`Submit 1–${maxBatch} objects per edit.`);
    if(new Set(args.changes.map(c=>c.id)).size!==args.changes.length) fail('invalid','Duplicate IDs in edit.');
    let environment: RoomEnvironment|undefined;
    if(hasEnvironment){
      if(typeof args.expectedEnvironmentVersion!=='number'||!Number.isSafeInteger(args.expectedEnvironmentVersion)||args.expectedEnvironmentVersion<0) fail('invalid','Expected environment version must be a non-negative integer.');
      if(!actor.canCurate) fail('forbidden','Only a curator may update the room environment.');
      try { environment=parseRoomEnvironment(args.environment); } catch(error) { fail('invalid',error instanceof Error?error.message:'Invalid room environment.'); }
    }
    // Canonical fields, never include the bearer credential in a receipt.
    const payloadHash=await digest(JSON.stringify({issuedAt:args.issuedAt,message:args.message,changes:args.changes,environment,expectedEnvironmentVersion:args.expectedEnvironmentVersion}));
    const receipt=await ctx.db.query('sceneReceipts').withIndex('by_request',q=>q.eq('worldId',args.worldId).eq('agentId',actor.agentId).eq('requestId',args.requestId)).unique();
    if(receipt){if(receipt.payloadHash!==payloadHash) fail('conflict','Request ID was already used for a different edit.');return {requestId:args.requestId,changed:receipt.changed,replayed:true,...(hasEnvironment?{environment,environmentVersion:args.expectedEnvironmentVersion!+1}:{})};}
    const freshWindow=now-actor.windowStart>=60000;
    const cost=hasEnvironment?1:Math.ceil(args.changes.length/MAX_BATCH);
    if((freshWindow?0:actor.windowRequests)+cost>REQUESTS_PER_MINUTE) throw new ConvexError({code:'rate_limited',message:'Agent edit limit reached.',retryAfter:Math.max(1,Math.ceil((actor.windowStart+60000-now)/1000))});
    const currentRules=await worldRules(ctx,args.worldId);
    if(hasEnvironment){
      const currentEnvironmentVersion=plotWorld.environmentVersion??0;
      if(args.expectedEnvironmentVersion!==currentEnvironmentVersion) fail('conflict','The room environment changed.');
      const nextVersion=currentEnvironmentVersion+1;
      await Promise.all([
        ctx.db.patch(plotWorld._id,{...(environment?{environment}:{environment:undefined}),environmentVersion:nextVersion}),
        ctx.db.patch(actor._id,{windowStart:freshWindow?now:actor.windowStart,windowRequests:(freshWindow?0:actor.windowRequests)+cost}),
        ctx.db.insert('sceneReceipts',{worldId:args.worldId,agentId:actor.agentId,requestId:args.requestId,payloadHash,changed:[],createdAt:now}),
        ctx.db.insert('sceneActivity',{worldId:args.worldId,region:'0:0',agentId:actor.agentId,author:actor.name,message:args.message,requestId:args.requestId,createdAt:now}),
      ]);
      return {requestId:args.requestId,changed:[],replayed:false,environment,environmentVersion:nextVersion};
    }
    for (const change of args.changes) {
      identifier(change.id);
      if (!Number.isSafeInteger(change.expectedVersion) || change.expectedVersion < 0) fail('invalid','Expected version must be a non-negative integer.');
      if (change.object) { validateObject(change.object);
        try { assertWorldRules(change.object,currentRules); } catch(error) { fail('invalid',error instanceof Error?error.message:'World rules rejected this object.'); } if(change.object.id !== change.id) fail('invalid','Object ID must match change ID.');
        if (placement(plotWorld)) { try { assertWithinPlot(change.object); } catch (error) { fail('invalid',error instanceof Error ? error.message : 'Outside plot bounds.'); } } }
    }
    for(const change of args.changes)if(change.object)await validateModelRef(ctx,change.object,plotWorld.gridId);
    const meshIds=[...new Set(args.changes.flatMap(change=>change.object?.meshId?[change.object.meshId]:[]))];
    if(meshIds.length&&!plotWorld.gridId)fail('invalid','Meshes require a grid plot.');
    for(const id of meshIds){const mesh=await ctx.db.query('sceneLibrary').withIndex('by_grid_entry',q=>q.eq('gridId',plotWorld.gridId!).eq('libraryId',id)).unique();if(!mesh||mesh.kind!=='mesh')fail('invalid','Mesh is not in this grid library.');}
    const shaderIds=[...new Set(args.changes.flatMap(change=>change.object?.shaderId?[change.object.shaderId]:[]))];
    if(shaderIds.length&&!plotWorld.gridId)fail('invalid','Shared surfaces require a grid plot.');
    await Promise.all(shaderIds.map(async shaderId=>{const shader=await ctx.db.query('sceneLibrary').withIndex('by_grid_entry',q=>q.eq('gridId',plotWorld.gridId!).eq('libraryId',shaderId)).unique();if(!shader||shader.kind!=='shader')fail('invalid','Surface shader is not in this grid library.');}));
    const existingObjects = await Promise.all(args.changes.map(change =>
      ctx.db.query('sceneObjects').withIndex('by_object',q=>q.eq('worldId',args.worldId).eq('objectId',change.id)).unique(),
    ));
    let liveDelta=0,allocatedDelta=0;
    const touchedRegions=new Set<string>();
    const plans=args.changes.map((change,index)=>{
      const existing=existingObjects[index];
      if((existing?.version??0)!==change.expectedVersion) fail('conflict',`Object ${change.id} changed. Inspect it and reconcile before retrying.`);
      if(existing&&existing.owner!==actor.agentId) fail('forbidden','Only the owning agent may change this object.');
      if(!change.object&&(!existing||existing.deleted)) fail('invalid','Cannot remove an absent object.');
      const nextRegion=change.object?regionOf(change.object.position):existing!.region;
      touchedRegions.add(nextRegion);if(existing)touchedRegions.add(existing.region);
      liveDelta+=(change.object?1:0)-(existing&&!existing.deleted?1:0);
      if(!existing)allocatedDelta++;
      const version=(existing?.version??0)+1;
      return {existing,fields:{worldId:args.worldId,objectId:change.id,owner:actor.agentId,author:actor.name,version,region:nextRegion,deleted:!change.object,object:change.object}};
    });
    if(actor.liveObjects+liveDelta>AGENT_OBJECT_QUOTA||actor.objectsAllocated+allocatedDelta>10000) fail('quota','Agent object quota reached.');
    await validateRenderBudget(ctx,args.worldId,args.changes);
    const changed=plans.map(({fields})=>({id:fields.objectId,version:fields.version}));
    // All validation precedes writes; Convex commits the complete batch atomically.
    await Promise.all([
      ...plans.map(({existing,fields})=>existing?ctx.db.replace(existing._id,fields):ctx.db.insert('sceneObjects',fields)),
      ctx.db.patch(actor._id,{liveObjects:actor.liveObjects+liveDelta,objectsAllocated:actor.objectsAllocated+allocatedDelta,windowStart:freshWindow?now:actor.windowStart,windowRequests:(freshWindow?0:actor.windowRequests)+cost}),
      ctx.db.insert('sceneReceipts',{worldId:args.worldId,agentId:actor.agentId,requestId:args.requestId,payloadHash,changed,createdAt:now}),
      ...[...touchedRegions].map(region=>ctx.db.insert('sceneActivity',{worldId:args.worldId,region,agentId:actor.agentId,author:actor.name,message:args.message,requestId:args.requestId,createdAt:now})),
    ]);
    return {requestId:args.requestId,changed,replayed:false};
}
export const updateBrief = mutation({args:{worldId:v.string(),token:v.string(),expectedVersion:v.number(),brief:v.string()},handler:async(ctx,args)=>{
  const actor=await agent(ctx,args.worldId,args.token);
  if(!actor.canCurate) fail('forbidden','Only a curator may update the shared brief.');
  label(args.brief,1200);const row=await world(ctx,args.worldId);
  if(args.expectedVersion!==row.briefVersion) fail('conflict','The shared brief changed.');
  await ctx.db.patch(row._id,{brief:args.brief,briefVersion:row.briefVersion+1});
  return {briefVersion:row.briefVersion+1};
}});

function placement(row:{gridId?:string;plotX?:number;plotZ?:number}) {
  return row.gridId !== undefined && row.plotX !== undefined && row.plotZ !== undefined ? {gridId:row.gridId,x:row.plotX,z:row.plotZ,size:32} : null;
}
export const grid = query({args:{worldId:v.string(),token:v.optional(v.string())},handler:async(ctx,args)=>{
  const source=await canRead(ctx,args.worldId,args.token),position=placement(source);
  if(!position)fail('invalid','This world has not been placed in a grid.');
  const cells=[];
  for(let x=position.x-1;x<=position.x+1;x++)for(let z=position.z-1;z<=position.z+1;z++)if(Math.abs(x)<=10000&&Math.abs(z)<=10000)cells.push({x,z});
  const plots=await Promise.all(cells.map(async cell=>{
    const row=await ctx.db.query('sceneWorlds').withIndex('by_grid_cell',q=>q.eq('gridId',position.gridId).eq('plotX',cell.x).eq('plotZ',cell.z)).unique();
    if(!row)return {...cell,exists:false,accessible:false};
    if(row.worldId!==args.worldId&&!row.publicRead)return {...cell,exists:true,accessible:false};
    return {...cell,exists:true,accessible:true,worldId:row.worldId,name:row.name,briefVersion:row.briefVersion};
  }));
  return {gridId:position.gridId,center:{x:position.x,z:position.z},plotSize:32,plots};
}});
export const traverse = query({args:{worldId:v.string(),token:v.optional(v.string()),direction:v.union(v.literal('north'),v.literal('east'),v.literal('south'),v.literal('west'))},handler:async(ctx,args)=>{
  const source=await canRead(ctx,args.worldId,args.token),position=placement(source);
  if(!position)fail('invalid','This world has not been placed in a grid.');
  let next;try{next=neighborAddress(position,args.direction as PlotDirection);}catch{fail('not_found','This gateway is at the edge of the grid.');}
  const destination=await ctx.db.query('sceneWorlds').withIndex('by_grid_cell',q=>q.eq('gridId',position.gridId).eq('plotX',next.x).eq('plotZ',next.z)).unique();
  if(!destination)fail('not_found','The neighboring plot has not been started.');
  if(!destination.publicRead)fail('forbidden','The neighboring world requires its own invitation.');
  return {worldId:destination.worldId,name:destination.name,brief:destination.brief,placement:placement(destination),gateway:{from:args.worldId,direction:args.direction,permeable:true},canWrite:false};
}});
export const tools = query({args:{},handler:async()=>BUILDER_CATALOG});
export const build = mutation({args:{worldId:v.string(),token:v.string(),requestId:v.string(),issuedAt:v.number(),parameters:v.any(),preview:v.boolean()},handler:async(ctx,args)=>{
  const actor=await agent(ctx,args.worldId,args.token),source=await world(ctx,args.worldId);
  if(!placement(source))fail('invalid','Builder recipes require a grid plot.');
  identifier(args.requestId);
  const prefix=`b-${(await digest(`${args.worldId}:${actor.agentId}:${args.requestId}`)).slice(0,48)}`;
  let generated;try{generated=generateBuild(args.parameters,prefix);}catch(error){fail('invalid',error instanceof Error?error.message:'Invalid builder parameters.');}
  if(args.preview)return {...generated,worldId:args.worldId,requestId:args.requestId};
  return executeSceneEdit(ctx,{worldId:args.worldId,token:args.token,requestId:args.requestId,issuedAt:args.issuedAt,message:generated.summary,changes:generated.objects.map(object=>({id:object.id,expectedVersion:0,object}))});
}});
