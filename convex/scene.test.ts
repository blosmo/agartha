import { convexTest } from 'convex-test';
import { anyApi } from 'convex/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import schema from './schema';
import { digest } from './scene/model';
const modules=import.meta.glob('./**/*.{ts,js}');
const f=anyApi.scene.authority;
const operator='test-operator-credential-at-least-32-characters';
const curator='a'.repeat(64), invite='b'.repeat(64), alice='c'.repeat(64), bob='d'.repeat(64);
beforeEach(()=>vi.stubEnv('AGARTHA_SCENE_OPERATOR_TOKEN',operator));
afterEach(()=>vi.unstubAllEnvs());
async function setup(publicRead=true){
  const t=convexTest({schema,modules,transactionLimits:true});
  await t.mutation(f.createWorld,{operatorToken:operator,worldId:'commons',name:'Commons',brief:'Build together.',curatorToken:curator,publicRead});
  await t.mutation(f.invite,{worldId:'commons',token:curator,inviteToken:invite,maxAgents:2});
  await t.mutation(f.join,{worldId:'commons',inviteToken:invite,agentToken:alice,name:'Alice'});
  await t.mutation(f.join,{worldId:'commons',inviteToken:invite,agentToken:bob,name:'Bob'});
  return t;
}
function object(id='tree',x=0){return {id,name:'A tree',shape:'cone' as const,position:[x,2,0],scale:[2,4,2],color:'#88aa66'};}
function edit(token=alice,id='tree',requestId='request-1',version=0){return {worldId:'commons',token,requestId,issuedAt:Date.now(),message:'Added a tree',changes:[{id,expectedVersion:version,object:object(id)}]};}
describe('hosted scene authority',()=>{
  it('accepts independent agent contributions without a world-wide revision',async()=>{
    const t=await setup();
    const results=await Promise.all([t.mutation(f.edit,edit()),t.mutation(f.edit,edit(bob,'bench','request-2'))]);
    expect(results.every(r=>r.changed[0].version===1)).toBe(true);
    const metadata=await t.query(f.metadata,{worldId:'commons'});
    expect(metadata.briefVersion).toBe(1);
    const page=await t.query(f.objects,{worldId:'commons',region:'0:0',paginationOpts:{numItems:1,cursor:null}});
    expect(page.page).toHaveLength(1);expect(page.isDone).toBe(false);
    expect((await t.query(f.objects,{worldId:'commons',region:'0:0',paginationOpts:{numItems:1,cursor:page.continueCursor}})).page).toHaveLength(1);
  });
  it('replays a request once and rejects request-ID reuse with different data',async()=>{
    const t=await setup();const request=edit();
    const first=await t.mutation(f.edit,request);
    expect((await t.mutation(f.edit,request)).replayed).toBe(true);
    expect(first.changed).toEqual([{id:'tree',version:1}]);
    await expect(t.mutation(f.edit,{...request,message:'Different'})).rejects.toThrow('Request ID');
    const hash=await digest(alice);
    const actor=await t.run(ctx=>ctx.db.query('sceneAgents').withIndex('by_token',q=>q.eq('tokenHash',hash)).unique());
    expect(actor?.windowRequests).toBe(1);
    const rows=await t.run(ctx=>ctx.db.query('sceneObjects').collect());expect(rows).toHaveLength(1);
  });
  it('rejects another agent’s replacement and rolls a partial batch back atomically',async()=>{
    const t=await setup();await t.mutation(f.edit,edit());
    await expect(t.mutation(f.edit,edit(bob,'tree','overwrite',1))).rejects.toThrow('owning agent');
    await expect(t.mutation(f.edit,{...edit(bob,'new','mixed'),changes:[{id:'new',expectedVersion:0,object:object('new')},{id:'tree',expectedVersion:0,object:object()}]})).rejects.toThrow('changed');
    expect((await t.query(f.inspect,{worldId:'commons',ids:['new']}))[0].version).toBe(0);
  });
  it('preserves tombstone versions so stale creation cannot resurrect deleted work',async()=>{
    const t=await setup();await t.mutation(f.edit,edit());
    await t.mutation(f.edit,{...edit(alice,'tree','remove'),changes:[{id:'tree',expectedVersion:1}]});
    await expect(t.mutation(f.edit,edit(alice,'tree','stale-create'))).rejects.toThrow('changed');
    const state=await t.query(f.inspect,{worldId:'commons',ids:['tree']});expect(state[0]).toMatchObject({deleted:true,version:2});
    expect((await t.mutation(f.edit,edit(alice,'tree','recreate',2))).changed[0].version).toBe(3);
  });
  it('enforces private reads, revocation, world scope and invitation limits',async()=>{
    const t=await setup(false);
    await expect(t.query(f.metadata,{worldId:'commons'})).rejects.toThrow();
    expect((await t.query(f.metadata,{worldId:'commons',token:alice})).worldId).toBe('commons');
    await expect(t.mutation(f.edit,{...edit(),worldId:'other'})).rejects.toThrow('credential');
    await expect(t.mutation(f.join,{worldId:'commons',inviteToken:invite,agentToken:'e'.repeat(64),name:'Eve'})).rejects.toThrow('exhausted');
    const joined=await t.mutation(f.join,{worldId:'commons',inviteToken:invite,agentToken:alice,name:'Alice'});
    await t.mutation(f.revoke,{worldId:'commons',token:curator,agentId:joined.agentId});
    await expect(t.mutation(f.edit,edit())).rejects.toThrow('revoked');
  });
  it('rate-limits only the active agent, not the world',async()=>{
    const t=await setup();
    for(let i=0;i<12;i++)await t.mutation(f.edit,edit(alice,`tree-${i}`,`request-${i}`));
    await expect(t.mutation(f.edit,edit(alice,'extra','extra'))).rejects.toThrow('limit reached');
    expect((await t.mutation(f.edit,edit(bob,'bob-tree','bob-request'))).changed).toHaveLength(1);
  });
  it('enforces bounds and quota atomically',async()=>{
    const t=await setup();
    await expect(t.mutation(f.edit,{...edit(),changes:[{id:'tree',expectedVersion:0,object:{...object(),scale:[-1,2,3]}}]})).rejects.toThrow('scale');
    const hash=await digest(alice);
    await t.run(async ctx=>{const row=await ctx.db.query('sceneAgents').withIndex('by_token',q=>q.eq('tokenHash',hash)).unique();await ctx.db.patch(row!._id,{liveObjects:1000});});
    await expect(t.mutation(f.edit,edit())).rejects.toThrow('quota');
    expect((await t.query(f.inspect,{worldId:'commons',ids:['tree']}))[0].version).toBe(0);
  });
  it('keeps brief revisions independent and restricts brief edits to curators',async()=>{
    const t=await setup();await t.mutation(f.edit,edit());
    await expect(t.mutation(f.updateBrief,{worldId:'commons',token:alice,expectedVersion:1,brief:'Overwrite'})).rejects.toThrow('curator');
    expect(await t.mutation(f.updateBrief,{worldId:'commons',token:curator,expectedVersion:1,brief:'Build a garden.'})).toEqual({briefVersion:2});
  });
  it('serves the HTTP contract and rejects unauthenticated writes',async()=>{
    const t=await setup();
    expect((await t.fetch('/v2/worlds/commons')).status).toBe(200);
    expect((await t.fetch('/v2/worlds/commons/edit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(edit())})).status).toBe(401);
    const {token,...request}=edit();
    const response=await t.fetch('/v2/worlds/commons/edit',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(request)});
    expect(response.status).toBe(200);expect((await response.json()).changed).toHaveLength(1);
    expect((await t.fetch('/v2/worlds/commons',{headers:{Origin:'https://untrusted.example'}})).status).toBe(403);
  });
});

it('keeps 1,000 distinct agents isolated in the database model (not a hosted capacity benchmark)',async()=>{
  const t=await setup();
  const credentials=Array.from({length:1000},(_,i)=>(i+100).toString(16).padStart(64,'0'));
  const hashes=await Promise.all(credentials.map(digest));
  await t.run(async ctx=>{
    for(let i=0;i<hashes.length;i++)await ctx.db.insert('sceneAgents',{worldId:'commons',agentId:`scale-${i}`,name:`Agent ${i}`,tokenHash:hashes[i],revoked:false,canCurate:false,expiresAt:Date.now()+86400000,liveObjects:0,objectsAllocated:0,windowStart:0,windowRequests:0});
  });
  const results=[];
  for(let offset=0;offset<credentials.length;offset+=50) results.push(...await Promise.all(credentials.slice(offset,offset+50).map((token,j)=>{const i=offset+j;return t.mutation(f.edit,edit(token,`object-${i}`,`scale-request-${i}`));})));
  expect(results).toHaveLength(1000);
  expect(results.every(r=>r.changed[0].version===1)).toBe(true);
  expect((await t.query(f.metadata,{worldId:'commons'})).briefVersion).toBe(1);
  const rows=await t.run(ctx=>ctx.db.query('sceneObjects').collect());
  expect(new Set(rows.map(r=>r.owner)).size).toBe(1000);
},120000);

it('keeps grid plots unique, discoverable, and permission-scoped',async()=>{
  const t=await setup();
  await t.mutation(f.createWorld,{operatorToken:operator,worldId:'plot-home',name:'Home',brief:'Create a place.',curatorToken:'1'.repeat(64),publicRead:true,plot:{gridId:'shared',x:0,z:0}});
  await t.mutation(f.createWorld,{operatorToken:operator,worldId:'plot-east',name:'East',brief:'A neighbor.',curatorToken:'2'.repeat(64),publicRead:true,plot:{gridId:'shared',x:1,z:0}});
  await t.mutation(f.createWorld,{operatorToken:operator,worldId:'plot-private',name:'Private name',brief:'Hidden brief.',curatorToken:'3'.repeat(64),publicRead:false,plot:{gridId:'shared',x:0,z:-1}});
  await expect(t.mutation(f.createWorld,{operatorToken:operator,worldId:'duplicate',name:'Duplicate',brief:'No.',curatorToken:'4'.repeat(64),publicRead:true,plot:{gridId:'shared',x:1,z:0}})).rejects.toThrow('occupied');
  const grid=await t.query(f.grid,{worldId:'plot-home'});expect(grid.plots).toHaveLength(9);
  expect(grid.plots.find((p:{x:number;z:number})=>p.x===0&&p.z===-1)).toEqual({x:0,z:-1,exists:true,accessible:false});
  expect((await t.query(f.traverse,{worldId:'plot-home',direction:'east'})).canWrite).toBe(false);
  await expect(t.query(f.traverse,{worldId:'plot-home',direction:'north'})).rejects.toThrow('invitation');
  await expect(t.mutation(f.edit,{...edit('1'.repeat(64)),worldId:'plot-east'})).rejects.toThrow('credential');
});
it('prepares and commits hosted tools through the same bounded, idempotent authority',async()=>{
  const t=await setup();
  await t.mutation(f.createWorld,{operatorToken:operator,worldId:'builder-plot',name:'Builder plot',brief:'Build.',curatorToken:'1'.repeat(64),publicRead:true,plot:{gridId:'tools',x:0,z:0}});
  const args={worldId:'builder-plot',token:'1'.repeat(64),requestId:'build-grove',issuedAt:Date.now(),parameters:{tool:'grove',size:4},preview:true};
  const preview=await t.mutation(f.build,args);expect(preview.objects).toHaveLength(16);
  expect((await t.query(f.objects,{worldId:'builder-plot',region:'0:0',paginationOpts:{numItems:100,cursor:null}})).page).toHaveLength(0);
  const built=await t.mutation(f.build,{...args,preview:false});expect(built.changed).toHaveLength(16);
  expect((await t.mutation(f.build,{...args,preview:false})).replayed).toBe(true);
  await expect(t.mutation(f.edit,{...edit('1'.repeat(64),'outside','outside'),worldId:'builder-plot',changes:[{id:'outside',expectedVersion:0,object:object('outside',20)}]})).rejects.toThrow('inside');
  await expect(t.mutation(f.edit,{...edit('1'.repeat(64),'gate','gate'),worldId:'builder-plot',changes:[{id:'gate',expectedVersion:0,object:{...object('gate',14),scale:[1,4,1]}}]})).rejects.toThrow('gateway');
});

it('shares immutable library entries across authorized grid plots and places editable copies',async()=>{
  const t=await setup(),lib=anyApi.scene.library;
  for(const [worldId,token,x,gridId] of [['library-a','1'.repeat(64),0,'library'],['library-b','2'.repeat(64),1,'library'],['other-grid','3'.repeat(64),0,'other']] as const)await t.mutation(f.createWorld,{operatorToken:operator,worldId,name:worldId,brief:'Build.',curatorToken:token,publicRead:true,plot:{gridId,x,z:0}});
  const definition={kind:'shader',name:'Moss',expression:'color * vec3f(0.5, 1.0, 0.5)'};
  const shader=await t.mutation(lib.publish,{worldId:'library-a',token:'1'.repeat(64),definition});
  expect((await t.query(lib.get,{worldId:'library-b',id:shader.id})).expression).toBe(definition.expression);
  const changed=await t.mutation(lib.publish,{worldId:'library-a',token:'1'.repeat(64),definition:{...definition,expression:'color * 0.5'}});expect(changed.id).not.toBe(shader.id);
  expect((await t.query(lib.get,{worldId:'library-a',id:shader.id})).expression).toBe(definition.expression);
  await expect(t.query(lib.get,{worldId:'other-grid',id:shader.id})).rejects.toThrow('not found');
  const asset=await t.mutation(lib.publish,{worldId:'library-a',token:'1'.repeat(64),definition:{kind:'asset',name:'Shared stone',objects:[{...object(),shaderId:shader.id}]}});
  const args={worldId:'library-b',token:'2'.repeat(64),assetId:asset.id,requestId:'place-library',issuedAt:Date.now(),parameters:{x:3,z:3},preview:true};
  const proposal=await t.mutation(lib.place,args);expect(proposal.objects[0].shaderId).toBe(shader.id);
  expect((await t.query(f.objects,{worldId:'library-b',region:'0:0',paginationOpts:{numItems:100,cursor:null}})).page).toHaveLength(0);
  expect((await t.mutation(lib.place,{...args,preview:false})).changed).toHaveLength(1);
  expect((await t.mutation(lib.place,{...args,preview:false})).replayed).toBe(true);
  await expect(t.mutation(lib.publish,{worldId:'library-a',token:'1'.repeat(64),definition:{kind:'shader',name:'Unsafe',expression:'color; loop {}'}})).rejects.toThrow();
  const exported=await t.fetch(`/v2/worlds/library-b/library/${shader.id}`);expect(exported.status).toBe(200);expect((await exported.json()).wgsl).toContain('fn agarthaShade');
  const httpProposal=await t.fetch(`/v2/worlds/library-b/library/${asset.id}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${'2'.repeat(64)}`},body:JSON.stringify({requestId:'http-asset',issuedAt:Date.now(),parameters:{x:4,z:4},preview:true})});expect(httpProposal.status).toBe(200);expect((await httpProposal.json()).objectCount).toBe(1);
});
