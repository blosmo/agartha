import {afterEach,expect,it,vi} from 'vitest';
import handler from '../api/index';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
function response(){const headers:Record<string,unknown>={};let body='';return {headers,get body(){return body;},statusCode:200,getHeader:(key:string)=>headers[key],setHeader:(key:string,value:unknown)=>{headers[key]=value;},end:(value:string)=>{body=value;}};}
it('forwards nested proposal actions and preserves structured conflicts',async()=>{
  vi.stubEnv('AGARTHA_CONVEX_SITE_URL','https://example.convex.site');vi.stubEnv('AGARTHA_CLOUD_GATEWAY_KEY','gateway-secret');
  const conflict={code:'conflict',error:'Objects changed',conflicts:[{id:'chair',expectedVersion:1,currentVersion:2}]};
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify(conflict),{status:409}));vi.stubGlobal('fetch',fetcher);
  const res=response();await handler({method:'POST',headers:{host:'world.example','content-type':'application/json',authorization:'Bearer agent-token'},query:{path:'plots/plot-1-0/proposals/proposal-1/accept'},body:{requestId:'accept-1',expectedRevision:3}} as never,res as never);
  expect(res.statusCode).toBe(409);expect(JSON.parse(res.body)).toEqual(conflict);
  expect(String(fetcher.mock.calls[0][0])).toBe('https://example.convex.site/cloud/plots/plot-1-0/proposals/proposal-1/accept');
  expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer agent-token');
});
it('renders an exact proposal preview with proposal and base snapshot headers',async()=>{
  vi.stubEnv('AGARTHA_CONVEX_SITE_URL','https://example.convex.site');vi.stubEnv('AGARTHA_CLOUD_GATEWAY_KEY','gateway-secret');
  vi.stubEnv('AGARTHA_RENDER_URL','https://render.example');vi.stubEnv('AGARTHA_RENDER_KEY','render-key');
  const source={schema:1,id:'plot-1-0',name:'Preview',brief:'',revision:2,version:'composite-version',objects:[{id:'seat',name:'Draft seat',shape:'box',position:[0,1,0],scale:[1,1,1],color:'#cc8844'}],events:[],placement:{x:1,z:0,size:32}};
  const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({render:true,source,proposal:{proposalId:'proposal-1',revision:3,baseSnapshotVersion:'base-version'}}))).mockResolvedValueOnce(new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png'}}));vi.stubGlobal('fetch',fetcher);
  const res=response();await handler({method:'GET',headers:{host:'world.example',authorization:'Bearer agent-token'},query:{path:'plots/plot-1-0/proposals/proposal-1/preview',revision:'3'}} as never,res as never);
  expect(res.statusCode).toBe(200);expect(res.headers['Content-Type']).toBe('image/png');
  expect(res.headers['X-Agartha-Proposal']).toBe('proposal-1');expect(res.headers['X-Agartha-Proposal-Revision']).toBe('3');expect(res.headers['X-Agartha-Base-Snapshot']).toBe('base-version');
  expect(String(fetcher.mock.calls[0][0])).toContain('revision=3');
  const payload=JSON.parse(fetcher.mock.calls[1][1].body);expect(payload.objects).toEqual(expect.arrayContaining([expect.objectContaining({id:'plot-1-0-seat',color:'#cc8844'})]));
});
it('creates a secure browser identity without exposing the credential in the response',async()=>{
  vi.stubEnv('AGARTHA_CONVEX_SITE_URL','https://example.convex.site');vi.stubEnv('AGARTHA_CLOUD_GATEWAY_KEY','gateway-secret');
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({agentId:`agent-${'c'.repeat(24)}`,name:'Visitor',accessToken:'a'.repeat(64),recoveryToken:'b'.repeat(64),expiresAt:Date.now()+1000,recoveryConfigured:true,recoverable:true})));vi.stubGlobal('fetch',fetcher);
  const res=response();await handler({method:'POST',headers:{host:'world.example','content-type':'application/json',origin:'https://world.example'},query:{path:'session'},body:{}} as never,res as never);
  expect(res.statusCode).toBe(200);expect(res.headers['Set-Cookie']).toEqual(expect.arrayContaining([expect.stringMatching(/HttpOnly; Secure; SameSite=Lax/)]));expect(res.body).not.toContain('gateway-secret');
  const request=fetcher.mock.calls[0][1];expect(request.headers['x-agartha-gateway-key']).toBe('gateway-secret');expect(JSON.parse(request.body).candidateToken).toMatch(/^[a-f0-9]{64}$/);expect(JSON.parse(request.body).candidateRecoveryToken).toMatch(/^[a-f0-9]{64}$/);expect(res.body).not.toContain('a'.repeat(64));expect(res.body).not.toContain('b'.repeat(64));
});
it('allows an explicit remote agent registration without setting a browser cookie',async()=>{
  vi.stubEnv('AGARTHA_CONVEX_SITE_URL','https://example.convex.site');vi.stubEnv('AGARTHA_CLOUD_GATEWAY_KEY','gateway-secret');vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({agentId:'agent-2'}))));
  const res=response();await handler({method:'POST',headers:{host:'world.example','content-type':'application/json',origin:'https://agent.example'},query:{path:'session'},body:{agentToken:'a'.repeat(64),name:'Remote'}} as never,res as never);
  expect(res.statusCode).toBe(200);expect(res.headers['Set-Cookie']).toBeUndefined();
});
it('rejects cross-origin cookie writes before reaching cloud state',async()=>{
  vi.stubEnv('AGARTHA_CONVEX_SITE_URL','https://example.convex.site');vi.stubEnv('AGARTHA_CLOUD_GATEWAY_KEY','gateway-secret');const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const res=response();await handler({method:'POST',headers:{host:'world.example','content-type':'application/json',origin:'https://untrusted.example',cookie:'__Host-agartha_session=secret'},query:{path:'plots/the-commons'},body:{}} as never,res as never);
  expect(res.statusCode).toBe(403);expect(fetcher).not.toHaveBeenCalled();
});
it('reads public rooms anonymously even with a stale visitor cookie, while preserving explicit Bearer intent',async()=>{
 vi.stubEnv('AGARTHA_CONVEX_SITE_URL','https://example.convex.site');vi.stubEnv('AGARTHA_CLOUD_GATEWAY_KEY','gateway-secret');
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({rooms:[]})));vi.stubGlobal('fetch',fetcher);
 await handler({method:'GET',headers:{host:'world.example',cookie:'__Host-agartha_session=expired',origin:'https://reader.example'},query:{path:'plots',view:'summary'}} as never,response() as never);
 expect(fetcher.mock.calls[0][1].headers.Authorization).toBeUndefined();
 fetcher.mockResolvedValue(new Response(JSON.stringify({rooms:[]})));
 await handler({method:'GET',headers:{host:'world.example',authorization:'Bearer explicit'},query:{path:'plots'}} as never,response() as never);
 expect(fetcher.mock.calls[1][1].headers.Authorization).toBe('Bearer explicit');
});
it('redirects model downloads to storage without exposing gateway credentials',async()=>{
 vi.stubEnv('AGARTHA_CONVEX_SITE_URL','https://example.convex.site');vi.stubEnv('AGARTHA_CLOUD_GATEWAY_KEY','gateway-secret');
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({modelFile:true,url:'https://storage.example/model.glb',bytes:32})));vi.stubGlobal('fetch',fetcher);
 const res=response();await handler({method:'GET',headers:{host:'world.example'},query:{path:`models/model-${'a'.repeat(64)}/file`}} as never,res as never);
 expect(res.statusCode).toBe(302);expect(res.headers.Location).toBe('https://storage.example/model.glb');expect(res.body).toBeUndefined();expect(fetcher).toHaveBeenCalledTimes(1);
});
it('includes unique native model bytes in previews without forwarding private headers to storage',async()=>{
 vi.stubEnv('AGARTHA_CONVEX_SITE_URL','https://example.convex.site');vi.stubEnv('AGARTHA_CLOUD_GATEWAY_KEY','gateway-secret');vi.stubEnv('AGARTHA_RENDER_URL','https://render.example');vi.stubEnv('AGARTHA_RENDER_KEY','render-key');
 const modelId=`model-${'a'.repeat(64)}`,bytes=new Uint8Array([1,2,3,4]);
 const object={id:'fox',name:'Fox',shape:'model',modelId,position:[0,1,0],scale:[1,1,1],color:'#ffffff'};
 const source={schema:1,id:'plot-1-0',name:'Preview',brief:'',revision:2,objects:[object,{...object,id:'fox-2'},{id:'bench-leg',name:'Bench leg',shape:'box',position:[0,1,0],scale:[1,3,1],color:'#ffffff'}],events:[],placement:{x:1,z:0,size:32}};
 const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({render:true,source}))).mockResolvedValueOnce(new Response(JSON.stringify({modelFile:true,url:'https://storage.example/model.glb',bytes:4}))).mockResolvedValueOnce(new Response(bytes)).mockResolvedValueOnce(new Response(bytes));vi.stubGlobal('fetch',fetcher);
 const res=response();await handler({method:'GET',headers:{host:'world.example',authorization:'Bearer agent-token'},query:{path:'plots/plot-1-0/preview',time:'1',focus:'fox-2,fox,fox',view:'side'}} as never,res as never);
 expect(res.statusCode).toBe(200);expect(fetcher).toHaveBeenCalledTimes(4);
 expect(fetcher.mock.calls[1][1].headers.Authorization).toBe('Bearer agent-token');expect(fetcher.mock.calls[2][1].headers).toBeUndefined();
 const payload=JSON.parse(fetcher.mock.calls[3][1].body);expect(payload.modelFiles).toEqual({[modelId]:Buffer.from(bytes).toString('base64')});expect(payload.objects.map((item:{id:string})=>item.id)).toEqual(['plot-1-0-fox','plot-1-0-fox-2']);expect(payload.previewTime).toBe(1);expect(payload.focusId).toBe('plot-1-0-fox,plot-1-0-fox-2');expect(payload.view).toBe('side');expect(res.headers['X-Agartha-Preview-View']).toBe('side');expect(fetcher.mock.calls[3][1].headers.Authorization).toBe('Bearer render-key');
});

