import {convexTest} from 'convex-test';
import {anyApi} from 'convex/server';
import {expect,it,vi} from 'vitest';
import schema from './schema';
import {canonical} from './cloud/starterWorlds';
import {digest,type SceneObject} from './scene/model';
import {STARTER_BASELINE} from './cloud/starterBaseline';
vi.mock('./cloud/starterBaseline',()=>({STARTER_BASELINE:{}}));
const modules=import.meta.glob('./**/*.{ts,js}');
const replacement:SceneObject={id:'new-studio-scene',name:'Studio scene',shape:'box',position:[0,1,0],scale:[2,2,2],color:'#aabbcc'};
async function setup(count=43){
 const t=convexTest({schema,modules,transactionLimits:true});
 await t.run(async ctx=>{
  await ctx.db.insert('sceneWorlds',{worldId:'public-the-commons',name:'Commons',brief:'Original brief',briefVersion:1,publicRead:true,gridId:'agartha-public-v1',plotX:0,plotZ:0});
  for(let i=0;i<count;i++)await ctx.db.insert('sceneObjects',{worldId:'public-the-commons',objectId:`old-${i}`,owner:'platform-seed',author:i%2?'Human curator':'World seed',version:1,region:'0:0',deleted:false,object:{...replacement,id:`old-${i}`}});
 });
 const snap=await t.query(anyApi.cloud.read.plot,{id:'the-commons'});
 STARTER_BASELINE['the-commons']={version:snap.version,objects:await Promise.all(snap.objects.map(async (o:SceneObject)=>({id:o.id,version:1,hash:await digest(canonical(o))})))};
 const args={id:'the-commons',expectedVersion:snap.version,catalogId:'starter-v1',objects:[replacement],brief:'New studio brief'};
 return {t,args,snap};
}
it('atomically replaces more than twenty originals, retains attribution, and restores them with monotonic versions',async()=>{
 const {t,args,snap}=await setup();
 const result=await t.mutation(anyApi.cloud.starterWorlds.upgrade,args);
 const after=await t.query(anyApi.cloud.read.plot,{id:args.id});
 expect(after.objects).toEqual([{...replacement,owner:'platform-seed',author:'Agartha Studio'}]);
 const rows=await t.run(ctx=>ctx.db.query('sceneObjects').collect());
 expect(rows.filter(r=>r.deleted)).toHaveLength(43);
 expect(rows.filter(r=>r.deleted).every(r=>r.object&&r.version===2&&r.owner==='platform-seed')).toBe(true);
 await t.mutation(anyApi.cloud.starterWorlds.rollback,{id:args.id,catalogId:args.catalogId,expectedVersion:result.version});
 const restored=await t.query(anyApi.cloud.read.plot,{id:args.id});
 expect(restored.objects).toEqual(snap.objects);expect(restored.brief).toBe(snap.brief);
 expect(Object.values(restored.objectVersions).every(v=>v===3)).toBe(true);
 expect((await t.mutation(anyApi.cloud.starterWorlds.upgrade,args)).status).toBe('rolled_back');
});
it('rejects edits retaining seed ownership, missing originals, and stale expected versions',async()=>{
 for(const change of ['content','missing','version']){
  const {t,args}=await setup(2);
  await t.run(async ctx=>{const r=(await ctx.db.query('sceneObjects').first())!;if(change==='content')await ctx.db.patch(r._id,{object:{...r.object!,color:'#ff0000'}});else if(change==='missing')await ctx.db.delete(r._id);else await ctx.db.patch(r._id,{version:2});});
  await expect(t.mutation(anyApi.cloud.starterWorlds.upgrade,args)).rejects.toThrow('baseline');
  expect(await t.run(ctx=>ctx.db.query('starterReceipts').collect())).toHaveLength(0);
 }
});
it('rejects foreign ownership and curators',async()=>{
 for(const foreign of [true,false]){
  const {t,args}=await setup(1);
  await t.run(async ctx=>{if(foreign){const r=(await ctx.db.query('sceneObjects').first())!;await ctx.db.patch(r._id,{owner:'community-agent'});}else await ctx.db.insert('sceneAgents',{worldId:'public-the-commons',agentId:'curator',name:'Curator',tokenHash:'none',revoked:false,canCurate:true,objectsAllocated:0,liveObjects:0,windowStart:0,windowRequests:0,expiresAt:Date.now()+60000});});
  await expect(t.mutation(anyApi.cloud.starterWorlds.upgrade,args)).rejects.toThrow(foreign?'foreign ownership':'curator');
 }
});
it('validates bounds and missing models before changing any seed rows',async()=>{
 for(const object of [{...replacement,position:[20,1,0]},{...replacement,shape:'model' as const,modelId:`model-${'a'.repeat(64)}`}]){
  const {t,args,snap}=await setup(1);
  await expect(t.mutation(anyApi.cloud.starterWorlds.upgrade,{...args,objects:[object]})).rejects.toThrow();
  expect((await t.query(anyApi.cloud.read.plot,{id:args.id})).objects).toEqual(snap.objects);
 }
});
it('checks room rendering budgets before swapping rows',async()=>{
 const {t,args,snap}=await setup(1),meshId=`mesh-${'a'.repeat(64)}`;
 await t.run(async ctx=>{
  await ctx.db.insert('sceneLibrary',{gridId:'agartha-public-v1',libraryId:meshId,kind:'mesh',definition:{kind:'mesh',name:'Costly',description:'',geometry:{positions:[],indices:[],normals:[],bounds:[0,0,0,1,1,1]}},author:'Studio',agentId:'platform-seed',createdAt:Date.now()});
  await ctx.db.insert('sceneMeshCosts',{gridId:'agartha-public-v1',meshId,triangles:200001});
 });
 await expect(t.mutation(anyApi.cloud.starterWorlds.upgrade,{...args,objects:[{...replacement,shape:'mesh',meshId}]})).rejects.toThrow('budget');
 expect((await t.query(anyApi.cloud.read.plot,{id:args.id})).objects).toEqual(snap.objects);
});
it('replays the catalog receipt without overwriting later contributions and blocks rollback',async()=>{
 const {t,args}=await setup(1),result=await t.mutation(anyApi.cloud.starterWorlds.upgrade,args);
 await t.run(async ctx=>{await ctx.db.insert('sceneObjects',{worldId:'public-the-commons',objectId:'community',owner:'agent-community',author:'Community',version:1,region:'0:0',deleted:false,object:{...replacement,id:'community'}});});
 expect(await t.mutation(anyApi.cloud.starterWorlds.upgrade,args)).toEqual(result);
 expect((await t.query(anyApi.cloud.read.plot,{id:args.id})).objects).toHaveLength(2);
 await expect(t.mutation(anyApi.cloud.starterWorlds.rollback,{id:args.id,catalogId:args.catalogId,expectedVersion:result.version})).rejects.toThrow('changed after rollout');
 await expect(t.mutation(anyApi.cloud.starterWorlds.upgrade,{...args,brief:'Different'})).rejects.toThrow('different payload');
});
it('rejects same-version post-rollout edits and edits to retired originals during rollback',async()=>{
 for(const retired of [false,true]){
  const {t,args}=await setup(1),result=await t.mutation(anyApi.cloud.starterWorlds.upgrade,args);
  await t.run(async ctx=>{const row=(await ctx.db.query('sceneObjects').collect()).find(r=>r.deleted===retired)!;await ctx.db.patch(row._id,{object:{...row.object!,name:'Changed'}});});
  await expect(t.mutation(anyApi.cloud.starterWorlds.rollback,{id:args.id,catalogId:args.catalogId,expectedVersion:result.version})).rejects.toThrow('changed after rollout');
 }
});
it('refuses nonstarter rooms and caller-refreshed baselines',async()=>{
 const {t,args}=await setup(0);
 await expect(t.mutation(anyApi.cloud.starterWorlds.upgrade,{...args,id:'plot-2-2'})).rejects.toThrow('nine');
 await expect(t.mutation(anyApi.cloud.starterWorlds.upgrade,{...args,expectedVersion:'refreshed'})).rejects.toThrow('baseline');
 expect((await t.mutation(anyApi.cloud.starterWorlds.upgrade,args)).status).toBe('applied');
});
