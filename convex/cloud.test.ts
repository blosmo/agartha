import {convexTest} from 'convex-test';
import {anyApi} from 'convex/server';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import schema from './schema';
import {createWorld} from '../apps/web/src/worlds/world';
const modules=import.meta.glob('./**/*.{ts,js}');
const key='test-cloud-gateway-key';
beforeEach(()=>vi.stubEnv('AGARTHA_CLOUD_GATEWAY_KEY',key));afterEach(()=>vi.unstubAllEnvs());
async function setup(){const t=convexTest({schema,modules,transactionLimits:true});await t.mutation(anyApi.cloud.write.bootstrapPlot,{world:createWorld()});return t;}
function headers(token?:string){return {'Content-Type':'application/json','x-agartha-gateway-key':key,'x-agartha-client':'test-client',...(token?{Authorization:`Bearer ${token}`}:{})};}
it('supports internet registration, public plot creation, tools, and persistent ownership',async()=>{
  const t=await setup(),token='1'.repeat(64);
  expect((await t.fetch('/cloud/plots')).status).toBe(401);
  const register=await t.fetch('/cloud/session',{method:'POST',headers:headers(),body:JSON.stringify({agentToken:token,name:'Internet builder'})});expect(register.status).toBe(200);
  const actor=await register.json();expect(actor.agentId).toMatch(/^agent-/);expect(actor.token).toBeUndefined();
  const created=await t.fetch('/cloud/plots',{method:'POST',headers:headers(token),body:JSON.stringify({x:1,z:0,name:'Cloud garden'})});expect(created.status).toBe(200);
  const plot=await created.json();expect(plot.cloud).toBe(true);expect(plot.permissions.canEditBrief).toBe(true);
  const body={requestId:'cloud-build',issuedAt:Date.now(),parameters:{tool:'pavilion'},preview:true};
  const proposal=await t.fetch('/cloud/plots/plot-1-0/tools',{method:'POST',headers:headers(token),body:JSON.stringify(body)});expect((await proposal.json()).objects).toHaveLength(7);
  expect((await (await t.fetch('/cloud/plots/plot-1-0',{headers:headers(token)})).json()).objects).toHaveLength(0);
  const built=await (await t.fetch('/cloud/plots/plot-1-0/tools',{method:'POST',headers:headers(token),body:JSON.stringify({...body,preview:false})})).json();expect(built.objects).toHaveLength(7);expect(built.objects.every((o:{owner:string})=>o.owner===actor.agentId)).toBe(true);
  const replay=await (await t.fetch('/cloud/plots/plot-1-0/tools',{method:'POST',headers:headers(token),body:JSON.stringify({...body,preview:false})})).json();expect(replay.objects).toHaveLength(7);
  const other='2'.repeat(64);await t.fetch('/cloud/session',{method:'POST',headers:headers(),body:JSON.stringify({agentToken:other,name:'Other'})});
  const object=built.objects[0];const edit={requestId:'ownership-test',issuedAt:Date.now(),message:'Change',expectedVersions:{[object.id]:1},objects:[{...object,color:'#ff0000'}]};
  expect((await t.fetch('/cloud/plots/plot-1-0',{method:'POST',headers:headers(other),body:JSON.stringify(edit)})).status).toBe(403);
  expect((await t.fetch('/cloud/plots/plot-1-0',{method:'POST',headers:headers(token),body:JSON.stringify({...edit,expectedVersions:{[object.id]:0}})})).status).toBe(409);
  const saved=await (await t.fetch('/cloud/plots/plot-1-0',{method:'POST',headers:headers(token),body:JSON.stringify(edit)})).json();expect(saved.objectVersions[object.id]).toBe(2);expect(saved.version).not.toBe(built.version);
  const neighbors=await (await t.fetch('/cloud/plots/the-commons/neighbors',{headers:headers(token)})).json();expect(neighbors.find((n:{direction:string})=>n.direction==='east').exists).toBe(true);
});
it('shares assets and shaders across cloud plots without leaking membership credentials',async()=>{
  const t=await setup(),token='3'.repeat(64);await t.fetch('/cloud/session',{method:'POST',headers:headers(),body:JSON.stringify({agentToken:token,name:'Library creator'})});
  await t.fetch('/cloud/plots',{method:'POST',headers:headers(token),body:JSON.stringify({x:1,z:1,name:'Cloud studio'})});
  const shader=await (await t.fetch('/cloud/library',{method:'POST',headers:headers(token),body:JSON.stringify({plotId:'plot-1-1',definition:{kind:'shader',name:'Cloud blue',expression:'color * vec3f(0.5, 0.7, 1.0)'}})})).json();expect(shader.id).toMatch(/^shader-/);
  const asset=await (await t.fetch('/cloud/library',{method:'POST',headers:headers(token),body:JSON.stringify({plotId:'plot-1-1',definition:{kind:'asset',name:'Cloud stone',objects:[{name:'Stone',id:'part',shape:'box',position:[0,0,0],scale:[2,1,2],color:'#aabbcc',shaderId:shader.id}]}})})).json();expect(asset.id).toMatch(/^asset-/);
  const place=await (await t.fetch('/cloud/plots/the-commons/assets',{method:'POST',headers:headers(token),body:JSON.stringify({assetId:asset.id,parameters:{x:8,z:8},requestId:'shared-place',issuedAt:Date.now(),preview:false})})).json();expect(place.shaders.some((s:{id:string})=>s.id===shader.id)).toBe(true);expect(place.objects.some((o:{shaderId?:string})=>o.shaderId===shader.id)).toBe(true);
  expect(JSON.stringify(place)).not.toContain(token);
  const exported=await (await t.fetch(`/cloud/library/${shader.id}`,{headers:headers()})).json();expect(exported.wgsl).toContain('agarthaShade');
});
it('rejects revoked cloud credentials through the derived world membership too',async()=>{
  const t=await setup(),token='4'.repeat(64);await t.mutation(anyApi.cloud.session.register,{token,name:'Revocable',ipHash:'ip'});
  const member=await t.mutation(anyApi.cloud.session.member,{id:'the-commons',token});
  await t.run(async ctx=>{const row=await ctx.db.query('cloudSessions').first();await ctx.db.patch(row!._id,{revoked:true});});
  await expect(t.mutation(anyApi.scene.authority.edit,{worldId:member.worldId,token:member.token,requestId:'revoked-edit',issuedAt:Date.now(),message:'No',changes:[{id:'new',expectedVersion:0,object:{id:'new',name:'New',shape:'box',position:[0,0,0],scale:[1,1,1],color:'#aabbcc'}}]})).rejects.toThrow('revoked');
});

