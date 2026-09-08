import {convexTest} from 'convex-test';
import {anyApi} from 'convex/server';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import schema from './schema';
import {digest} from './scene/model';
import {markedArtifactContentType,type ArtifactRole} from '../packages/protocol/src/canonicalAssets';
const modules=import.meta.glob('./**/*.{ts,js}'),token='a'.repeat(64),otherToken='b'.repeat(64),modelId=`model-${'c'.repeat(64)}`;
const source=new TextEncoder().encode('BLENDER-v300source');
const preview=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWNocFD4DwAEBAHgAJsDCwAAAABJRU5ErkJggg=='),c=>c.charCodeAt(0));
const descriptor=async(bytes:Uint8Array)=>({sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join(''),bytes:bytes.length});
beforeEach(()=>vi.useFakeTimers({now:new Date('2026-09-08T00:00:00Z')}));afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
async function setup(){const t=convexTest({schema,modules,transactionLimits:true});// convex-test 0.0.56 omits Blob.type in _storage; mirror production metadata in the harness.
 const runtime=(globalThis as any).Convex,getter=Object.getOwnPropertyDescriptor(runtime,'jsSyscall')!.get!;
 vi.spyOn(runtime,'jsSyscall','get').mockImplementation(()=>{const original=getter.call(runtime);return async(op:string,args:any)=>{const result=await original(op,args);if(op==='storage/storeBlob'&&args.blob.type){try{await runtime.asyncSyscall('1.0/shallowMerge',JSON.stringify({table:'_storage',id:result,value:{contentType:args.blob.type}}));}catch{await t.run(ctx=>(ctx.db as any).patch(result,{contentType:args.blob.type}));}}return result;};});
 await t.run(async ctx=>{
 for(const [credential,agentId]of [[token,'author'],[otherToken,'reader']])await ctx.db.insert('cloudSessions',{tokenHash:await digest(credential),agentId,name:agentId,expiresAt:Date.now()+86400000,revoked:false,createdPlots:0});
 const storageId=await ctx.storage.store(new Blob(['model']));await ctx.db.insert('cloudModels',{gridId:'agartha-public-v1',modelId,storageId,name:'Model',description:'',author:'original',agentId:'original',createdAt:Date.now(),inspection:{bytes:5}});
 });return t;}
