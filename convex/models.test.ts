import {convexTest} from 'convex-test';
import {anyApi} from 'convex/server';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import schema from './schema';
import {glbFixture} from '../packages/protocol/src/geometry/glbFixture';
import {createWorld} from '../apps/web/src/worlds/world';
const modules=import.meta.glob('./**/*.{ts,js}'),gateway='test-model-gateway',token='a'.repeat(64);
beforeEach(()=>vi.stubEnv('AGARTHA_CLOUD_GATEWAY_KEY',gateway));afterEach(()=>vi.unstubAllEnvs());
const headers=(credential=token)=>({'Content-Type':'application/json','x-agartha-gateway-key':gateway,Authorization:`Bearer ${credential}`});
async function setup(){const t=convexTest({schema,modules,transactionLimits:true});await t.mutation(anyApi.cloud.write.bootstrapPlot,{world:createWorld()});await t.fetch('/cloud/session',{method:'POST',headers:headers(),body:JSON.stringify({agentToken:token,name:'Model agent'})});return t;}
async function ticket(t:ReturnType<typeof convexTest>){const response=await t.fetch('/cloud/models/upload-ticket',{method:'POST',headers:headers(),body:JSON.stringify({name:'Animated fixture',source:'https://example.com/model',license:'CC0',attribution:'Fixture author'})});expect(response.status).toBe(200);return response.json();}
it('uploads with a scoped ticket, publishes once, and places a native model',async()=>{
 const t=await setup(),upload=await ticket(t);expect(new URL(upload.uploadUrl).pathname).toBe('/model-upload');expect(upload.uploadUrl).not.toContain(upload.uploadToken);
 const send=()=>t.fetch('/model-upload',{method:'POST',headers:{'Content-Type':'model/gltf-binary',Authorization:`Bearer ${upload.uploadToken}`},body:glbFixture()});
 const result=await send();expect(result.status).toBe(200);const model=await result.json();expect(model.inspection.animations[0].name).toBe('Float');expect(model.storageId).toBeUndefined();expect(model.attribution).toBe('Fixture author');
 const repeated=await send();expect(repeated.status).toBe(200);expect((await repeated.json()).id).toBe(model.id);
 const rows=await t.run(ctx=>ctx.db.query('cloudModels').collect());expect(rows).toHaveLength(1);expect((await t.run(ctx=>ctx.db.system.query('_storage').collect()))).toHaveLength(1);
 const object={id:'imported',name:'Imported model',shape:'model',modelId:model.id,position:[0,3,0],scale:[2,2,2],color:'#ffffff',animation:{clip:'Float'}};
 const placed=await t.fetch('/cloud/plots/the-commons',{method:'POST',headers:headers(),body:JSON.stringify({requestId:'place-native',issuedAt:Date.now(),message:'Place imported model',objects:[object]})});expect(placed.status).toBe(200);const world=await placed.json();expect(world.objects.find((o:{id:string})=>o.id==='imported').animation.speed).toBe(1);expect(world.modelCredits[0].attribution).toBe('Fixture author');
 expect((await(await t.fetch(`/cloud/models/${model.id}/file`,{headers:headers()})).json()).modelFile).toBe(true);
});
it('rejects revoked upload identities and invalid files without publishing',async()=>{
 const t=await setup(),upload=await ticket(t);
 const bad=await t.fetch('/model-upload',{method:'POST',headers:{'Content-Type':'model/gltf-binary',Authorization:`Bearer ${upload.uploadToken}`},body:new Uint8Array([1,2,3])});expect(bad.status).toBe(400);expect(await t.run(ctx=>ctx.db.query('cloudModels').collect())).toHaveLength(0);
 await t.run(async ctx=>{const actor=await ctx.db.query('cloudSessions').first();await ctx.db.patch(actor!._id,{revoked:true});});
 const revoked=await t.fetch('/model-upload',{method:'POST',headers:{'Content-Type':'model/gltf-binary',Authorization:`Bearer ${upload.uploadToken}`},body:glbFixture()});expect(revoked.status).toBe(401);expect(await t.run(ctx=>ctx.db.system.query('_storage').collect())).toHaveLength(0);
});
it('requires a ticket rather than accepting the long-lived agent credential',async()=>{
 const t=await setup();const response=await t.fetch('/model-upload',{method:'POST',headers:{'Content-Type':'model/gltf-binary',Authorization:`Bearer ${token}`},body:glbFixture()});expect(response.status).toBe(401);
});
it('rejects expired tickets and different content on a used ticket without leaking stored blobs',async()=>{
 const t=await setup(),upload=await ticket(t);
 const send=(bytes:Uint8Array)=>t.fetch('/model-upload',{method:'POST',headers:{'Content-Type':'model/gltf-binary',Authorization:`Bearer ${upload.uploadToken}`},body:bytes});
 expect((await send(glbFixture())).status).toBe(200);
 expect((await send(glbFixture(json=>{json.asset.generator='Different content';}))).status).toBe(409);
 expect(await t.run(ctx=>ctx.db.system.query('_storage').collect())).toHaveLength(1);
 await t.run(async ctx=>{const row=await ctx.db.query('cloudModelUploads').first();await ctx.db.patch(row!._id,{expiresAt:Date.now()-1});});
 expect((await send(glbFixture())).status).toBe(401);
 expect(await t.run(ctx=>ctx.db.query('cloudModels').collect())).toHaveLength(1);
});
it('advertises scoped hosted model uploads in the room tool catalog',async()=>{
 const t=await setup();const response=await t.fetch('/cloud/plots/the-commons/tools',{headers:headers()});expect(response.status).toBe(200);
 const catalog=await response.json();expect(catalog.models.localOnly).toBe(false);expect(catalog.models.uploadTicket).toBe('/api/models/upload-ticket');expect(catalog.models.upload).toBeUndefined();
});
it('rejects a hosted model batch atomically when its aggregate draw cost exceeds the room budget',async()=>{
 const t=await setup(),upload=await ticket(t),bytes=glbFixture(json=>{json.nodes=Array.from({length:64},()=>({mesh:0}));json.scenes[0].nodes=json.nodes.map((_:unknown,i:number)=>i);});
 const imported=await t.fetch('/model-upload',{method:'POST',headers:{'Content-Type':'model/gltf-binary',Authorization:`Bearer ${upload.uploadToken}`},body:bytes});expect(imported.status).toBe(200);const model=await imported.json();
 const before=await t.run(ctx=>ctx.db.query('sceneObjects').collect());
 const objects=Array.from({length:3},(_,i)=>({id:`costly-${i}`,name:'Costly model',shape:'model',modelId:model.id,position:[i*3,3,0],scale:[2,2,2],color:'#ffffff'}));
 const placed=await t.fetch('/cloud/plots/the-commons',{method:'POST',headers:headers(),body:JSON.stringify({requestId:'over-budget',issuedAt:Date.now(),message:'Test aggregate draw budget',objects})});expect(placed.status).toBe(429);
 expect(await t.run(ctx=>ctx.db.query('sceneObjects').collect())).toEqual(before);
});
it.each(['rotated', 'legacy'])('rejects %s ticket credentials before storing bytes', async mode => {
 const t=await setup(),upload=await ticket(t);
 await t.run(async ctx=>{if(mode==='rotated'){const actor=await ctx.db.query('cloudSessions').first();await ctx.db.patch(actor!._id,{tokenHash:'new-credential-hash'});}else{const row=await ctx.db.query('cloudModelUploads').first();await ctx.db.patch(row!._id,{credentialHash:undefined});}});
 const response=await t.fetch('/model-upload',{method:'POST',headers:{'Content-Type':'model/gltf-binary',Authorization:`Bearer ${upload.uploadToken}`},body:glbFixture()});
 expect(response.status).toBe(401);expect(await t.run(ctx=>ctx.db.query('cloudModels').collect())).toHaveLength(0);expect(await t.run(ctx=>ctx.db.system.query('_storage').collect())).toHaveLength(0);
});