it('rejects an invalid preview view before reading cloud state or starting render work',async()=>{
 vi.stubEnv('AGARTHA_CONVEX_SITE_URL','https://example.convex.site');vi.stubEnv('AGARTHA_CLOUD_GATEWAY_KEY','gateway-secret');
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 const res=response();await handler({method:'GET',headers:{host:'world.example'},query:{path:'plots/plot-1-0/preview',view:'rear'}} as never,res as never);
 expect(res.statusCode).toBe(400);expect(JSON.parse(res.body)).toEqual({error:'Preview view must be isometric, front, side, or top.'});expect(fetcher).not.toHaveBeenCalled();
});

it('rejects malformed or absent multi-object focus before model and render work',async()=>{
 vi.stubEnv('AGARTHA_CONVEX_SITE_URL','https://example.convex.site');vi.stubEnv('AGARTHA_CLOUD_GATEWAY_KEY','gateway-secret');
 let fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 const oversized=response();await handler({method:'GET',headers:{host:'world.example'},query:{path:'plots/plot-1-0/preview',focus:Array.from({length:21},(_,i)=>`part-${i}`).join(',')}} as never,oversized as never);
 expect(oversized.statusCode).toBe(400);expect(fetcher).not.toHaveBeenCalled();
 const source={schema:1,id:'plot-1-0',name:'Preview',brief:'',revision:2,objects:[{id:'body',name:'Body',shape:'box',position:[0,1,0],scale:[1,1,1],color:'#ffffff'}],events:[],placement:{x:1,z:0,size:32}};
 fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({render:true,source})));vi.stubGlobal('fetch',fetcher);
 const missing=response();await handler({method:'GET',headers:{host:'world.example'},query:{path:'plots/plot-1-0/preview',focus:'body,handle'}} as never,missing as never);
 expect(missing.statusCode).toBe(404);expect(JSON.parse(missing.body).error).toContain('not found');expect(fetcher).toHaveBeenCalledTimes(1);
});

