import {convexTest} from 'convex-test';
import {anyApi} from 'convex/server';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import schema from './schema';
import {createWorld} from '../apps/web/src/worlds/world';

const modules=import.meta.glob('./**/*.{ts,js}');
const gateway='governance-integration-gateway';
const token='a'.repeat(64),other='b'.repeat(64);
beforeEach(()=>{vi.stubEnv('AGARTHA_CLOUD_GATEWAY_KEY',gateway);vi.stubEnv('AGARTHA_SCENE_OPERATOR_TOKEN','governance-test-operator-credential');});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
async function setup(){
 const t=convexTest({schema,modules,transactionLimits:true});
 await t.mutation(anyApi.cloud.write.bootstrapPlot,{world:createWorld()});
 let sequence=0;
 const call=async(path:string,bearer?:string,body?:Record<string,unknown>)=>{
  const response=await t.fetch(`/cloud${path}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-agartha-gateway-key':gateway,'x-agartha-client':'test-governance-client',...(bearer?{Authorization:`Bearer ${bearer}`}:{})},...(body?{body:JSON.stringify({requestId:`integration-${++sequence}`,...body})}:{})});
  return {status:response.status,data:await response.json()};
 };
 const ok=async(path:string,bearer?:string,body?:Record<string,unknown>)=>{const result=await call(path,bearer,body);expect(result.status,JSON.stringify(result.data)).toBe(200);return result.data;};
 const actor=await ok('/session',undefined,{agentToken:token,name:'World founder'});
 const second=await ok('/session',undefined,{agentToken:other,name:'Visiting agent'});
 const room=await ok('/plots',token,{x:3,z:2,name:'Governed room'});
 return {t,call,ok,actor,second,room};
}
it('makes rules and voting discoverable at registration, room discovery and tool discovery',async()=>{
 const {ok,actor,room}=await setup();
 expect(actor.governance).toMatchObject({supported:true,scope:'software',canPropose:true,eligibleToVote:false,guide:'/agents/governance.md'});
 expect(room.governance).toMatchObject({supported:true,scope:'world:plot-3-2',eligibleToVote:true,canPropose:true});
 expect((await ok('/plots/plot-3-2/tools',token)).governance).toMatchObject({scope:'world:plot-3-2',eligibleToVote:true});
 const overview=await ok('/governance?scope=world%3Aplot-3-2',token);
 expect(overview.permissions).toMatchObject({eligibleToVote:true,canManageVoters:true});
 const visitor=await ok('/governance?scope=world%3Aplot-3-2',other);
 expect(visitor.permissions).toMatchObject({canPropose:true,eligibleToVote:false,canManageVoters:false});
 expect(JSON.stringify([actor,room,overview,visitor])).not.toContain(token);
});
it('enacts world rules and enforces raw edits, builders, assets and accepted room proposals',async()=>{
 const {t,ok,call}=await setup();const scope='world:plot-3-2';
 const object={id:'existing-box',name:'Grandfathered box',shape:'box',position:[0,4,0],scale:[1,1,1],color:'#aabbcc'};
 await ok('/plots/plot-3-2',token,{issuedAt:Date.now(),message:'Existing art',objects:[object]});
 const geometryDraft=await ok('/plots/plot-3-2/proposals',token,{title:'A future box',changes:[{id:'draft-box',expectedVersion:0,object:{...object,id:'draft-box'}}]});
 const geometrySubmitted=await ok(`/plots/plot-3-2/proposals/${geometryDraft.proposalId}/submit`,token,{expectedRevision:geometryDraft.revision});
 const asset=await ok('/library',token,{plotId:'plot-3-2',definition:{kind:'asset',name:'A box asset',objects:[{...object,id:'part'}]}});
 const proposal=await ok('/governance/proposals',token,{scope,title:'Small round objects',rationale:'Keep this world small and round.',change:{kind:'world_rules',rules:{allowedShapes:['sphere'],maxObjectScale:2,charter:'Build small round objects together.'}}});
 const open=await ok(`/governance/proposals/${proposal.id}/open`,token,{expectedRevision:proposal.revision,votingHours:1});
 await ok(`/governance/proposals/${proposal.id}/vote`,token,{expectedRevision:open.revision,expectedBallotVersion:0,choice:'yes'});
 vi.spyOn(Date,'now').mockReturnValue(open.closesAt+1);
 await t.mutation(anyApi.governance.mutations.finalizeDue,{});
 const closed=await ok(`/governance/proposals/${proposal.id}`,token);expect(closed.status).toBe('active');expect(closed.tally.passed).toBe(true);
 const rules=await ok(`/governance?scope=${encodeURIComponent(scope)}`,token);expect(rules.rules).toEqual({allowedShapes:['sphere'],maxObjectScale:2,charter:'Build small round objects together.'});
 const saved=await ok('/plots/plot-3-2',token);expect(saved.objects.some((o:{id:string})=>o.id===object.id)).toBe(true);
 const bad=await call('/plots/plot-3-2',token,{issuedAt:Date.now(),message:'Forbidden shape',objects:[{...object,id:'bad-box'}]});expect(bad.status).toBe(400);expect(bad.data.error).toMatch(/world rules/);
 expect((await call('/plots/plot-3-2/tools',token,{issuedAt:Date.now(),parameters:{tool:'pavilion'},preview:false})).status).toBe(400);
 expect((await call('/plots/plot-3-2/assets',token,{issuedAt:Date.now(),assetId:asset.id,parameters:{x:0,z:0},preview:false})).status).toBe(400);
 expect((await call(`/plots/plot-3-2/proposals/${geometryDraft.proposalId}/accept`,token,{expectedRevision:geometrySubmitted.revision})).status).toBe(400);
 expect((await call('/plots/plot-3-2',token,{issuedAt:Date.now(),message:'Too large',objects:[{...object,id:'large-sphere',shape:'sphere',scale:[3,1,1]}]})).status).toBe(400);
 const good=await ok('/plots/plot-3-2',token,{issuedAt:Date.now(),message:'A small sphere',objects:[{...object,id:'small-sphere',shape:'sphere'}]});
 expect(good.objects.map((o:{id:string})=>o.id).sort()).toEqual(['existing-box','small-sphere']);
});
it('keeps software votes as implementation requests and prevents a forged voter identity',async()=>{
 const {t,ok,call,actor,second}=await setup();
 await t.mutation(anyApi.governance.admin.setSoftwareVoters,{operatorToken:'governance-test-operator-credential',expectedVersion:0,agentIds:[actor.agentId]});
 const proposal=await ok('/governance/proposals',token,{scope:'software',title:'Export worlds',rationale:'Let contributors take their work with them.',change:{kind:'software',rule:'Every world can be exported by its owner.',implementation:'Add a portable world export endpoint.',acceptanceCriteria:['Export preserves object provenance.','Private credentials are excluded.']}});
 const open=await ok(`/governance/proposals/${proposal.id}/open`,token,{expectedRevision:proposal.revision,votingHours:1});
 const spoof=await call(`/governance/proposals/${proposal.id}/vote`,other,{expectedRevision:open.revision,expectedBallotVersion:0,choice:'yes',agentId:actor.agentId});expect(spoof.status).toBe(403);
 await ok(`/governance/proposals/${proposal.id}/comments`,other,{text:'Please include asset attribution.'});
 await ok(`/governance/proposals/${proposal.id}/vote`,token,{expectedRevision:open.revision,expectedBallotVersion:0,choice:'yes'});
 vi.spyOn(Date,'now').mockReturnValue(open.closesAt+1);
 const finalized=await ok(`/governance/proposals/${proposal.id}/finalize`,other,{expectedRevision:open.revision});expect(finalized.status).toBe('implementation_pending');
 const packet=await ok(`/governance/proposals/${proposal.id}/implementation`);expect(packet.repository).toBe('https://github.com/blosmo/agartha');expect(packet.status).toBe('implementation_pending');expect(packet.acceptanceCriteria).toHaveLength(2);
 const comments=await ok(`/governance/proposals/${proposal.id}/comments`);expect(comments.page[0].author.agentId).toBe(second.agentId);
 expect(JSON.stringify([packet,comments,finalized])).not.toContain(token);
 const overview=await ok('/governance?scope=software');expect(overview.rules).toBeNull();
});

it('does not apply public governance lookup to a separate private world with a public-prefixed name',async()=>{
 const {t}=await setup();const curator='c'.repeat(64),worldId='public-private-workshop';
 await t.mutation(anyApi.scene.authority.createWorld,{operatorToken:'governance-test-operator-credential',worldId,name:'Private workshop',brief:'Independent private space.',curatorToken:curator,publicRead:false});
 const result=await t.mutation(anyApi.scene.authority.edit,{worldId,token:curator,requestId:'private-object',issuedAt:Date.now(),message:'Create private object',changes:[{id:'private-sphere',expectedVersion:0,object:{id:'private-sphere',name:'Sphere',shape:'sphere',position:[0,1,0],scale:[1,1,1],color:'#aabbcc'}}]});
 expect(result.changed).toEqual([{id:'private-sphere',version:1}]);
});

it('keeps one ballot through credential rotation and rejects the retired credential',async()=>{
 const {t,ok,call,actor}=await setup();
 const draft=await ok('/governance/proposals',token,{scope:'world:plot-3-2',title:'Small pieces',rationale:'Leave space.',change:{kind:'world_rules',rules:{maxObjectScale:5}}});
 const opened=await ok(`/governance/proposals/${draft.id}/open`,token,{expectedRevision:draft.revision,votingHours:1});
 await ok(`/governance/proposals/${draft.id}/vote`,token,{expectedRevision:opened.revision,expectedBallotVersion:0,choice:'yes'});
 const nextToken='d'.repeat(64);
 const rotated=await ok('/session/rotate',token,{newToken:nextToken});expect(rotated.agentId).toBe(actor.agentId);
 expect((await call(`/governance/proposals/${draft.id}/vote`,token,{expectedRevision:opened.revision,expectedBallotVersion:1,choice:'no'})).status).toBe(401);
 const changed=await ok(`/governance/proposals/${draft.id}/vote`,nextToken,{expectedRevision:opened.revision,expectedBallotVersion:1,choice:'no'});
 expect(changed.ballots).toHaveLength(1);expect(changed.ballots[0]).toMatchObject({agentId:actor.agentId,choice:'no',version:2});
 expect((await t.run(ctx=>ctx.db.query('governanceBallots').collect()))).toHaveLength(1);
});
it('serializes concurrent finalizers without enacting a rule twice',async()=>{
 const {ok,call}=await setup(),scope='world:plot-3-2';
 const initial=await ok(`/governance?scope=${encodeURIComponent(scope)}`,token);
 const draft=await ok('/governance/proposals',token,{scope,title:'Compact objects',rationale:'Preserve shared space.',change:{kind:'world_rules',rules:{maxObjectScale:5}}});
 const opened=await ok(`/governance/proposals/${draft.id}/open`,token,{expectedRevision:draft.revision,votingHours:1});
 await ok(`/governance/proposals/${draft.id}/vote`,token,{expectedRevision:opened.revision,expectedBallotVersion:0,choice:'yes'});
 vi.spyOn(Date,'now').mockReturnValue(opened.closesAt+1);
 const results=await Promise.all([call(`/governance/proposals/${draft.id}/finalize`,token,{expectedRevision:opened.revision}),call(`/governance/proposals/${draft.id}/finalize`,other,{expectedRevision:opened.revision})]);
 expect(results.some(result=>result.status===200)).toBe(true);expect(results.every(result=>result.status===200||result.status===409)).toBe(true);
 const current=await ok(`/governance?scope=${encodeURIComponent(scope)}`,token);expect(current.rulesVersion).toBe(initial.rulesVersion+1);expect(current.rules.maxObjectScale).toBe(5);
 expect((await ok(`/governance/proposals/${draft.id}`,token)).status).toBe('active');
});
