import {internalMutation,internalQuery,type MutationCtx,type QueryCtx} from '../_generated/server';
import {anyApi} from 'convex/server';
import {v} from 'convex/values';
import type {Doc,Id} from '../_generated/dataModel';
import {session,limit} from './common';
import {digest,fail} from '../scene/model';
import {modelById} from './models';
import {artifactValue,assetMetadataValue,artifactRoleValue} from './assetSchema';
import {ASSET_LIMITS,BUNDLE_ID,canonicalAssetIdentity,normalizeAssetMetadata,artifactContentType,markedArtifactContentType,type ArtifactRole,type ArtifactDescriptor} from '../../packages/protocol/src/canonicalAssets';
export function publicAsset(row:Doc<'cloudAssets'>){return {id:row.bundleId,modelId:row.modelId,creatorAgentId:row.agentId,author:row.author,metadata:row.metadata,createdAt:new Date(row.createdAt).toISOString(),source:{...row.source,contentUrl:`/api/assets/${row.bundleId}/files/source`},preview:{...row.preview,contentUrl:`/api/assets/${row.bundleId}/files/preview`}};}
async function byId(ctx:QueryCtx|MutationCtx,id:string){if(!BUNDLE_ID.test(id))fail('invalid','Invalid bundle ID.');const row=await ctx.db.query('cloudAssets').withIndex('by_bundle',q=>q.eq('bundleId',id)).unique();if(!row)fail('not_found','Asset is not published.');return row;}
export const get=internalQuery({args:{id:v.string()},handler:async(ctx,{id})=>publicAsset(await byId(ctx,id))});
export const list=internalQuery({args:{cursor:v.optional(v.string())},handler:async(ctx,{cursor})=>{if(cursor&&!BUNDLE_ID.test(cursor))fail('invalid','Invalid asset cursor.');const rows=await ctx.db.query('cloudAssets').withIndex('by_bundle',q=>q.gt('bundleId',cursor??'')).take(26);return {entries:rows.slice(0,25).map(publicAsset),cursor:rows.length>25?rows[24].bundleId:null};}});
export const file=internalQuery({args:{id:v.string(),role:artifactRoleValue},handler:async(ctx,{id,role})=>{const row=await byId(ctx,id),url=await ctx.storage.getUrl(row[role==='source'?'sourceId':'previewId']);if(!url)fail('not_found','Asset file unavailable.');return {assetFile:true,url,bytes:row[role].bytes,contentType:artifactContentType(role)};}});
async function referenced(ctx:QueryCtx|MutationCtx,storageId:Id<'_storage'>){
 return Boolean(await ctx.db.query('cloudAssets').withIndex('by_source',q=>q.eq('sourceId',storageId)).first()||await ctx.db.query('cloudAssets').withIndex('by_preview',q=>q.eq('previewId',storageId)).first()||await ctx.db.query('cloudAssetUploads').withIndex('by_source',q=>q.eq('sourceId',storageId)).first()||await ctx.db.query('cloudAssetUploads').withIndex('by_preview',q=>q.eq('previewId',storageId)).first());
}
async function retire(ctx:MutationCtx,row:Doc<'cloudAssetUploads'>){await ctx.db.delete(row._id);for(const storageId of [row.sourceId,row.previewId])if(storageId&&!await referenced(ctx,storageId))await ctx.storage.delete(storageId);}
export const begin=internalMutation({args:{token:v.string(),ticketHash:v.string(),modelId:v.string(),metadata:assetMetadataValue,source:artifactValue,preview:artifactValue},handler:async(ctx,args)=>{
 const actor=await session(ctx,args.token);if(!actor)fail('unauthorized','Register before publishing an asset.');
 if(!/^[a-f0-9]{64}$/.test(args.ticketHash))fail('invalid','Invalid upload ticket.');
 await modelById(ctx,args.modelId);let identity:string,metadata;try{metadata=normalizeAssetMetadata(args.metadata);identity=canonicalAssetIdentity(actor.agentId,args.modelId,metadata,args.source,args.preview);}catch(error){fail('invalid',error instanceof Error?error.message:'Invalid bundle.');}
 if(metadata.parentId)await byId(ctx,metadata.parentId);
 const bundleId=`bundle-${await digest(identity)}`;
 const previous=await ctx.db.query('cloudAssetUploads').withIndex('by_ticket',q=>q.eq('ticketHash',args.ticketHash)).unique();if(previous){if(previous.bundleId!==bundleId||previous.sessionId!==actor._id)fail('conflict','Ticket already bound.');await ticket(ctx,args.ticketHash);return {id:bundleId,expiresAt:previous.expiresAt,limits:{source:ASSET_LIMITS.source,preview:ASSET_LIMITS.preview}};}
 await limit(ctx,`asset-ticket:${actor.agentId}`,6,60000);
 const expired=await ctx.db.query('cloudAssetUploads').withIndex('by_agent',q=>q.eq('agentId',actor.agentId).lte('expiresAt',Date.now())).take(50);
 for(const row of expired)await retire(ctx,row);
 const active=await ctx.db.query('cloudAssetUploads').withIndex('by_agent',q=>q.eq('agentId',actor.agentId).gt('expiresAt',Date.now())).take(100),pending=active.filter(row=>!row.finalized);
 if(pending.length>=ASSET_LIMITS.tickets)fail('quota','At most two active asset tickets.');
 const assets=await ctx.db.query('cloudAssets').withIndex('by_agent',q=>q.eq('agentId',actor.agentId)).take(65);
 const reservations=new Map(assets.map(row=>[row.bundleId,row.source.bytes+row.preview.bytes]));for(const row of pending)reservations.set(row.bundleId,row.source.bytes+row.preview.bytes);reservations.set(bundleId,args.source.bytes+args.preview.bytes);
 if(reservations.size>ASSET_LIMITS.agentCount||[...reservations.values()].reduce((a,b)=>a+b,0)>ASSET_LIMITS.agentBytes)fail('quota','Agent canonical asset storage quota reached.');
 const expiresAt=Date.now()+ASSET_LIMITS.ticketMs,id=await ctx.db.insert('cloudAssetUploads',{bundleId,agentId:actor.agentId,modelId:args.modelId,metadata,source:args.source,preview:args.preview,ticketHash:args.ticketHash,sessionId:actor._id,credentialHash:actor.tokenHash,expiresAt,finalized:false});
 await ctx.scheduler.runAfter(ASSET_LIMITS.ticketMs+1,anyApi.cloud.assets.expire,{id});return {id:bundleId,expiresAt,limits:{source:ASSET_LIMITS.source,preview:ASSET_LIMITS.preview}};
}});
async function ticket(ctx:QueryCtx|MutationCtx,ticketHash:string){const row=await ctx.db.query('cloudAssetUploads').withIndex('by_ticket',q=>q.eq('ticketHash',ticketHash)).unique();if(!row||row.expiresAt<=Date.now())fail('unauthorized','Asset ticket expired or invalid.');const actor=await ctx.db.get(row.sessionId);if(!actor||actor.revoked||actor.expiresAt<=Date.now()||actor.tokenHash!==row.credentialHash)fail('unauthorized','Asset identity expired or revoked.');return {row,actor};}
export const authorizeUpload=internalMutation({args:{ticketHash:v.string(),role:artifactRoleValue},handler:async(ctx,{ticketHash,role})=>{const {row,actor}=await ticket(ctx,ticketHash);await limit(ctx,`asset-upload:${actor.agentId}`,20,60000);return {expected:row[role],expiresAt:row.expiresAt};}});
async function verifyStoredArtifact(ctx:QueryCtx|MutationCtx,role:ArtifactRole,storageId:Id<'_storage'>,expected:ArtifactDescriptor){
 const stored=await ctx.db.system.get(storageId);
 if(!stored||stored.size!==expected.bytes||stored.contentType!==markedArtifactContentType(role))fail('invalid','Artifact storage metadata mismatch.');
 const hash=Array.from(Uint8Array.from(atob(stored.sha256),c=>c.charCodeAt(0)),n=>n.toString(16).padStart(2,'0')).join('');
 if(hash!==expected.sha256)fail('invalid','Artifact storage checksum mismatch.');
}
export const stage=internalMutation({args:{ticketHash:v.string(),role:artifactRoleValue,storageId:v.id('_storage')},handler:async(ctx,{ticketHash,role,storageId})=>{
 const {row}=await ticket(ctx,ticketHash);await verifyStoredArtifact(ctx,role,storageId,row[role]);
 const key=role==='source'?'sourceId':'previewId';if(row.finalized){const asset=await byId(ctx,row.bundleId);return {role,retained:asset[key]===storageId};}if(row[key])return {role,retained:row[key]===storageId};await ctx.db.patch(row._id,{[key]:storageId});return {role,retained:true};
}});
export const finalize=internalMutation({args:{token:v.string(),ticketHash:v.string()},handler:async(ctx,{token:credential,ticketHash})=>{
 const actor=await session(ctx,credential),{row}=await ticket(ctx,ticketHash);if(!actor||actor._id!==row.sessionId)fail('forbidden','Asset ticket belongs to another identity.');
 const model=await modelById(ctx,row.modelId),modelStorage=await ctx.db.system.get(model.storageId);
 if(!modelStorage||modelStorage.size!==model.inspection.bytes)fail('invalid','Model file unavailable or storage size mismatch.');
 const existing=await ctx.db.query('cloudAssets').withIndex('by_bundle',q=>q.eq('bundleId',row.bundleId)).unique();
 if(existing){await verifyStoredArtifact(ctx,'source',existing.sourceId,existing.source);await verifyStoredArtifact(ctx,'preview',existing.previewId,existing.preview);await ctx.db.patch(row._id,{finalized:true});return publicAsset(existing);}
 if(!row.sourceId||!row.previewId)fail('conflict','Upload both source and preview before finalizing.');
 await verifyStoredArtifact(ctx,'source',row.sourceId,row.source);await verifyStoredArtifact(ctx,'preview',row.previewId,row.preview);
 const id=await ctx.db.insert('cloudAssets',{bundleId:row.bundleId,agentId:row.agentId,modelId:row.modelId,metadata:row.metadata,source:row.source,preview:row.preview,sourceId:row.sourceId,previewId:row.previewId,author:actor.name,createdAt:Date.now()});await ctx.db.patch(row._id,{finalized:true});return publicAsset((await ctx.db.get(id))!);
}});
export const expire=internalMutation({args:{id:v.id('cloudAssetUploads')},handler:async(ctx,{id})=>{const row=await ctx.db.get(id);if(row&&row.expiresAt<=Date.now())await retire(ctx,row);}});
// Reference checks and deletion share one transaction with stage/finalize to avoid a check/delete race.
export const deleteUnreferenced=internalMutation({args:{storageId:v.id('_storage')},handler:async(ctx,{storageId})=>{const stored=await ctx.db.system.get(storageId);if(stored&&['source','preview'].some(role=>stored.contentType===markedArtifactContentType(role as ArtifactRole))&&!await referenced(ctx,storageId))await ctx.storage.delete(storageId);}});
export const sweep=internalMutation({args:{cursor:v.optional(v.string())},handler:async(ctx,{cursor})=>{
 const expired=await ctx.db.query('cloudAssetUploads').withIndex('by_expiry',q=>q.lte('expiresAt',Date.now())).take(50);for(const row of expired)await retire(ctx,row);
 const page=await ctx.db.system.query('_storage').paginate({cursor:cursor??null,numItems:50});let deleted=0;
 for(const row of page.page)if(row._creationTime<Date.now()-ASSET_LIMITS.ticketMs-ASSET_LIMITS.graceMs&&['source','preview'].some(role=>row.contentType===markedArtifactContentType(role as ArtifactRole))&&!await referenced(ctx,row._id)){await ctx.storage.delete(row._id);deleted++;}
 if(!page.isDone)await ctx.scheduler.runAfter(1000,anyApi.cloud.assets.sweep,{cursor:page.continueCursor});return {deleted};
}});
