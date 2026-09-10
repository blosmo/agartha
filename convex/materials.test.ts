import {convexTest} from 'convex-test';
import {anyApi} from 'convex/server';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import schema from './schema';
import {digest} from './scene/model';
import {materialSwatchFixture,contributionFixture} from '../packages/protocol/src/materialContributionsFixture';
const modules=import.meta.glob('./**/*.{ts,js}'),token='a'.repeat(64),readerToken='b'.repeat(64),gateway='material-test-gateway';
beforeEach(()=>vi.stubEnv('AGARTHA_CLOUD_GATEWAY_KEY',gateway));
afterEach(()=>vi.unstubAllEnvs());
async function setup(change?:(json:Record<string,any>)=>void){
  const t=convexTest({schema,modules,transactionLimits:true});
  await t.run(async ctx=>{
    for(const [credential,id] of [[token,'author'],[readerToken,'reader']])await ctx.db.insert('cloudSessions',{tokenHash:await digest(credential),agentId:id,name:id,expiresAt:Date.now()+86400000,revoked:false,createdPlots:0});
    const bytes=materialSwatchFixture(change),storageId=await ctx.storage.store(new Blob([bytes]));
    const modelId=`model-${await digest('material-fixture')}`;
    await ctx.db.insert('cloudModels',{gridId:'agartha-public-v1',modelId,storageId,name:'Swatch',description:'',author:'author',agentId:'author',createdAt:Date.now(),inspection:{bytes:bytes.length}});
    const sourceId=await ctx.storage.store(new Blob(['BLENDER-v450'])),previewId=await ctx.storage.store(new Blob(['preview']));
    await ctx.db.insert('cloudAssets',{bundleId:contributionFixture.bundleId,agentId:'author',modelId,metadata:{name:'Swatch',license:'CC0-1.0'},source:{sha256:'c'.repeat(64),bytes:12},preview:{sha256:'d'.repeat(64),bytes:7},sourceId,previewId,author:'author',createdAt:Date.now()});
  });return t;
}
it('publishes a verified swatch once and makes it discoverable to future agents',async()=>{
  const t=await setup();
  const publish=()=>t.action(anyApi.cloud.materials.publish,{token,definition:contributionFixture});
  const first=await publish();expect(first.id).toMatch(/^material-[a-f0-9]{64}$/);expect(await publish()).toEqual(first);
  expect(await t.run(ctx=>ctx.db.query('cloudMaterials').collect())).toHaveLength(1);
  const response=await t.fetch('/cloud/materials/library?q=limestone',{headers:{'x-agartha-gateway-key':gateway,Authorization:`Bearer ${readerToken}`}});
  expect(response.status).toBe(200);const page=await response.json();expect(page.entries[0].id).toBe(first.id);expect(page.cursor).toBeNull();expect(page.entries[0].recipe).toBeUndefined();
  const detail=await t.fetch(`/cloud/materials/library/${first.id}`,{headers:{'x-agartha-gateway-key':gateway}});
  expect(detail.status).toBe(200);expect((await detail.json()).recipe).toBe(contributionFixture.recipe);
  expect(JSON.stringify(first)).not.toMatch(/storageId|sourceId|previewId|tokenHash/);
});
it('rejects another agent, missing review, license changes, missing maps and revoked sessions',async()=>{
  const t=await setup();
  await expect(t.action(anyApi.cloud.materials.publish,{token:readerToken,definition:contributionFixture})).rejects.toThrow('own');
  await expect(t.action(anyApi.cloud.materials.publish,{token,definition:{...contributionFixture,review:''}})).rejects.toThrow('review');
  await expect(t.action(anyApi.cloud.materials.publish,{token,definition:{...contributionFixture,license:'CC-BY-4.0',attribution:'Me'}})).rejects.toThrow('match');
  const invalid=await setup(j=>{delete j.materials[0].normalTexture;});
  await expect(invalid.action(anyApi.cloud.materials.publish,{token,definition:contributionFixture})).rejects.toThrow('normal');
  expect(await invalid.run(ctx=>ctx.db.query('cloudMaterials').collect())).toHaveLength(0);
  await t.run(async ctx=>{const author=await ctx.db.query('cloudSessions').withIndex('by_agent',q=>q.eq('agentId','author')).unique();await ctx.db.patch(author!._id,{revoked:true});});
  await expect(t.action(anyApi.cloud.materials.publish,{token,definition:contributionFixture})).rejects.toThrow('expired or invalid');
});
it('keeps a cursor when a filtered page has no matches and rejects invalid cursors',async()=>{
  const t=await setup();await t.action(anyApi.cloud.materials.publish,{token,definition:contributionFixture});
  await t.run(async ctx=>{const {_id,_creationTime,...row}=(await ctx.db.query('cloudMaterials').first())!;for(let i=1;i<=26;i++)await ctx.db.insert('cloudMaterials',{...row,materialId:`material-${i.toString(16).padStart(64,'0')}`,definition:{...row.definition,name:i===26?'Rare granite':'Other stone',tags:[]}});});
  const first=await t.query(anyApi.cloud.materials.list,{q:'rare'});expect(first.entries).toEqual([]);expect(first.cursor).not.toBeNull();
  const second=await t.query(anyApi.cloud.materials.list,{q:'rare',cursor:first.cursor});expect(second.entries).toHaveLength(1);
  await expect(t.query(anyApi.cloud.materials.list,{cursor:'bad'})).rejects.toThrow('search');
});
