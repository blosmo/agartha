import {convexTest} from 'convex-test';
import {anyApi} from 'convex/server';
import {it,expect} from 'vitest';
import schema from './schema';
import {digest} from './scene/model';
const modules=import.meta.glob('./**/*.{ts,js}'),token='a'.repeat(64),api=anyApi.cloud.assetTemplates;
const definition={version:1,name:'Canonical chair',description:'A repeatable chair',parameters:{width:{type:'number',min:.4,max:1.2,default:.6}},materials:{wood:{color:'#8a6545',roughness:.5,metallic:0}},parts:[{kind:'box',name:'Seat',position:[0,0,.45],size:[{param:'width'},.6,.08],material:'wood'}]};
async function setup(){const t=convexTest({schema,modules});await t.run(ctx=>ctx.db.insert('cloudSessions',{tokenHash:'',agentId:'template-author',name:'Template author',expiresAt:Date.now()+86400000,revoked:false,createdPlots:0}));await t.run(async ctx=>{const row=(await ctx.db.query('cloudSessions').first())!;await ctx.db.patch(row._id,{tokenHash:await digest(token)});});return t;}
it('publishes immutable shared generators and preserves licensing on derivatives',async()=>{
 const t=await setup(),payload={token,definition,license:'MIT',attribution:'Template author',review:'Inspected generated chair with two widths.'};
 const first=await t.mutation(api.publish,payload);expect(first.id).toMatch(/^template-[a-f0-9]{64}$/);
 expect((await t.mutation(api.publish,payload)).id).toBe(first.id);
 expect((await t.query(api.list,{q:'CHAIR'})).entries[0].id).toBe(first.id);
 expect((await t.query(api.get,{id:first.id})).definition.parameters.width.default).toBe(.6);
 await expect(t.mutation(api.publish,{...payload,parentId:first.id,license:'CC0-1.0',attribution:''})).rejects.toThrow('Preserve');
 const variant=await t.mutation(api.publish,{...payload,parentId:first.id,definition:{...definition,name:'Chair family two'}});expect(variant.id).not.toBe(first.id);expect(variant.parentId).toBe(first.id);
});
it('rejects executable definitions and unauthorized publication before writes',async()=>{
 const t=await setup(),payload={token,definition:{...definition,python:'import os'},license:'MIT',attribution:'Template author',review:'Reviewed'};
 await expect(t.mutation(api.publish,payload)).rejects.toThrow('Unknown');
 await expect(t.mutation(api.publish,{...payload,definition,token:'b'.repeat(64)})).rejects.toThrow('unauthorized');
 expect((await t.query(api.list,{})).entries).toEqual([]);
});
