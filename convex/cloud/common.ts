import type {MutationCtx,QueryCtx} from '../_generated/server';
import {addressFromId,plotId,SPATIAL_FRAME,type PlotAddress} from '../../packages/protocol/src/plots';
import {ConvexError} from 'convex/values';
import {digest,fail} from '../scene/model';
export const CLOUD_GRID=SPATIAL_FRAME.gridId;
export const worldId=(id:string)=>{try{addressFromId(id);}catch{fail('invalid','Invalid plot address.');}return `public-${id}`;};
export const externalId=(id:string)=>id.startsWith('public-')?id.slice(7):id;
export async function session(ctx:QueryCtx|MutationCtx,token?:string){
  if(!token)return null;
  if(!/^[a-f0-9]{64}$/.test(token))fail('unauthorized','Invalid agent credential.');
  const hash=await digest(token),row=await ctx.db.query('cloudSessions').withIndex('by_token',q=>q.eq('tokenHash',hash)).unique();
  if(!row||row.revoked||row.expiresAt<=Date.now())fail('unauthorized','Agent session is expired or invalid.');return row;
}
export async function publicWorld(ctx:QueryCtx|MutationCtx,id:string){
  const value=await ctx.db.query('sceneWorlds').withIndex('by_world',q=>q.eq('worldId',worldId(id))).unique();
  if(!value||value.gridId!==CLOUD_GRID||!value.publicRead)fail('not_found','Plot not found.');return value;
}
export async function limit(ctx:MutationCtx,key:string,maximum:number,windowMs:number,cost=1){
  const now=Date.now(),row=await ctx.db.query('cloudLimits').withIndex('by_key',q=>q.eq('key',key)).unique();
  const fresh=!row||now-row.windowStart>=windowMs,count=(fresh?0:row.count)+cost;
  if(count>maximum)throw new ConvexError({code:'rate_limited',message:'Request limit reached. Please try again later.',retryAfter:Math.max(1,Math.ceil((row!.windowStart+windowMs-now)/1000))});
  if(row)await ctx.db.patch(row._id,{count,windowStart:fresh?now:row.windowStart});else await ctx.db.insert('cloudLimits',{key,count,windowStart:now});
}
export async function membership(ctx:MutationCtx,id:string,token:string){
  const actor=await session(ctx,token);if(!actor)fail('unauthorized','Register an agent first.');
  const plot=await publicWorld(ctx,id);if(plot.archivedAt!==undefined)fail('forbidden','This room is archived. Its creator can restore it.');const credential=await digest(`${token}:${plot.worldId}`),hash=await digest(credential);
  const row=await ctx.db.query('sceneAgents').withIndex('by_agent',q=>q.eq('worldId',plot.worldId).eq('agentId',actor.agentId)).unique();
  if(row){if(row.revoked)fail('forbidden','This agent cannot edit this plot.');await ctx.db.patch(row._id,{tokenHash:hash,expiresAt:actor.expiresAt,cloudCredentialVersion:actor.credentialVersion??0});}
  else await ctx.db.insert('sceneAgents',{worldId:plot.worldId,agentId:actor.agentId,name:actor.name,tokenHash:hash,cloudSessionId:actor._id,cloudCredentialVersion:actor.credentialVersion??0,revoked:false,canCurate:false,objectsAllocated:0,expiresAt:actor.expiresAt,liveObjects:0,windowStart:0,windowRequests:0});
  return {token:credential,worldId:plot.worldId,agentId:actor.agentId};
}
export function address(input:unknown):PlotAddress{
  if(!input||typeof input!=='object')fail('invalid','Provide plot coordinates.');
  const value=input as Record<string,unknown>,result={x:Number(value.x),z:Number(value.z)};
  try{plotId(result);}catch{fail('invalid','Invalid plot coordinates.');}return result;
}
