import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {HEADLESS_RECIPES,headlessObjects,type HeadlessPart} from './fixtures/headless-objects';
import type {MeshDefinition} from '../packages/protocol/src/sharedLibrary';
import type {WorldObject} from '../apps/web/src/worlds/world';

type Group='vessel'|'bench';
type PlacementState={requestId:string;issuedAt:number};
type State={runs:Record<string,{groups:Partial<Record<Group,PlacementState>>}>};
const base='https://agartha-dusky.vercel.app';
const identity=JSON.parse(await readFile('.agartha/hosted-model-verification.json','utf8')) as {token:string;roomId:string};
if(!/^[a-f0-9]{64}$/.test(identity.token)||!/^plot-[0-9-]+$/.test(identity.roomId))throw new Error('Missing valid private verification identity.');
const stateFile='.agartha/hosted-headless-verification.json';
let state:State={runs:{}};
try{state=JSON.parse(await readFile(stateFile,'utf8')) as State;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
const save=()=>writeFile(stateFile,JSON.stringify(state),{mode:0o600});
async function request<T>(path:string,body?:unknown):Promise<T>{
 for(let attempt=0;attempt<3;attempt++){
  const response=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:`Bearer ${identity.token}`},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(120000)});
  const data=await response.json() as T&{error?:string};
  if(response.ok)return data;
  if(response.status===429&&attempt<2){const seconds=Number(response.headers.get('Retry-After')??60);if(!Number.isFinite(seconds)||seconds<1||seconds>60)throw new Error('Invalid retry delay.');console.log(`Waiting ${seconds} seconds for the publish window.`);await new Promise(resolve=>setTimeout(resolve,seconds*1000+100));continue;}
  throw new Error(`${path}: HTTP ${response.status}: ${data.error??'request failed'}`);
 }
 throw new Error('Request attempts exhausted.');
}
const roomPath=`/api/plots/${identity.roomId}`;
const catalog=await request<{meshes?:{modeling?:Record<string,string>};visualReview?:{views?:string[]}}>(roomPath+'/tools');
if(!catalog.meshes?.modeling?.sweep||!catalog.visualReview?.views?.includes('top'))throw new Error('Headless core is not deployed; no verification writes made.');
const meshes={} as Record<HeadlessPart,MeshDefinition&{id:string}>;
for(const [key,recipe]of Object.entries(HEADLESS_RECIPES))meshes[key as HeadlessPart]=await request('/api/library',{plotId:identity.roomId,definition:{kind:'mesh',name:`Headless ${key}`,description:'Deterministic headless construction fixture.',recipe}});
const objects=headlessObjects(meshes),version=createHash('sha256').update(JSON.stringify(objects)).digest('hex').slice(0,16);
state.runs[version]??={groups:{}};await save();
const focusByGroup={vessel:[] as string[],bench:[] as string[]},assemblies={} as Record<Group,string>;
for(const group of ['vessel','bench'] as const){
 const asset=await request<{id:string}>('/api/library',{plotId:identity.roomId,definition:{kind:'asset',name:`Headless ${group}`,description:'Reusable composition of essential forms.',objects:objects.filter(object=>object.id.startsWith(`headless-${group}-`))}});
 assemblies[group]=asset.id;
 state.runs[version].groups[group]??={requestId:`headless-${version}-${group}`,issuedAt:Date.now()};await save();
 const placement={...state.runs[version].groups[group]!,assetId:asset.id,parameters:{x:group==='vessel'?-5:4,y:0,z:-6}};
 const prepared=await request<{objects:WorldObject[]}>(roomPath+'/assets',{...placement,preview:true});
 focusByGroup[group]=prepared.objects.map(object=>object.id);
 const before=await request<{objects:WorldObject[]}>(roomPath),existing=prepared.objects.filter(object=>before.objects.some(current=>current.id===object.id));
 if(existing.length&&existing.length!==prepared.objects.length)throw new Error('A previous verification assembly was partially changed; inspect it before retrying.');
 if(!existing.length)await request(roomPath+'/assets',{...placement,preview:false});
 const after=await request<{objects:WorldObject[]}>(roomPath);
 for(const part of prepared.objects){const stored=after.objects.find(object=>object.id===part.id);if(!stored||stored.meshId!==part.meshId||JSON.stringify(stored.position)!==JSON.stringify(part.position))throw new Error('Saved assembly differs from its prepared geometry.');}
}
const dir=await mkdtemp(join(tmpdir(),'agartha-hosted-headless-')),artifacts=[];
for(const group of ['vessel','bench'] as const){
 const hashes=new Set<string>();
 for(const view of ['isometric','front','side','top']){
  let response:Response|undefined;
  for(let attempt=0;attempt<3;attempt++){
   response=await fetch(`${base}${roomPath}/preview?view=${view}&focus=${focusByGroup[group].join(',')}`,{headers:{Authorization:`Bearer ${identity.token}`},signal:AbortSignal.timeout(120000)});
   if(response.status!==429||attempt===2)break;
   const seconds=Number(response.headers.get('Retry-After')??60);if(!Number.isFinite(seconds)||seconds<1||seconds>60)throw new Error('Invalid preview retry delay.');
   await response.body?.cancel();console.log(`Waiting ${seconds} seconds for the preview window.`);await new Promise(resolve=>setTimeout(resolve,seconds*1000+100));
  }
  if(!response)throw new Error('No preview response.');
  if(!response.ok||response.headers.get('X-Agartha-Preview-View')!==view||response.headers.get('Content-Type')!=='image/png')throw new Error(`Hosted ${group}/${view} preview failed (${response.status}).`);
  const bytes=Buffer.from(await response.arrayBuffer());if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('Expected PNG data.');
  const hash=createHash('sha256').update(bytes).digest('hex'),file=join(dir,`${group}-${view}.png`);hashes.add(hash);await writeFile(file,bytes);artifacts.push({group,view,file,hash,snapshot:response.headers.get('X-Agartha-Snapshot')});
 }
 if(hashes.size!==4)throw new Error('The four hosted views did not produce distinct images.');
}
console.log(JSON.stringify({url:`${base}/?plot=${identity.roomId}`,assemblies,artifacts}));
