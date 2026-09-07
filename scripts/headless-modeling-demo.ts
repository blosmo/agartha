import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import type {AddressInfo} from 'node:net';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {plotSpacePlugin} from '../apps/web/plotServer';
import {HEADLESS_RECIPES,headlessObjects,type HeadlessPart} from './fixtures/headless-objects';

const dir=await mkdtemp(join(tmpdir(),'agartha-headless-demo-'));
const server=await createServer({configFile:false,root:resolve('apps/web'),plugins:[react(),plotSpacePlugin(join(dir,'world.json'))],server:{host:'127.0.0.1',port:0},logLevel:'warn'});
await server.listen();
const base=`http://127.0.0.1:${(server.httpServer!.address() as AddressInfo).port}`,plotId='plot-1-1';
async function request(path:string,body?:unknown){
 const response=await fetch(base+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
 const result=await response.json();if(!response.ok)throw new Error(`${response.status}: ${result.error}`);return result;
}
try{
 const meshes={} as Record<HeadlessPart,{id:string;geometry:{bounds:number[];positions:number[];indices:number[]}}>;
 for(const [key,recipe]of Object.entries(HEADLESS_RECIPES))meshes[key as HeadlessPart]=await request('/api/library',{plotId,author:'Headless modeling fixture',definition:{kind:'mesh',name:`Headless ${key}`,description:'Deterministic headless construction fixture.',recipe}});
 const objects=headlessObjects(meshes),focusByGroup={vessel:[] as string[],bench:[] as string[]},assemblies={} as Record<'vessel'|'bench',string>;
 for(const group of ['vessel','bench'] as const){
  const parts=objects.filter(object=>object.id.startsWith(`headless-${group}-`));
  const asset=await request('/api/library',{plotId,author:'Headless modeling fixture',definition:{kind:'asset',name:`Headless ${group}`,description:'Reusable composition of essential forms.',objects:parts}});
  assemblies[group]=asset.id;
  const placement={assetId:asset.id,parameters:{x:group==='vessel'?-5:4,y:0,z:0},requestId:`headless-${group}`,author:'Headless modeling fixture'};
  const prepared=await request(`/api/plots/${plotId}/assets`,{...placement,preview:true});
  focusByGroup[group]=prepared.objects.map((object:{id:string})=>object.id);
  const saved=await request(`/api/plots/${plotId}/assets`,{...placement,preview:false,baseRevision:prepared.baseRevision});
  if(!focusByGroup[group].every(id=>saved.objects.some((object:{id:string})=>object.id===id)))throw new Error('An assembly part was not saved.');
 }
 const artifacts=[];
 for(const group of ['vessel','bench'] as const){
  const focus=focusByGroup[group].join(',');
  for(const view of ['isometric','front','side','top']){
   const response=await fetch(`${base}/api/plots/${plotId}/preview?view=${view}&focus=${focus}`);
   if(!response.ok)throw new Error(`Preview ${view}: ${await response.text()}`);
   if(response.headers.get('X-Agartha-Preview-View')!==view)throw new Error('Preview did not identify its view.');
   const file=join(dir,`${group}-${view}.png`);await writeFile(file,new Uint8Array(await response.arrayBuffer()));artifacts.push({group,view,file,snapshot:response.headers.get('X-Agartha-Snapshot')});
  }
 }
 console.log(JSON.stringify({url:`${base}/?plot=${plotId}`,dir,parts:objects.length,assemblies,costs:Object.fromEntries(Object.entries(meshes).map(([key,mesh])=>[key,{vertices:mesh.geometry.positions.length/3,triangles:mesh.geometry.indices.length/3}])),artifacts}));
 if(!process.argv.includes('--keep'))await server.close();
}catch(error){await server.close();throw error;}
process.on('SIGINT',()=>{void server.close().then(()=>process.exit(0));});