let nonce=0;
async function begin(t:ReturnType<typeof convexTest>,overrides:Record<string,unknown>={}){const uploadToken=(++nonce).toString(16).padStart(64,'0'),ticketHash=await digest(uploadToken);const result=await t.mutation(anyApi.cloud.assets.begin,{token,ticketHash,modelId,metadata:{name:' Canonical '},source:await descriptor(source),preview:await descriptor(preview),...overrides});return {...result,uploadToken,ticketHash};}
const send=(t:ReturnType<typeof convexTest>,uploadToken:string,role:ArtifactRole,bytes=role==='source'?source:preview)=>t.fetch(`/asset-upload/${role}`,{method:'POST',headers:{Authorization:`Bearer ${uploadToken}`,'Content-Type':role==='source'?'application/x-blender':'image/png'},body:bytes});
async function finish(t:ReturnType<typeof convexTest>,upload:Awaited<ReturnType<typeof begin>>){for(const role of ['source','preview'] as ArtifactRole[]){const response=await send(t,upload.uploadToken,role);expect(response.status,await response.text()).toBe(200);}return t.mutation(anyApi.cloud.assets.finalize,{token,ticketHash:upload.ticketHash});}
it('keeps partial bundles private, publishes atomically, retries and exposes only safe download references',async()=>{
 const t=await setup(),upload=await begin(t);expect((await t.query(anyApi.cloud.assets.list,{})).entries).toHaveLength(0);
 await expect(t.mutation(anyApi.cloud.assets.finalize,{token,ticketHash:upload.ticketHash})).rejects.toThrow('both source');
 await expect(t.query(anyApi.cloud.assets.get,{id:upload.id})).rejects.toThrow('not published');
 const result=await finish(t,upload);expect(result.id).toBe(upload.id);expect(result.creatorAgentId).toBe('author');expect(JSON.stringify(result)).not.toMatch(/storageId|sourceId|previewId|ticketHash|credentialHash|sessionId/);
 expect(result.source.contentUrl).toBe(`/api/assets/${result.id}/files/source`);
 expect(await t.mutation(anyApi.cloud.assets.finalize,{token,ticketHash:upload.ticketHash})).toEqual(result);
 expect((await send(t,upload.uploadToken,'source')).status).toBe(200);
 expect(await t.run(ctx=>ctx.db.system.query('_storage').collect())).toHaveLength(3);
 expect((await t.query(anyApi.cloud.assets.file,{id:result.id,role:'source'})).assetFile).toBe(true);
 expect((await t.run(ctx=>ctx.db.query('cloudModels').first()))!.author).toBe('original');
});
it('deduplicates concurrent uploads and finalize transactions, charging duplicate bundles once',async()=>{
 const t=await setup(),a=await begin(t),b=await begin(t);expect(a.id).toBe(b.id);
 // Store first: convex-test cannot run simultaneous HTTP storage writes. Race the actual stage mutations.
 const ids=[];for(let i=0;i<2;i++)ids.push(await t.run(ctx=>ctx.storage.store(new Blob([source],{type:markedArtifactContentType('source')}))));
 const staged=await Promise.all(ids.map(storageId=>t.mutation(anyApi.cloud.assets.stage,{ticketHash:a.ticketHash,role:'source',storageId})));expect(staged.filter(result=>result.retained)).toHaveLength(1);
 for(const storageId of ids)await t.mutation(anyApi.cloud.assets.deleteUnreferenced,{storageId});
 for(const [u,role]of [[a,'preview'],[b,'source'],[b,'preview']] as const){const response=await send(t,u.uploadToken,role);expect(response.status,await response.text()).toBe(200);}

 const results=await Promise.all([t.mutation(anyApi.cloud.assets.finalize,{token,ticketHash:a.ticketHash}),t.mutation(anyApi.cloud.assets.finalize,{token,ticketHash:b.ticketHash})]);expect(results[0]).toEqual(results[1]);expect(await t.run(ctx=>ctx.db.query('cloudAssets').collect())).toHaveLength(1);
 vi.setSystemTime(Date.now()+300001);for(const row of await t.run(ctx=>ctx.db.query('cloudAssetUploads').collect()))await t.mutation(anyApi.cloud.assets.expire,{id:row._id});
 expect(await t.run(ctx=>ctx.db.system.query('_storage').collect())).toHaveLength(3);
 expect((await t.query(anyApi.cloud.assets.file,{id:a.id,role:'preview'})).assetFile).toBe(true);
});
it('binds tickets to identities, expected bytes and hashes, and rejects invalid signatures before storage',async()=>{
 const t=await setup(),upload=await begin(t);
 expect((await send(t,token,'source')).status).toBe(401);
 expect((await send(t,upload.uploadToken,'source',source.subarray(1))).status).toBe(400);
 const changed=source.slice();changed[changed.length-1]^=1;expect((await send(t,upload.uploadToken,'source',changed)).status).toBe(400);
 expect((await send(t,upload.uploadToken,'source',new Uint8Array(source.length+1))).status).toBe(413);
 await expect(t.mutation(anyApi.cloud.assets.finalize,{token:otherToken,ticketHash:upload.ticketHash})).rejects.toThrow('another identity');
 const malformed=new Uint8Array(preview.length),bad=await begin(t,{preview:await descriptor(malformed)});expect((await send(t,bad.uploadToken,'preview',malformed)).status).toBe(400);
 expect(await t.run(ctx=>ctx.db.system.query('_storage').collect())).toHaveLength(1);
});
it('rejects unknown models and parents and releases expired quota reservations',async()=>{
 const t=await setup();await expect(begin(t,{modelId:`model-${'e'.repeat(64)}`})).rejects.toThrow('not in this grid');
 await expect(begin(t,{metadata:{name:'Child',parentId:`bundle-${'e'.repeat(64)}`}})).rejects.toThrow('not published');
 const a=await begin(t),b=await begin(t,{metadata:{name:'Second'}});await expect(begin(t,{metadata:{name:'Third'}})).rejects.toThrow('two active');
 await send(t,a.uploadToken,'source');vi.setSystemTime(Date.now()+300001);expect((await send(t,b.uploadToken,'preview')).status).toBe(401);
 await begin(t,{metadata:{name:'Third'}});expect(await t.run(ctx=>ctx.db.system.query('_storage').collect())).toHaveLength(1);
});
it.each(['revoked','rotated','expired'])('rejects %s credentials after begin',async mode=>{
 const t=await setup(),upload=await begin(t);await t.run(async ctx=>{const actor=await ctx.db.query('cloudSessions').withIndex('by_agent',q=>q.eq('agentId','author')).unique();await ctx.db.patch(actor!._id,mode==='revoked'?{revoked:true}:mode==='rotated'?{tokenHash:'f'.repeat(64)}:{expiresAt:Date.now()-1});});expect((await send(t,upload.uploadToken,'source')).status).toBe(401);
});
it('enforces retained plus pending byte and count quotas independently of the shared model',async()=>{
 const t=await setup(),published=await finish(t,await begin(t));
 await t.run(async ctx=>{const row=(await ctx.db.query('cloudAssets').first())!;const {_id,_creationTime,...data}=row;await ctx.db.patch(_id,{source:{...row.source,bytes:127_999_950}});});
 await expect(begin(t,{metadata:{name:'Different source bundle'}})).rejects.toThrow('quota');
 await t.run(async ctx=>{const row=(await ctx.db.query('cloudAssets').first())!;const {_id,_creationTime,...data}=row;await ctx.db.patch(_id,{source:{...row.source,bytes:source.length}});for(let i=1;i<64;i++)await ctx.db.insert('cloudAssets',{...data,source:{...row.source,bytes:source.length},bundleId:`bundle-${i.toString(16).padStart(64,'0')}`});});
 await expect(begin(t,{metadata:{name:'65th'}})).rejects.toThrow('quota');expect((await t.query(anyApi.cloud.assets.get,{id:published.id})).modelId).toBe(modelId);
});
it('sweeps store-before-stage crash orphans only after grace and preserves unrelated and referenced storage',async()=>{
 const t=await setup(),upload=await begin(t);await finish(t,upload);
 const [orphan,privateFile]=await t.run(async ctx=>[await ctx.storage.store(new Blob([source],{type:markedArtifactContentType('source')})),await ctx.storage.store(new Blob(['private checkpoint'],{type:'application/octet-stream'}))]);
 expect((await t.mutation(anyApi.cloud.assets.sweep,{})).deleted).toBe(0);vi.setSystemTime(Date.now()+600001);expect((await t.mutation(anyApi.cloud.assets.sweep,{})).deleted).toBe(1);
 expect(await t.run(ctx=>ctx.db.system.get(orphan))).toBeNull();expect(await t.run(ctx=>ctx.db.system.get(privateFile))).not.toBeNull();
 await t.run(ctx=>ctx.storage.delete(privateFile));expect((await t.query(anyApi.cloud.assets.file,{id:upload.id,role:'source'})).assetFile).toBe(true);
});
it('cleanup and stage serialize safely without deleting a retained reference',async()=>{
 const t=await setup(),upload=await begin(t),storageId=await t.run(ctx=>ctx.storage.store(new Blob([source],{type:markedArtifactContentType('source')})));
 const results=await Promise.allSettled([t.mutation(anyApi.cloud.assets.stage,{ticketHash:upload.ticketHash,role:'source',storageId}),t.mutation(anyApi.cloud.assets.deleteUnreferenced,{storageId})]);
 const row=(await t.run(ctx=>ctx.db.query('cloudAssetUploads').first()))!;if(row.sourceId)expect(await t.run(ctx=>ctx.db.system.get(storageId))).not.toBeNull();else expect(results[0].status).toBe('rejected');
});
it('verifies storage hashes and sizes inside the staging transaction, independently of the uploader',async()=>{
 const t=await setup(),upload=await begin(t);
 for(const bytes of [source.subarray(1),new TextEncoder().encode('BLENDER-v300wrong!')]){const storageId=await t.run(ctx=>ctx.storage.store(new Blob([bytes],{type:markedArtifactContentType('source')})));await expect(t.mutation(anyApi.cloud.assets.stage,{ticketHash:upload.ticketHash,role:'source',storageId})).rejects.toThrow(/mismatch/);await t.mutation(anyApi.cloud.assets.deleteUnreferenced,{storageId});}
 const storageId=await t.run(ctx=>ctx.storage.store(new Blob([source],{type:'application/octet-stream'})));await expect(t.mutation(anyApi.cloud.assets.stage,{ticketHash:upload.ticketHash,role:'source',storageId})).rejects.toThrow('metadata mismatch');
 expect((await t.query(anyApi.cloud.assets.list,{})).entries).toHaveLength(0);
});
it('keeps an old staged reference protected during a sweep, then finalizes without replacing bytes',async()=>{
 const t=await setup(),upload=await begin(t);await send(t,upload.uploadToken,'source');await send(t,upload.uploadToken,'preview');
 // Simulate a delayed cleanup scan: references, not age alone, determine deletion safety.
 await t.run(async ctx=>{const row=(await ctx.db.query('cloudAssetUploads').first())!;await ctx.db.patch(row._id,{expiresAt:Date.now()+900000});});vi.setSystemTime(Date.now()+600001);
 const results=await Promise.all([t.mutation(anyApi.cloud.assets.sweep,{}),t.mutation(anyApi.cloud.assets.finalize,{token,ticketHash:upload.ticketHash})]);expect(results[0].deleted).toBe(0);expect(results[1].id).toBe(upload.id);
 expect(await t.run(ctx=>ctx.db.system.query('_storage').collect())).toHaveLength(3);
});
it('permits fresh creator provenance with a reused model and validates published derivation parents',async()=>{
 const t=await setup(),original=await finish(t,await begin(t));
 const derivative=await begin(t,{token:otherToken,metadata:{name:'Derivative',parentId:original.id}});
 expect(derivative.id).not.toBe(original.id);await send(t,derivative.uploadToken,'source');await send(t,derivative.uploadToken,'preview');
 const published=await t.mutation(anyApi.cloud.assets.finalize,{token:otherToken,ticketHash:derivative.ticketHash});expect(published.metadata.parentId).toBe(original.id);expect(published.creatorAgentId).toBe('reader');expect(published.modelId).toBe(original.modelId);
});
it.each(['missing-source','missing-model','changed-hash','changed-size','changed-marker'])('fails closed at finalize after %s storage damage',async damage=>{
 const t=await setup(),upload=await begin(t);await send(t,upload.uploadToken,'source');await send(t,upload.uploadToken,'preview');
 await t.run(async ctx=>{const row=(await ctx.db.query('cloudAssetUploads').first())!;
  if(damage==='missing-source')await ctx.storage.delete(row.sourceId!);
  else if(damage==='missing-model')await ctx.storage.delete((await ctx.db.query('cloudModels').first())!.storageId);
  else await (ctx.db as any).patch(row.sourceId,damage==='changed-hash'?{sha256:btoa('a'.repeat(32))}:damage==='changed-size'?{size:1}:{contentType:'application/octet-stream'});
 });
 await expect(t.mutation(anyApi.cloud.assets.finalize,{token,ticketHash:upload.ticketHash})).rejects.toThrow(/storage|unavailable/);expect((await t.query(anyApi.cloud.assets.list,{})).entries).toHaveLength(0);
});
it('routes a complete authenticated publication and public capability discovery',async()=>{
 const t=await setup();vi.stubEnv('AGARTHA_CLOUD_GATEWAY_KEY','asset-gateway');
 const headers={'x-agartha-gateway-key':'asset-gateway','content-type':'application/json',Authorization:`Bearer ${token}`};
 const capabilities=await t.fetch('/cloud/assets/capabilities',{headers});expect(capabilities.status).toBe(200);expect((await capabilities.json()).uploadTicket).toBe('/api/assets/upload-ticket');
 const response=await t.fetch('/cloud/assets/upload-ticket',{method:'POST',headers,body:JSON.stringify({modelId,name:'Routed asset',source:await descriptor(source),preview:await descriptor(preview)})});expect(response.status,await response.clone().text()).toBe(200);const upload=await response.json();
 expect(upload.uploadUrls.source).toMatch(/\/asset-upload\/source$/);expect(upload.uploadToken).not.toBe(token);
 for(const role of ['source','preview'] as const)expect((await send(t,upload.uploadToken,role)).status).toBe(200);
 const finalized=await t.fetch('/cloud/assets/finalize',{method:'POST',headers,body:JSON.stringify({uploadToken:upload.uploadToken})});expect(finalized.status,await finalized.clone().text()).toBe(200);expect((await finalized.json()).id).toBe(upload.id);
 const publicFile=await t.fetch(`/cloud/assets/${upload.id}/files/preview`,{headers:{'x-agartha-gateway-key':'asset-gateway'}});expect(publicFile.status).toBe(200);expect((await publicFile.json()).assetFile).toBe(true);
 vi.unstubAllEnvs();
});
