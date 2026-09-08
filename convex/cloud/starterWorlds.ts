/** Deployment-operator maintenance only. Deliberately has no HTTP or public mutation entry point. */
import {v} from 'convex/values';
import {internalMutation, type MutationCtx} from '../_generated/server';
import type {Doc} from '../_generated/dataModel';
import {digest,fail,identifier,label,objectValue,regionOf} from '../scene/model';
import {publicWorld} from './common';
import {snapshot} from './read';
import {validateChanges} from './proposalHelpers';
import {validateRenderBudget} from '../scene/renderBudget';
import {STARTER_BASELINE} from './starterBaseline';

const ELIGIBLE=new Set(['the-commons','plot-0--1','plot-1-0','plot-0-1','plot--1-0','plot--1--1','plot-1--1','plot--1-1','plot-1-1']);
export function canonical(value:unknown):string {
  return JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
}
async function rowsFor(ctx:MutationCtx,worldId:string){
  const rows=await ctx.db.query('sceneObjects').withIndex('by_object',q=>q.eq('worldId',worldId)).take(301);
  if(rows.length>300)fail('conflict','Starter history exceeds the bounded migration limit.');
  return rows;
}
async function guardedRoom(ctx:MutationCtx,id:string){
  if(!ELIGIBLE.has(id))fail('forbidden','Only the nine captured starter rooms are eligible.');
  const room=await publicWorld(ctx,id);
  if(room.archivedAt!==undefined)fail('forbidden','Archived starter rooms are not eligible.');
  const curator=await ctx.db.query('sceneAgents').withIndex('by_owner',q=>q.eq('worldId',room.worldId).eq('canCurate',true).eq('revoked',false)).first();
  if(curator)fail('forbidden','A starter room with a curator cannot be replaced.');
  return room;
}
async function rowHash(rows:Doc<'sceneObjects'>[]){return digest(canonical(rows));}
async function activity(ctx:MutationCtx,worldId:string,catalogId:string,operation:string){
  await ctx.db.insert('sceneActivity',{worldId,region:'0:0',agentId:'platform-seed',author:'Agartha Studio',message:`Starter catalog ${catalogId} ${operation}.`,requestId:`starter-${operation}-${catalogId}`,createdAt:Date.now()});
}
export const upgrade=internalMutation({args:{id:v.string(),expectedVersion:v.string(),catalogId:v.string(),objects:v.array(objectValue),brief:v.optional(v.string())},handler:async(ctx,args)=>{
  identifier(args.catalogId);
  if(!ELIGIBLE.has(args.id))fail('forbidden','Only the nine captured starter rooms are eligible.');
  const room=await publicWorld(ctx,args.id);
  const payloadHash=await digest(canonical(args));
  const receipt=await ctx.db.query('starterReceipts').withIndex('by_catalog',q=>q.eq('worldId',room.worldId).eq('catalogId',args.catalogId)).unique();
  if(receipt){
    if(receipt.payloadHash!==payloadHash)fail('conflict','Catalog ID already has a different payload.');
    return {id:args.id,catalogId:args.catalogId,version:receipt.rolledBackVersion??receipt.postVersion,status:receipt.rolledBackVersion?'rolled_back' as const:'applied' as const};
  }
  await guardedRoom(ctx,args.id);
  const baseline=STARTER_BASELINE[args.id],beforeSnapshot=await snapshot(ctx,room),rows=await rowsFor(ctx,room.worldId),live=rows.filter(r=>!r.deleted);
  if(!baseline||args.expectedVersion!==baseline.version||beforeSnapshot.version!==baseline.version)fail('conflict','Starter snapshot differs from the immutable captured baseline.');
  if(live.length>100||live.length!==baseline.objects.length)fail('conflict','Starter objects differ from the immutable captured baseline.');
  for(const row of live){
    if(row.owner!=='platform-seed')fail('forbidden','Starter contains foreign ownership.');
    const expected=baseline.objects.find(o=>o.id===row.objectId);
    if(!row.object||!expected||expected.version!==row.version||expected.hash!==await digest(canonical({...row.object,owner:row.owner,author:row.author??row.owner})))fail('conflict','Starter object content differs from the immutable captured baseline.');
  }
  if(!args.objects.length||args.objects.length>100||new Set(args.objects.map(o=>o.id)).size!==args.objects.length)fail('invalid','Use 1–100 unique replacement objects.');
  // New IDs preserve every original row, including any tombstones, for audit and rollback.
  if(args.objects.some(o=>rows.some(r=>r.objectId===o.id)))fail('conflict','Replacement IDs must not reuse any existing object row.');
  if(args.brief!==undefined)label(args.brief,1200);
  const changes=args.objects.map(object=>({id:object.id,expectedVersion:0,object}));
  for(let i=0;i<changes.length;i+=20)await validateChanges(ctx,room.worldId,changes.slice(i,i+20));
  await validateRenderBudget(ctx,room.worldId,[...live.map(r=>({id:r.objectId})),...changes]);
  const before=live.map(r=>({rowId:r._id,objectId:r.objectId,owner:r.owner,...(r.author!==undefined?{author:r.author}:{}),version:r.version,region:r.region,object:r.object!}));
  for(const row of live)await ctx.db.patch(row._id,{deleted:true,version:row.version+1});
  for(const object of args.objects)await ctx.db.insert('sceneObjects',{worldId:room.worldId,objectId:object.id,owner:'platform-seed',author:'Agartha Studio',version:1,region:regionOf(object.position),deleted:false,object});
  await ctx.db.patch(room._id,{brief:args.brief??room.brief,briefVersion:room.briefVersion+1});
  await activity(ctx,room.worldId,args.catalogId,'applied');
  const post=await snapshot(ctx,(await ctx.db.get(room._id))!);
  await ctx.db.insert('starterReceipts',{worldId:room.worldId,catalogId:args.catalogId,payloadHash,before,beforeBrief:room.brief,beforeSnapshot,postVersion:post.version,postRowsHash:await rowHash(await rowsFor(ctx,room.worldId)),createdAt:Date.now()});
  return {id:args.id,catalogId:args.catalogId,version:post.version,status:'applied' as const};
}});
export const rollback=internalMutation({args:{id:v.string(),catalogId:v.string(),expectedVersion:v.string()},handler:async(ctx,args)=>{
  const room=await guardedRoom(ctx,args.id),receipt=await ctx.db.query('starterReceipts').withIndex('by_catalog',q=>q.eq('worldId',room.worldId).eq('catalogId',args.catalogId)).unique();
  if(!receipt)fail('not_found','Starter catalog receipt not found.');
  if(receipt.rolledBackVersion)fail('conflict','Starter catalog is already rolled back.');
  const rows=await rowsFor(ctx,room.worldId),current=await snapshot(ctx,room);
  if(args.expectedVersion!==receipt.postVersion||current.version!==receipt.postVersion||await rowHash(rows)!==receipt.postRowsHash)fail('conflict','Starter changed after rollout; rollback cannot erase later contributions.');
  const changes=[...rows.filter(r=>!r.deleted).map(r=>({id:r.objectId})),...receipt.before.map(r=>({id:r.objectId,object:r.object}))];
  for(let i=0;i<receipt.before.length;i+=20)await validateChanges(ctx,room.worldId,receipt.before.slice(i,i+20).map(r=>({id:r.objectId,expectedVersion:r.version+1,object:r.object})));
  await validateRenderBudget(ctx,room.worldId,changes);
  for(const row of rows.filter(r=>!r.deleted))await ctx.db.patch(row._id,{deleted:true,version:row.version+1});
  for(const saved of receipt.before){const row=rows.find(r=>r._id===saved.rowId)!;await ctx.db.patch(saved.rowId,{owner:saved.owner,author:saved.author,object:saved.object,region:saved.region,deleted:false,version:row.version+1});}
  await ctx.db.patch(room._id,{brief:receipt.beforeBrief,briefVersion:room.briefVersion+1});
  await activity(ctx,room.worldId,args.catalogId,'rolled-back');
  const restored=await snapshot(ctx,(await ctx.db.get(room._id))!);
  await ctx.db.patch(receipt._id,{rolledBackVersion:restored.version});
  return {id:args.id,catalogId:args.catalogId,version:restored.version,status:'rolled_back' as const};
}});