it('forwards canonical publication and downloads previews as public assets, not room renders',async()=>{
 vi.stubEnv('AGARTHA_CONVEX_SITE_URL','https://example.convex.site');vi.stubEnv('AGARTHA_CLOUD_GATEWAY_KEY','gateway-secret');
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json({id:'bundle-'+ 'a'.repeat(64)})).mockResolvedValueOnce(Response.json({assetFile:true,url:'https://example.convex.cloud/api/storage/file',bytes:100}));vi.stubGlobal('fetch',fetcher);
 const published=response();await handler({method:'POST',headers:{host:'world.example','content-type':'application/json',authorization:'Bearer agent-token'},query:{path:'assets/upload-ticket'},body:{name:'Shared creation'}} as never,published as never);
 expect(published.statusCode).toBe(200);expect(String(fetcher.mock.calls[0][0])).toBe('https://example.convex.site/cloud/assets/upload-ticket');
 const preview=response();await handler({method:'GET',headers:{host:'world.example',cookie:'__Host-agartha_session=private-cookie'},query:{path:'assets/bundle-'+ 'a'.repeat(64)+'/files/preview',view:'not-a-room-view'}} as never,preview as never);
 expect(preview.statusCode).toBe(302);expect(preview.headers.Location).toBe('https://example.convex.cloud/api/storage/file');expect(fetcher.mock.calls[1][1].headers.Authorization).toBeUndefined();
});

it('forwards authenticated chat sends without changing request identity',async()=>{
 vi.stubEnv('AGARTHA_CONVEX_SITE_URL','https://example.convex.site');vi.stubEnv('AGARTHA_CLOUD_GATEWAY_KEY','gateway-secret');
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({id:'chat-1',sequence:1,author:'Registered agent'})));vi.stubGlobal('fetch',fetcher);
 const res=response();await handler({method:'POST',headers:{host:'world.example','content-type':'application/json',authorization:'Bearer agent-token'},query:{path:'chat'},body:{requestId:'stable-message',text:'Hello'}} as never,res as never);
 expect(res.statusCode).toBe(200);expect(String(fetcher.mock.calls[0][0])).toBe('https://example.convex.site/cloud/chat');
 expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({requestId:'stable-message',text:'Hello'});
 expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer agent-token');
});
it('rejects chat sends without a stable request ID before contacting the backend',async()=>{
 vi.stubEnv('AGARTHA_CONVEX_SITE_URL','https://example.convex.site');vi.stubEnv('AGARTHA_CLOUD_GATEWAY_KEY','gateway-secret');
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 const res=response();await handler({method:'POST',headers:{host:'world.example','content-type':'application/json',authorization:'Bearer agent-token'},query:{path:'chat'},body:{text:'Hello'}} as never,res as never);
 expect(res.statusCode).toBe(400);expect(fetcher).not.toHaveBeenCalled();
});
