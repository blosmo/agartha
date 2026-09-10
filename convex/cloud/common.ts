import type {MutationCtx,QueryCtx} from '../_generated/server';
import {addressFromId,plotId,SPATIAL_FRAME,type PlotAddress} from '../../packages/protocol/src/plots';
import {ConvexError} from 'convex/values';
import {digest,fail} from '../scene/model';

export function assertCents(value: number, name = 'cents'): number {
  if (!Number.isSafeInteger(value) || value < 0) fail('invalid', `${name} must be a non-negative integer number of USD cents.`);
  return value;
}


/** Active and settled pools are bounded independently of withdrawal history. */
export async function fundingBackings(ctx: QueryCtx | MutationCtx, projectId: string, livemode: boolean, status: 'held' | 'settled') {
  const rows = await ctx.db.query('playgroundBackings').withIndex('by_project_mode_status', q => q.eq('projectId', projectId).eq('livemode', livemode).eq('status', status)).take(101);
  if (rows.length > 100) fail('invalid', 'Project backing capacity requires reconciliation.');
  return rows;
}
/** Resolve only jobs already committed to a grant; never grants quote/resume access. */
export async function allowanceForJob(ctx: QueryCtx | MutationCtx, walletOwner: string, livemode: boolean, jobId: string) {
  const allowance = await ctx.db.query('playgroundAllowances').withIndex('by_wallet', q => q.eq('walletOwner', walletOwner)).unique();
  return allowance && allowance.livemode === livemode && allowance.jobIds.includes(jobId) ? allowance : null;
}
export async function canAccessManagedReservation(ctx: QueryCtx | MutationCtx, walletOwner: string, livemode: boolean, reservationId: string, actorId: string) {
  if (!reservationId.startsWith('managed-')) return false;
  const jobId = reservationId.slice('managed-'.length);
  if (walletOwner.startsWith('playground-allowance-')) {
    const allowance = await allowanceForJob(ctx, walletOwner, livemode, jobId);
    return Boolean(allowance && (allowance.sponsorId === actorId || allowance.recipientId === actorId));
  }
  const pool = await ctx.db.query('playgroundFundingPools').withIndex('by_wallet', q => q.eq('walletOwner', walletOwner)).unique();
  if (!pool || pool.livemode !== livemode || pool.jobId !== jobId) return false;
  const proposal = await ctx.db.query('playgroundProjects').withIndex('by_project', q => q.eq('projectId', pool.projectId)).unique();
  return proposal?.creatorId === actorId;
}
export async function getOrCreateWallet(ctx: MutationCtx, agentId: string, livemode: boolean) {
  const existing = await ctx.db.query('blenderWallets').withIndex('by_agent_mode', q => q.eq('agentId', agentId).eq('livemode', livemode)).unique();
  if (existing) {
    // Pool accounts have no session credentials. Their authority follows every
    // participating prepaid wallet, including payment-dispute freezes.
    if (agentId.startsWith('playground-pool-')) {
      const pool = await ctx.db.query('playgroundFundingPools').withIndex('by_wallet', q => q.eq('walletOwner', agentId)).unique();
      if (!pool || pool.livemode !== livemode) throw new Error('Unknown project funding wallet.');
      const backings = await fundingBackings(ctx, pool.projectId, livemode, 'held');
      for (const backing of backings) {
        if (backing.status !== 'held') continue;
        const owner = await ctx.db.query('blenderWallets').withIndex('by_agent_mode', q => q.eq('agentId', backing.agentId).eq('livemode', livemode)).unique();
        if (!owner || owner.frozen) return { ...existing, frozen: true };
      }
    }
    if (agentId.startsWith('playground-allowance-')) {
      const allowance = await ctx.db.query('playgroundAllowances').withIndex('by_wallet', q => q.eq('walletOwner', agentId)).unique();
      if (!allowance || allowance.livemode !== livemode) throw new Error('Unknown agent allowance wallet.');
      const sponsor = await ctx.db.query('blenderWallets').withIndex('by_agent_mode', q => q.eq('agentId', allowance.sponsorId).eq('livemode', livemode)).unique();
      if (!sponsor || sponsor.frozen || allowance.status !== 'active') return { ...existing, frozen: true };
    }
    return existing;
  }
  const id = await ctx.db.insert('blenderWallets', { agentId, livemode, availableCents: 0, heldCents: 0, frozen: false, openDisputes: 0 });
  return (await ctx.db.get(id))!;
}

export async function requireBillingOwner(ctx: QueryCtx | MutationCtx, token: string) {
  const actor = await session(ctx, token);
  if (!actor) fail('unauthorized', 'Register an agent first.');
  return actor;
}
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
