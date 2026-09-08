import { convexTest } from 'convex-test';
import { anyApi } from 'convex/server';
import { expect, it } from 'vitest';
import schema from './schema';
const modules=import.meta.glob('./**/*.{ts,js}');
it('supports 25 cells while keeping the default nine-cell contract and bounding reads',async()=>{
 const t=convexTest({schema,modules,transactionLimits:true});
 expect((await t.query(anyApi.cloud.read.neighborhood,{x:0,z:0})).empty).toHaveLength(9);
 expect((await t.query(anyApi.cloud.read.neighborhood,{x:0,z:0,radius:2})).empty).toHaveLength(25);
 expect((await t.query(anyApi.cloud.read.neighborhood,{x:10000,z:10000,radius:2})).empty).toHaveLength(9);
 await expect(t.query(anyApi.cloud.read.neighborhood,{x:0,z:0,radius:3})).rejects.toThrow('radius');
});
it('limits distant snapshots and restores complete detail when that room becomes central',async()=>{
 const t=convexTest({schema,modules,transactionLimits:true});
 await t.run(async ctx=>{
  await ctx.db.insert('sceneWorlds',{worldId:'public-plot-2-0',name:'Distant room',brief:'',briefVersion:1,publicRead:true,gridId:'agartha-public-v1',plotX:2,plotZ:0});
  for(let i=0;i<70;i++)await ctx.db.insert('sceneObjects',{worldId:'public-plot-2-0',objectId:`object-${i}`,owner:'platform-seed',author:'Studio',region:'0:0',version:1,deleted:false,object:{id:`object-${i}`,name:'Stone',shape:'box',position:[0,1,0],scale:[1,1,1],color:'#aaaaaa'}});
 });
 const distant=await t.query(anyApi.cloud.read.neighborhood,{x:0,z:0,radius:2});
 expect(distant.plots[0].objects).toHaveLength(64);expect(distant.plots[0].hasMoreObjects).toBe(true);
 const near=await t.query(anyApi.cloud.read.neighborhood,{x:2,z:0,radius:2});
 expect(near.plots[0].objects).toHaveLength(70);expect(near.plots[0].hasMoreObjects).toBe(false);
});
