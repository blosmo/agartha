import {convexTest} from 'convex-test';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import schema from './schema';
const modules=import.meta.glob('./**/*.{ts,js}');
const key='proposal-http-gateway';
beforeEach(()=>vi.stubEnv('AGARTHA_CLOUD_GATEWAY_KEY',key));
afterEach(()=>vi.unstubAllEnvs());
async function setup(){
  const t=convexTest({schema,modules,transactionLimits:true});
  const tokens=['a','b','c'].map(c=>c.repeat(64));let sequence=0;
  const call=async(path:string,actor=0,body?:Record<string,unknown>)=>t.fetch(`/cloud/${path}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-agartha-gateway-key':key,'x-agartha-client':`client-${actor}`,Authorization:`Bearer ${tokens[actor]}`},...(body?{body:JSON.stringify({requestId:`http-${++sequence}`,issuedAt:Date.now(),...body})}:{})});
  const agents=[];for(let i=0;i<tokens.length;i++)agents.push(await(await call('session',i,{agentToken:tokens[i],name:`Agent ${i}`})).json());
  const room='plots/plot-3-3';expect((await call('plots',0,{x:3,z:3,name:'Collaborative room'})).status).toBe(200);
  const object={id:'seat',name:'Seat',shape:'box',position:[0,1,0],scale:[1,1,1],color:'#aabbcc'};
  expect((await call(room,0,{message:'Initial seat',objects:[object],expectedVersions:{seat:0}})).status).toBe(200);
  return {t,call,room,object,agents};
}
it('supports the full agent HTTP proposal loop and a composited preview without changing the room',async()=>{
  const {call,room,object,agents}=await setup();
  const created=await call(`${room}/proposals`,1,{title:'A warmer seat',editors:[agents[2].agentId],changes:[{id:'seat',expectedVersion:1,object:{...object,color:'#cc8844'}}]});
  expect(created.status).toBe(200);let proposal=await created.json();
  const added={...object,id:'lamp',name:'Lamp',position:[3,1,0]};
  const edited=await call(`${room}/proposals/${proposal.proposalId}`,2,{expectedRevision:proposal.revision,changes:[{id:'lamp',expectedVersion:0,object:added}]});
  expect(edited.status).toBe(200);proposal=await edited.json();
  const preview=await call(`${room}/proposals/${proposal.proposalId}/preview?revision=${proposal.revision}`,1);
  expect(preview.status).toBe(200);const rendered=await preview.json();
  expect(rendered.render).toBe(true);expect(rendered.source.objects.find((o:{id:string})=>o.id==='seat').color).toBe('#cc8844');expect(rendered.source.objects).toHaveLength(2);
  expect(rendered.proposal.revision).toBe(proposal.revision);
  const before=await(await call(room)).json();expect(before.objects).toHaveLength(1);expect(before.objects[0].color).toBe('#aabbcc');
  const submitted=await call(`${room}/proposals/${proposal.proposalId}/submit`,1,{expectedRevision:proposal.revision});expect(submitted.status).toBe(200);proposal=await submitted.json();
  const inbox=await(await call(`${room}/proposals?status=submitted`)).json();expect(inbox.page.map((p:{proposalId:string})=>p.proposalId)).toContain(proposal.proposalId);
  const feed=await(await call(`${room}/proposal-events?after=0`)).json();expect(feed.events.length).toBeGreaterThanOrEqual(3);
  expect((await call(`${room}/proposals/${proposal.proposalId}/accept`,2,{expectedRevision:proposal.revision})).status).toBe(403);
  const acceptance={requestId:'accept-retry',expectedRevision:proposal.revision};
  expect((await call(`${room}/proposals/${proposal.proposalId}/accept`,0,acceptance)).status).toBe(200);
  expect((await call(`${room}/proposals/${proposal.proposalId}/accept`,0,acceptance)).status).toBe(200);
  const after=await(await call(room)).json();expect(after.objects).toHaveLength(2);
  expect(after.objects.find((o:{id:string})=>o.id==='seat').owner).toBe(agents[0].agentId);
  expect(after.objects.find((o:{id:string})=>o.id==='lamp').owner).toBe(agents[2].agentId);
  expect(after.events.some((e:{message:string})=>e.message.includes('A warmer seat'))).toBe(true);
  const resumed=await(await call(`${room}/proposal-events?after=${feed.nextSequence}`)).json();expect(resumed.events.length).toBeGreaterThan(0);
});
it('returns structured conflicts for stale object versions and requires an exact preview revision',async()=>{
  const {call,room,object}=await setup();
  let p=await(await call(`${room}/proposals`,1,{title:'Seat update',changes:[{id:'seat',expectedVersion:1,object:{...object,color:'#ff0000'}}]})).json();
  expect(p.proposalId).toBeTypeOf('string');
  expect((await call(`${room}/proposals/${p.proposalId}/preview`,1)).status).toBe(400);
  p=await(await call(`${room}/proposals/${p.proposalId}/submit`,1,{expectedRevision:p.revision})).json();
  expect((await call(room,0,{message:'Owner edit',objects:[{...object,color:'#00ff00'}],expectedVersions:{seat:1}})).status).toBe(200);
  for(const response of [await call(`${room}/proposals/${p.proposalId}/accept`,0,{expectedRevision:p.revision}),await call(`${room}/proposals/${p.proposalId}/preview?revision=${p.revision}`,1)]){
    expect(response.status).toBe(409);const error=await response.json();expect(error.code).toBe('conflict');expect(error.conflicts).toEqual(expect.arrayContaining([expect.objectContaining({id:'seat',currentVersion:2})]));
  }
  expect((await(await call(room)).json()).objects[0].color).toBe('#00ff00');
});
it('supports versioned co-owners without allowing outsiders or removal of the final owner',async()=>{
  const {call,room,agents}=await setup();
  const first=await call(`${room}/owners`);expect(first.status).toBe(200);const owners=await first.json();
  const snapshot=await(await call(room)).json();expect(snapshot.collaboration.supported).toBe(true);expect(snapshot.collaboration.owners).toEqual(owners.owners);expect(snapshot.collaboration.proposals).toBe(`/api/${room}/proposals`);
  expect(owners.owners.map((a:{agentId:string})=>a.agentId)).toEqual([agents[0].agentId]);
  const change={expectedVersion:owners.version,agentId:agents[1].agentId,owner:true};
  expect((await call(`${room}/owners`,2,change)).status).toBe(403);
  expect((await call(`${room}/owners`,0,change)).status).toBe(200);
  const next=await(await call(`${room}/owners`)).json();
  expect((await call(`${room}/owners`,1,{expectedVersion:next.version,agentId:agents[0].agentId,owner:false})).status).toBe(200);
  const last=await(await call(`${room}/owners`)).json();expect((await call(`${room}/owners`,1,{expectedVersion:last.version,agentId:agents[1].agentId,owner:false})).status).toBe(403);
});
it('paginates a busy room and resumes its feed across disconnected HTTP readers',async()=>{
  const {t,room,object}=await setup();
  const request=async(path:string,token:string,body?:Record<string,unknown>)=>t.fetch(`/cloud/${path}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-agartha-gateway-key':key,'x-agartha-client':token,Authorization:`Bearer ${token}`},...(body?{body:JSON.stringify(body)}:{})});
  const ids=[];
  for(let i=1;i<=26;i++){
    const token=i.toString(16).padStart(64,'0');
    expect((await request('session',token,{agentToken:token,name:`Collaborator ${i}`})).status).toBe(200);
    const draft=await request(`${room}/proposals`,token,{requestId:`busy-create-${i}`,title:`Contribution ${i}`,changes:[{id:`new-${i}`,expectedVersion:0,object:{...object,id:`new-${i}`}}]});
    expect(draft.status).toBe(200);const p=await draft.json();ids.push(p.proposalId);
    expect((await request(`${room}/proposals/${p.proposalId}/submit`,token,{requestId:`busy-submit-${i}`,expectedRevision:p.revision})).status).toBe(200);
  }
  const reader='a'.repeat(64);
  const first=await(await request(`${room}/proposals?status=submitted`,reader)).json();expect(first.page).toHaveLength(20);expect(first.isDone).toBe(false);
  const second=await(await request(`${room}/proposals?status=submitted&cursor=${encodeURIComponent(first.continueCursor)}`,reader)).json();expect(second.page).toHaveLength(6);expect(second.isDone).toBe(true);
  expect(new Set([...first.page,...second.page].map(p=>p.proposalId))).toEqual(new Set(ids));
  const beforeDisconnect=await(await request(`${room}/proposal-events?after=0`,reader)).json();expect(beforeDisconnect.events).toHaveLength(50);expect(beforeDisconnect.hasMore).toBe(true);
  const savedCursor=beforeDisconnect.nextSequence;
  const afterReconnect=await(await request(`${room}/proposal-events?after=${savedCursor}`,reader)).json();expect(afterReconnect.events).toHaveLength(2);expect(afterReconnect.hasMore).toBe(false);
  expect(afterReconnect.events[0].sequence).toBe(savedCursor+1);
  expect((await(await request(room,reader)).json()).objects).toHaveLength(1);
});
it('does not silently preview deletion of an absent object',async()=>{
  const {call,room}=await setup();
  const draft=await(await call(`${room}/proposals`,1,{title:'Remove a missing object',changes:[{id:'missing',expectedVersion:0}]})).json();
  const preview=await call(`${room}/proposals/${draft.proposalId}/preview?revision=${draft.revision}`,1);
  expect(preview.status).toBe(400);
  expect((await(await call(room)).json()).objects).toHaveLength(1);
});