it('disables the archived API in cloud-only deployments while keeping the cloud grid available',async()=>{
  const t=await setup();vi.stubEnv('AGARTHA_CLOUD_ONLY','true');
  await expect(t.query(anyApi.worlds.metadata,{})).rejects.toThrow('archived');
  expect((await t.fetch('/cloud/plots',{headers:headers()})).status).toBe(200);
});

it('includes a furnished neighboring room without truncating its first hundred pieces',async()=>{
  const t=await setup();
  await t.mutation(anyApi.cloud.write.bootstrapPlot,{world:{...createWorld(),id:'plot-1-0',name:'Furnished room',placement:{x:1,z:0,size:32},objects:Array.from({length:100},(_,i)=>({id:`detail-${i}`,name:`Detail ${i}`,shape:'box',position:[0,1,0],scale:[.2,.2,.2],color:'#aabbcc',author:'Room agent'}))}});
  const grid=await(await t.fetch('/cloud/plots?x=0&z=0',{headers:headers()})).json();
  const neighbor=grid.plots.find((p:{id:string})=>p.id==='plot-1-0');
  expect(neighbor.objects).toHaveLength(100);expect(neighbor.hasMoreObjects).toBe(false);
});

it('persists declarative motion through the public raw-edit route and rejects invalid motion',async()=>{
  const t=await setup(),token='7'.repeat(64);
  await t.fetch('/cloud/session',{method:'POST',headers:headers(),body:JSON.stringify({agentToken:token,name:'Motion builder'})});
  const object={id:'moving-stone',name:'Floating stone',shape:'sphere',position:[0,5,0],scale:[2,2,2],color:'#aabbcc',motion:{kind:'float',speed:.7,amplitude:.8,phase:0}};
  const save=await t.fetch('/cloud/plots/the-commons',{method:'POST',headers:headers(token),body:JSON.stringify({requestId:'motion-save',issuedAt:Date.now(),message:'Float a stone',objects:[object]})});
  expect(save.status).toBe(200);
  const world=await save.json();
  expect(world.objects.find((o:{id:string})=>o.id===object.id).motion).toEqual(object.motion);
  const invalid=await t.fetch('/cloud/plots/the-commons',{method:'POST',headers:headers(token),body:JSON.stringify({requestId:'motion-invalid',issuedAt:Date.now(),message:'Invalid motion',objects:[{...object,id:'invalid-motion',motion:{kind:'float',amplitude:100}}]})});
  expect(invalid.status).toBe(400);
});

it('persists a curated PBR material through the hosted raw-edit API',async()=>{
  const t=await setup(),token='8'.repeat(64);
  await t.fetch('/cloud/session',{method:'POST',headers:headers(),body:JSON.stringify({agentToken:token,name:'Material builder'})});
  const object={id:'wooden-seat',name:'Wooden seat',shape:'box',position:[0,3,0],scale:[2,1,1],color:'#ffffff',materialId:'pbr-dark-wood'};
  const result=await t.fetch('/cloud/plots/the-commons',{method:'POST',headers:headers(token),body:JSON.stringify({requestId:'pbr-save',issuedAt:Date.now(),message:'Made a timber seat',objects:[object]})});
  expect(result.status).toBe(200);expect((await result.json()).objects.find((o:{id:string})=>o.id===object.id).materialId).toBe(object.materialId);
});

it('publishes an authored mesh and keeps its reference through hosted edits',async()=>{
 const t=await setup(),token='9'.repeat(64);
 await t.fetch('/cloud/session',{method:'POST',headers:headers(),body:JSON.stringify({agentToken:token,name:'Mesh builder'})});
 const published=await t.fetch('/cloud/library',{method:'POST',headers:headers(token),body:JSON.stringify({plotId:'the-commons',definition:{kind:'mesh',name:'Triangle',geometry:{positions:[0,0,0,2,0,0,0,2,0],indices:[0,1,2]}}})});
 expect(published.status).toBe(200);const mesh=await published.json();
 const object={id:'sculpture',name:'Sculpture',shape:'mesh',meshId:mesh.id,position:[0,3,0],scale:[2,2,.1],color:'#ffffff'};
 const response=await t.fetch('/cloud/plots/the-commons',{method:'POST',headers:headers(token),body:JSON.stringify({requestId:'mesh-place',issuedAt:Date.now(),message:'Place sculpture',objects:[object]})});
 expect(response.status).toBe(200);const world=await response.json();expect(world.objects.find((o:{id:string})=>o.id==='sculpture').meshId).toBe(mesh.id);expect(world.meshes).toBeUndefined();
 const catalog=await(await t.fetch('/cloud/library?kind=mesh',{headers:headers()})).json();expect(catalog.entries[0].triangleCount).toBe(1);expect(catalog.entries[0].geometry).toBeUndefined();
});
