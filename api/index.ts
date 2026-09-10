import { BrowserIdentityError, browserSameOrigin, resolveBrowserIdentity } from '../packages/playground/browserIdentity.js';
import blenderHandler from './blender.js';
import { playgroundBillingPath, playgroundBroker, launchPlaygroundJob } from '../packages/playground/gateway.js';
import { hostedChatStream } from '../apps/web/hostedChatStream.js';
import { ChatValidationError, validateChatSend } from '../packages/protocol/src/chat.js';
import { MATERIAL_CATALOG } from '../packages/protocol/src/materials.js';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {plotPreviewSnapshot} from '../apps/web/plotPreview.js';
import type {SharedWorld} from '../apps/web/src/worlds/world.js';
import {parsePreviewView,type PreviewView} from '../packages/protocol/src/previewView.js';
import {canonicalPreviewFocus,selectPreviewFocus} from '../packages/protocol/src/previewFocus.js';
type Request=IncomingMessage&{body?:unknown;query:Record<string,string|string[]|undefined>};
const cookieName='__Host-agartha_session';
export default async function handler(req:Request,res:ServerResponse){
  res.setHeader('Cache-Control','no-store');
  const origin=typeof req.headers.origin==='string'?req.headers.origin:undefined;
  const headerToken=typeof req.headers.authorization==='string'&&req.headers.authorization.startsWith('Bearer ')?req.headers.authorization.slice(7):undefined;
  res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
  if(req.method==='OPTIONS'){res.statusCode=204;res.end();return;}
  const send=(value:unknown,status=200)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
  try{
    const rawPath=req.query.path,path=Array.isArray(rawPath)?rawPath.join('/'):rawPath??'';
    if(path==='materials'){send(req.method==='GET'?MATERIAL_CATALOG:{error:'Read-only material catalog'},req.method==='GET'?200:405);return;}
    const base=process.env.AGARTHA_CONVEX_SITE_URL,key=process.env.AGARTHA_CLOUD_GATEWAY_KEY;
    if(!base||!key){send({error:'Cloud configuration is incomplete'},503);return;}
    if(!['GET','POST'].includes(req.method??'')){send({error:'Method not allowed'},405);return;}
    const governancePath=/^governance(?:\/(?:voters|proposals(?:\/[a-zA-Z0-9_-]{1,80}(?:\/(?:open|vote|withdraw|finalize|comments|implementation))?)?))?$/.test(path);
    const playgroundPath=/^playground(?:\/[A-Za-z0-9_.-]{1,128}){0,6}$/.test(path);
    if(!playgroundPath&&!governancePath&&!/^(chat(?:\/(?:events|presence))?|session(?:\/(?:renew|rotate))?|spatial|plots(?:\/[^/?]+){0,2}|plots\/[^/?]+\/proposals\/[^/?]+(?:\/(?:submit|request_changes|withdraw|accept|preview))?|library(?:\/[^/?]+)?|materials\/library(?:\/[^/?]+)?|models(?:\/[^/?]+){0,2}|assets(?:\/[^/?]+){0,3})$/.test(path)){send({error:'Not found'},404);return;}
    if(path==='chat/events' && req.method==='GET'){
      const streamUrl=new URL('/api/chat/events',`https://${req.headers.host}`);
      for(const name of ['after','before'])if(typeof req.query[name]==='string')streamUrl.searchParams.set(name,req.query[name] as string);
      await hostedChatStream(req,res,streamUrl,base);return;
    }
    let previewView:PreviewView='isometric';
    const roomPreview = path.startsWith('plots/') && path.endsWith('/preview');
    if(roomPreview){try{previewView=parsePreviewView(req.query.view);}catch(error){send({error:error instanceof Error?error.message:'Invalid preview view.'},400);return;}}
    let requestedFocus:string|undefined;
    if(roomPreview){try{requestedFocus=canonicalPreviewFocus(req.query.focus);}catch(error){send({error:error instanceof Error?error.message:'Invalid preview focus.'},400);return;}}
    let body:Record<string,any>={};
    if(req.method==='POST'){
      if(!req.headers['content-type']?.startsWith('application/json')){send({error:'Use application/json'},415);return;}
      body=typeof req.body==='string'?JSON.parse(req.body):req.body as Record<string,any>;
      if(!body||typeof body!=='object'||Array.isArray(body)||Buffer.byteLength(JSON.stringify(body))>(path==='library'?4_000_000:65536)){send({error:'Invalid or oversized request'},413);return;}
    }
    if(path==='chat' && req.method==='POST')validateChatSend({requestId:body.requestId,text:body.text});
    const externalRegistration=path==='session'&&typeof body.agentToken==='string';
    if(req.method==='POST'&&origin&&origin!==`https://${req.headers.host}`&&!headerToken&&!externalRegistration){send({error:'Origin not allowed'},403);return;}
    let token=headerToken??req.headers.cookie?.split(';').map(c=>c.trim()).find(c=>c.startsWith(`${cookieName}=`))?.slice(cookieName.length+1);
    const browserIdentityPath = /^playground\/identity(?:\/(export|restore))?$/.test(path);
    if (path === 'session' && req.method === 'POST' && !externalRegistration && !headerToken || browserIdentityPath) {
      try {
        if (headerToken) { send({ error: 'Browser recovery uses your same-origin browser session. Agents use the session recovery API.' }, 400); return; }
        const creating = path === 'session';
        const exporting = path === 'playground/identity/export' && req.method === 'POST';
        const restoring = path === 'playground/identity/restore' && req.method === 'POST';
        if (!creating && !exporting && !restoring && !(path === 'playground/identity' && req.method === 'GET')) { send({ error: 'Method not allowed.' }, 405); return; }
        if (restoring && typeof body.recoveryCode !== 'string') { send({ error: 'Provide your saved recovery code.' }, 400); return; }
        const identity = await resolveBrowserIdentity(req, res, { base: new URL(base), key, allowCreate: creating, ...(creating ? { name: typeof body.name === 'string' ? body.name : 'Playground visitor' } : {}), ...(exporting ? { exportRecovery: true } : {}), ...(restoring ? { restoreCode: body.recoveryCode } : {}) });
        if (exporting && !identity) { send({ error: 'Create a free session before saving its recovery code.' }, 401); return; }
        send(exporting ? { recoveryCode: identity?.recoveryCode } : identity?.identity ?? null); return;
      } catch (error) { send({ error: error instanceof BrowserIdentityError ? error.message : 'Browser identity is unavailable. Your existing identity has not been replaced.' }, error instanceof BrowserIdentityError ? error.status : 503); return; }
    }
    if (playgroundPath && !headerToken && browserSameOrigin(req) && req.headers.cookie) {
      try {
        const identity = await resolveBrowserIdentity(req, res, { base: new URL(base), key });
        if (identity) {
          token = identity.token;
          if (path === 'playground/credits' && req.method === 'POST' && !identity.identity.recoverable) { send({ error: 'Restore your recovery credential before buying credits for this identity.' }, 409); return; }
        }
      } catch (error) { send({ error: error instanceof BrowserIdentityError ? error.message : 'Your browser identity could not be restored.' }, error instanceof BrowserIdentityError ? error.status : 503); return; }
    }
    const publicRead=req.method==='GET'&&!roomPreview&&!governancePath&&!playgroundPath;
    if(publicRead&&!headerToken)token=undefined;
    let setCookie=false;
    if(path==='session'){
      token=externalRegistration?body.agentToken:token??randomBytes(32).toString('hex');
      body={...(externalRegistration&&body.recoveryToken?{recoveryToken:body.recoveryToken}:{}),agentToken:token,name:typeof body.name==='string'?body.name:`Visitor ${randomBytes(3).toString('hex')}`};setCookie=!externalRegistration;
    }else if(req.method==='POST')body={...body,requestId:body.requestId??randomUUID(),issuedAt:body.issuedAt??Date.now()};
    const billingPath = playgroundBillingPath(path);
    if (billingPath) {
      const forwarded = Object.assign(Object.create(req), { query: { ...req.query, path: billingPath }, headers: { ...req.headers, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body });
      await blenderHandler(forwarded, res); return;
    }
    let launchBase: URL | undefined;
    if (req.method === 'POST' && /^playground\/(?:projects\/[^/]+\/funding\/start|allowances\/[^/]+\/jobs)$/.test(path)) {
      try { launchBase = playgroundBroker(token, req); } catch (error) { send({ error: error instanceof Error ? error.message : 'Compute is unavailable.' }, 503); return; }
    }
    const url=new URL(`/cloud/${path}`,base);
    for(const [name,value]of Object.entries(req.query))if(name!=='path'&&typeof value==='string')url.searchParams.set(name,value);
    const ip=String(req.headers['x-vercel-forwarded-for']??req.headers['x-forwarded-for']??'unknown');
    const headers:Record<string,string>={'Content-Type':'application/json','x-agartha-gateway-key':key,'x-agartha-client':createHash('sha256').update(`${key}:${ip}`).digest('hex')};if(token)headers.Authorization=`Bearer ${token}`;
    if (playgroundPath && /^(sk|rk)_(test|live)_/.test(process.env.STRIPE_SECRET_KEY ?? '')) headers['x-agartha-payment-mode'] = /^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY!) ? 'live' : 'test';
    const response=await fetch(url,{method:req.method,headers,body:req.method==='POST'?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
    const data=await response.json();
    if(!response.ok){if(response.status===429&&response.headers.has('Retry-After'))res.setHeader('Retry-After',response.headers.get('Retry-After')!);send(data,response.status);return;}
    if (launchBase && token && typeof data.jobId === 'string') {
      const launched = await launchPlaygroundJob(launchBase, token, data.jobId);
      if (!launched) { send({ error: 'The build budget is reserved, but worker launch was not confirmed. Retry this same request or cancel the build to release unused credits.', ...(data.projectId ? { projectId: data.projectId } : {}), ...(data.allowance?.allowanceId ? { allowanceId: data.allowance.allowanceId } : {}), jobId: data.jobId }, 503); return; }
    }
    if(setCookie)res.setHeader('Set-Cookie',`${cookieName}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`);
    if(data.modelFile||data.assetFile){const download=new URL(data.url);if(download.protocol!=='https:')throw new Error('Invalid asset download URL');res.statusCode=302;res.setHeader('Location',download.href);res.end();return;}
    if(data.render){
      const source=data.source as SharedWorld;
      let focusObjects;try{focusObjects=selectPreviewFocus(source.objects,requestedFocus);}catch(error){send({error:error instanceof Error?error.message:'Invalid preview focus.'},404);return;}
      const worker=process.env.AGARTHA_RENDER_URL,renderKey=process.env.AGARTHA_RENDER_KEY;if(!worker||!renderKey){send({error:'Cloud renderer is not configured'},503);return;}
      const worlds:SharedWorld[]=previewView!=='isometric'&&focusObjects?[{...source,objects:focusObjects}]:data.grid?[...data.grid.plots,...data.grid.empty.map((p:any)=>({schema:1,id:p.id,name:'Open ground',brief:'',revision:-1,objects:[],events:[],placement:{x:p.x,z:p.z,size:32}}))]:[source];
      const meshIds=[...new Set(worlds.flatMap(world=>world.objects.flatMap(object=>object.meshId?[object.meshId]:[])))];
      const meshes=await Promise.all(meshIds.map(async id=>{const response=await fetch(new URL(`/cloud/library/${id}`,base),{headers,signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('Mesh unavailable for preview');return response.json();}));
      const modelFiles:Record<string,string>={};let modelBytes=0;
      for(const id of new Set(worlds.flatMap(world=>world.objects.flatMap(object=>object.modelId?[object.modelId]:[])))){
        const fileInfo=await fetch(new URL(`/cloud/models/${id}/file`,base),{headers,signal:AbortSignal.timeout(20000)});if(!fileInfo.ok)throw new Error('Model file unavailable');const file=await fileInfo.json();
        if(!Number.isFinite(file.bytes)||file.bytes>16_000_000||modelBytes+file.bytes>32_000_000){send({error:'Preview model data exceeds 32 MB; inspect a smaller area.'},413);return;}
        const modelResponse=await fetch(file.url,{signal:AbortSignal.timeout(30000)});if(!modelResponse.ok)throw new Error('Model download failed');const bytes=Buffer.from(await modelResponse.arrayBuffer());if(bytes.length!==file.bytes)throw new Error('Model file size changed');modelBytes+=bytes.length;modelFiles[id]=bytes.toString('base64');
      }
      const previewTime=Number(req.query.time??0);if(!Number.isFinite(previewTime)||previewTime<0||previewTime>120){send({error:'Preview time must be 0–120 seconds.'},400);return;}
      const focusId=requestedFocus;
      const rendered=plotPreviewSnapshot(worlds.map(world=>({...world,meshes:meshes.filter(mesh=>world.objects.some(object=>object.meshId===mesh.id))})),source,previewTime,focusId,previewView);
      const image=await fetch(new URL('/render',worker),{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${renderKey}`},body:JSON.stringify({objects:rendered.snapshot.objects,shaders:rendered.snapshot.shaders??[],meshes:rendered.snapshot.meshes??[],modelFiles,previewTime,focusId:rendered.snapshot.focusId,view:previewView}),signal:AbortSignal.timeout(80000)});
      if(!image.ok){send({error:'Cloud preview rendering failed. Your saved world is unchanged.'},503);return;}
      if(data.proposal){res.setHeader('X-Agartha-Proposal',data.proposal.proposalId);res.setHeader('X-Agartha-Proposal-Revision',String(data.proposal.revision));res.setHeader('X-Agartha-Base-Snapshot',data.proposal.baseSnapshotVersion);}
      res.setHeader('Content-Type','image/png');res.setHeader('X-Agartha-Renderer','vgpu-cloud');res.setHeader('X-Agartha-Revision',String(source.revision));res.setHeader('X-Agartha-Snapshot',rendered.digest);res.setHeader('X-Agartha-Plot',source.id);res.setHeader('X-Agartha-Preview-Time',String(previewTime));res.setHeader('X-Agartha-Preview-View',previewView);res.end(Buffer.from(await image.arrayBuffer()));return;
    }
    send(data);
  }catch(error){if(res.headersSent){res.end();return;}if(error instanceof ChatValidationError){send({error:error.message},400);return;}console.error('Agartha gateway failure',error instanceof Error?error.name:'unknown');send({error:'Cloud request could not complete. Observe the world before retrying a write.'},503);}
}
