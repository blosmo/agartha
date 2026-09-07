import {convexTest} from 'convex-test';
import {anyApi} from 'convex/server';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import schema from './schema';
const modules=import.meta.glob('./**/*.{ts,js}');
const key='test-gateway';
beforeEach(()=>vi.stubEnv('AGARTHA_CLOUD_GATEWAY_KEY',key));afterEach(()=>vi.unstubAllEnvs());
const headers=(token?:string)=>({'Content-Type':'application/json','x-agartha-gateway-key':key,'x-agartha-client':'lifecycle-test',...(token?{Authorization:`Bearer ${token}`}:{})});
async function setup(){const t=convexTest({schema,modules,transactionLimits:true});const token='a'.repeat(64),recoveryToken='b'.repeat(64);const actor=await t.mutation(anyApi.cloud.session.register,{token,recoveryToken,name:'Keeper',ipHash:'one'});await t.mutation(anyApi.cloud.write.createPlot,{token,x:2,z:-3,name:'Original'});return {t,token,recoveryToken,actor};}
const edit={requestId:'build-original',issuedAt:Date.now(),message:'A chair',expectedVersions:{chair:0},objects:[{id:'chair',name:'Chair',shape:'box',position:[0,1,0],scale:[1,1,1],color:'#aabbcc'}]};
it('rotates credentials without changing ownership, rejects retired keys and invalidates old derived keys',async()=>{
 const {t,token,actor}=await setup();
 expect((await t.fetch('/cloud/plots/plot-2--3',{method:'POST',headers:headers(token),body:JSON.stringify(edit)})).status).toBe(200);
 const oldMember=await t.mutation(anyApi.cloud.session.member,{id:'plot-2--3',token});
 const next='c'.repeat(64);const rotated=await t.mutation(anyApi.cloud.session.maintain,{operation:'rotate',token,newToken:next});expect(rotated.agentId).toBe(actor.agentId);
 await expect(t.mutation(anyApi.cloud.session.register,{token,name:'Attack',ipHash:'two'})).rejects.toThrow('retired');
 await expect(t.mutation(anyApi.scene.authority.edit,{worldId:oldMember.worldId,token:oldMember.token,requestId:'old-derived',issuedAt:Date.now(),message:'No',changes:[]})).rejects.toThrow('revoked');
 const update=await t.fetch('/cloud/plots/plot-2--3',{method:'POST',headers:headers(next),body:JSON.stringify({...edit,requestId:'update-chair',expectedVersions:{chair:1},objects:[{...edit.objects[0],color:'#ffffff'}]})});expect(update.status).toBe(200);
 const saved=await update.json();expect(saved.objects[0].owner).toBe(actor.agentId);expect(saved.objectVersions.chair).toBe(2);expect(saved.permissions.canEditBrief).toBe(true);
 const retry=await t.mutation(anyApi.cloud.session.maintain,{operation:'rotate',token:next,newToken:next});expect(retry.credentialVersion).toBe(1);
});
it('recovers an expired identity using a separate recovery credential and preserves curator rights',async()=>{
 const {t,token,recoveryToken,actor}=await setup();
 await t.run(async ctx=>{const row=await ctx.db.query('cloudSessions').first();await ctx.db.patch(row!._id,{expiresAt:Date.now()-1});});
 await expect(t.mutation(anyApi.cloud.session.maintain,{operation:'renew',token})).rejects.toThrow('recovery');
 await expect(t.mutation(anyApi.cloud.session.maintain,{operation:'renew',agentId:actor.agentId,recoveryToken:'d'.repeat(64)})).rejects.toThrow('recovery');
 const response=await t.fetch('/cloud/session/rotate',{method:'POST',headers:headers(),body:JSON.stringify({agentId:actor.agentId,recoveryToken,newToken:'e'.repeat(64)})});expect(response.status).toBe(200);expect((await response.json()).agentId).toBe(actor.agentId);
 const lifecycle=await t.mutation(anyApi.cloud.write.lifecycle,{id:'plot-2--3',token:'e'.repeat(64),expectedVersion:1,name:'Still mine'});expect(lifecycle.name).toBe('Still mine');
});
it('supports recovery enrollment for existing valid identities without resetting the identity',async()=>{
 const t=convexTest({schema,modules});const token='9'.repeat(64);const actor=await t.mutation(anyApi.cloud.session.register,{token,name:'Existing',ipHash:'legacy'});
 const renewed=await t.mutation(anyApi.cloud.session.maintain,{operation:'renew',token,newRecoveryToken:'8'.repeat(64)});expect(renewed.agentId).toBe(actor.agentId);expect(renewed.recoveryConfigured).toBe(true);
});
it('renames, archives and restores in place while preserving collaborator objects and reserving coordinates',async()=>{
 const {t,token}=await setup();const other='f'.repeat(64);await t.mutation(anyApi.cloud.session.register,{token:other,name:'Collaborator',ipHash:'other'});
 await t.fetch('/cloud/plots/plot-2--3',{method:'POST',headers:headers(other),body:JSON.stringify(edit)});
 await expect(t.mutation(anyApi.cloud.write.lifecycle,{id:'plot-2--3',token:other,expectedVersion:1,archived:true})).rejects.toThrow('creator');
 const result=await t.fetch('/cloud/plots/plot-2--3/lifecycle',{method:'POST',headers:headers(token),body:JSON.stringify({expectedVersion:1,name:'Renamed',archived:true})});expect(result.status).toBe(200);
 const summary=await(await t.fetch('/cloud/plots?x=2&z=-3&view=summary',{headers:headers()})).json();expect(summary.rooms).toHaveLength(0);expect(summary.archived[0].id).toBe('plot-2--3');expect(summary.empty.some((p:{id:string})=>p.id==='plot-2--3')).toBe(false);
 await expect(t.mutation(anyApi.cloud.write.createPlot,{token,x:2,z:-3,name:'Reuse'})).rejects.toThrow('exists');
 expect((await t.fetch('/cloud/plots/plot-2--3',{method:'POST',headers:headers(other),body:JSON.stringify({...edit,requestId:'blocked'})})).status).toBe(403);
 await expect(t.mutation(anyApi.cloud.write.lifecycle,{id:'plot-2--3',token,expectedVersion:1,archived:false})).rejects.toThrow('changed');
 await t.mutation(anyApi.cloud.write.lifecycle,{id:'plot-2--3',token,expectedVersion:2,archived:false});
 const room=await(await t.fetch('/cloud/plots/plot-2--3',{headers:headers()})).json();expect(room.objects).toHaveLength(1);expect(room.name).toBe('Renamed');expect(room.location.origin).toEqual([64,0,-96]);expect(room.location.roomId).toBe('plot-2--3');expect(room.archived).toBe(false);
});
it('returns hour-window retry guidance and lightweight spatial discovery',async()=>{
 const {t,token}=await setup();await t.run(async ctx=>{await ctx.db.insert('cloudLimits',{key:'registration:hour-test',windowStart:Date.now()-10000,count:100});});
 const response=await t.fetch('/cloud/session',{method:'POST',headers:{...headers(),'x-agartha-client':'hour-test'},body:JSON.stringify({agentToken:'0'.repeat(64),name:'Rate limited'})});expect(response.status).toBe(429);expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(3500);
 const summary=await(await t.fetch('/cloud/plots?x=2&z=-3&view=summary',{headers:headers(token)})).json();expect(JSON.stringify(summary)).not.toContain('objectVersions');expect(summary.rooms[0].location.cell).toEqual({x:2,z:-3});
 const spatial=await(await t.fetch('/cloud/spatial?x=-16&y=4&z=16',{headers:headers()})).json();expect(spatial.cell).toEqual({x:0,z:1});expect(spatial.position).toEqual([-16,4,-16]);
});
it('returns a real snapshot version instead of the legacy zero revision for proposals',async()=>{
 const {t,token}=await setup();const response=await t.fetch('/cloud/plots/plot-2--3/tools',{method:'POST',headers:headers(token),body:JSON.stringify({requestId:'prepare',issuedAt:Date.now(),parameters:{tool:'pavilion'},preview:true})});expect(response.status).toBe(200);const proposal=await response.json();expect(proposal.baseRevision).toBeUndefined();expect(proposal.snapshotVersion).toMatch(/^[a-f0-9]{64}$/);expect(proposal.concurrency).toBe('object-versions');
});
it('protects enrolled recovery credentials and never revives revoked identities',async()=>{
 const {t,token,recoveryToken,actor}=await setup();
 await expect(t.mutation(anyApi.cloud.session.maintain,{operation:'renew',token,newRecoveryToken:'7'.repeat(64)})).rejects.toThrow('Prove');
 const changed=await t.mutation(anyApi.cloud.session.maintain,{operation:'renew',token,recoveryToken,newRecoveryToken:'7'.repeat(64)});expect(changed.agentId).toBe(actor.agentId);
 await t.run(async ctx=>{const row=await ctx.db.query('cloudSessions').first();await ctx.db.patch(row!._id,{revoked:true});});
 await expect(t.mutation(anyApi.cloud.session.maintain,{operation:'rotate',agentId:actor.agentId,recoveryToken:'7'.repeat(64),newToken:'6'.repeat(64)})).rejects.toThrow('unavailable');
});
