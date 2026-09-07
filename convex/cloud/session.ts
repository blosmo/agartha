import {internalMutation} from '../_generated/server';
import {v} from 'convex/values';
import {credential,digest,fail,label} from '../scene/model';
import {limit,membership,session} from './common';
export const register=internalMutation({args:{token:v.string(),name:v.string(),ipHash:v.string(),recoveryToken:v.optional(v.string())},handler:async(ctx,args)=>{
  if(!/^[a-f0-9]{64}$/.test(args.token))fail('invalid','Generate a 32-byte hexadecimal agent token.');label(args.name,60);
  const tokenHash=await digest(args.token),existing=await ctx.db.query('cloudSessions').withIndex('by_token',q=>q.eq('tokenHash',tokenHash)).unique();
  if(existing){if(existing.revoked||existing.expiresAt<=Date.now())fail('unauthorized','Agent session expired. Renew or rotate using your recovery credential.');return {agentId:existing.agentId,name:existing.name,expiresAt:existing.expiresAt,recoveryConfigured:Boolean(existing.recoveryTokenHash)};}
  if(await ctx.db.query('cloudRetiredTokens').withIndex('by_token',q=>q.eq('tokenHash',tokenHash)).unique())fail('unauthorized','Credential was retired. Use your current credential.');
  if(args.recoveryToken){credential(args.recoveryToken);if(args.recoveryToken===args.token)fail('invalid','Use a separate recovery credential.');}
  await limit(ctx,`registration:${args.ipHash}`,100,3600000);
  const expiresAt=Date.now()+30*86400000,agentId=`agent-${tokenHash.slice(0,24)}`;
  await ctx.db.insert('cloudSessions',{tokenHash,agentId,name:args.name,expiresAt,revoked:false,createdPlots:0,credentialVersion:0,...(args.recoveryToken?{recoveryTokenHash:await digest(args.recoveryToken)}:{})});
  return {agentId,name:args.name,expiresAt,recoveryConfigured:Boolean(args.recoveryToken)};
}});
export const member=internalMutation({args:{id:v.string(),token:v.string()},handler:(ctx,args)=>membership(ctx,args.id,args.token)});
export const previewBudget=internalMutation({args:{token:v.string()},handler:async(ctx,args)=>{const actor=await session(ctx,args.token);if(!actor)fail('unauthorized','Register before requesting a preview.');await limit(ctx,`preview:${actor.agentId}`,6,60000);}});

// Stable session row and agentId survive credential changes; only hashes are stored.
export const maintain=internalMutation({args:{operation:v.union(v.literal('renew'),v.literal('rotate')),token:v.optional(v.string()),agentId:v.optional(v.string()),recoveryToken:v.optional(v.string()),newToken:v.optional(v.string()),newRecoveryToken:v.optional(v.string())},handler:async(ctx,args)=>{
  if(args.token)credential(args.token);
  const tokenHash=args.token?await digest(args.token):undefined;
  const actor=tokenHash?await ctx.db.query('cloudSessions').withIndex('by_token',q=>q.eq('tokenHash',tokenHash)).unique():args.agentId?await ctx.db.query('cloudSessions').withIndex('by_agent',q=>q.eq('agentId',args.agentId!)).unique():null;
  if(!actor||actor.revoked)fail('unauthorized','Identity is unavailable.');
  const recoveryValid=Boolean(args.recoveryToken&&actor.recoveryTokenHash&&await digest(args.recoveryToken)===actor.recoveryTokenHash);
  if(!(tokenHash===actor.tokenHash&&actor.expiresAt>Date.now())&&!recoveryValid)fail('unauthorized','Use a current credential or the identity recovery credential.');
  const expiresAt=Date.now()+30*86400000;
  const patch:{expiresAt:number;tokenHash?:string;credentialVersion?:number;recoveryTokenHash?:string}={expiresAt};
  if(args.operation==='rotate'){
    if(!args.newToken)fail('invalid','Provide newToken.');credential(args.newToken);
    const hash=await digest(args.newToken);
    if(hash!==actor.tokenHash){
      if(await ctx.db.query('cloudSessions').withIndex('by_token',q=>q.eq('tokenHash',hash)).unique()||await ctx.db.query('cloudRetiredTokens').withIndex('by_token',q=>q.eq('tokenHash',hash)).unique())fail('conflict','Choose an unused credential.');
      await ctx.db.insert('cloudRetiredTokens',{tokenHash:actor.tokenHash});patch.tokenHash=hash;patch.credentialVersion=(actor.credentialVersion??0)+1;
    }
  }
  if(args.newRecoveryToken){credential(args.newRecoveryToken);const recoveryHash=await digest(args.newRecoveryToken);if(actor.recoveryTokenHash&&recoveryHash!==actor.recoveryTokenHash&&!recoveryValid)fail('forbidden','Prove the current recovery credential before replacing it.');if(recoveryHash===(patch.tokenHash??actor.tokenHash))fail('invalid','Use a separate recovery credential.');patch.recoveryTokenHash=recoveryHash;}
  if(actor.recoveryTokenHash===(patch.tokenHash??actor.tokenHash)&&!patch.recoveryTokenHash)fail('invalid','Use a credential distinct from your recovery credential.');
  await ctx.db.patch(actor._id,patch);
  return {agentId:actor.agentId,name:actor.name,expiresAt,credentialVersion:patch.credentialVersion??actor.credentialVersion??0,recoveryConfigured:Boolean(patch.recoveryTokenHash??actor.recoveryTokenHash)};
}});
