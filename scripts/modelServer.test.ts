import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {AddressInfo} from 'node:net';
import {createServer} from 'vite';
import {expect,it} from 'vitest';
import {plotSpacePlugin} from '../apps/web/plotServer';
import {glbFixture} from '../packages/protocol/src/geometry/glbFixture';
it('uploads and reads immutable GLBs through the local API',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'agartha-model-api-'));const server=await createServer({configFile:false,root:dir,plugins:[plotSpacePlugin(join(dir,'world.json'))],server:{host:'127.0.0.1',port:0},logLevel:'silent'});await server.listen();
 const base=`http://127.0.0.1:${(server.httpServer!.address() as AddressInfo).port}`;
 try{
  const bytes=glbFixture(),upload=await fetch(`${base}/api/models?name=Animated%20model&author=Builder`,{method:'POST',headers:{'Content-Type':'model/gltf-binary'},body:bytes});expect(upload.status).toBe(200);const model=await upload.json();
  expect(model.inspection.animations).toHaveLength(1);const file=await fetch(base+model.contentUrl);expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
  expect((await fetch(base+model.contentUrl,{headers:{'If-None-Match':file.headers.get('etag')!}})).status).toBe(304);
  expect((await(await fetch(base+'/api/models')).json()).entries).toHaveLength(1);
  expect((await fetch(base+'/api/models',{headers:{Origin:'https://untrusted.example'}})).status).toBe(403);
 }finally{await server.close();await rm(dir,{recursive:true,force:true});}
},15000);
it('rejects an over-budget room edit without persisting its objects',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'agartha-render-budget-'));const server=await createServer({configFile:false,root:dir,plugins:[plotSpacePlugin(join(dir,'world.json'))],server:{host:'127.0.0.1',port:0},logLevel:'silent'});await server.listen();
 const base=`http://127.0.0.1:${(server.httpServer!.address() as AddressInfo).port}`,url=base+'/api/plots/plot-1-1';
 try{
  let world=await(await fetch(url)).json();
  for(let batch=0;batch<6;batch++){
   const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseRevision:world.revision,author:'Builder',message:'Budget test',objects:Array.from({length:100},(_,i)=>({id:`sphere-${batch}-${i}`,name:'Sphere',shape:'sphere',position:[0,1,0],scale:[.1,.1,.1],color:'#ffffff'}))})});
   if(batch<5){expect(response.status).toBe(200);world=await response.json();}else{expect(response.status).toBe(400);expect((await response.json()).error).toContain('triangles');}
  }
  const persisted=await(await fetch(url)).json();expect(persisted.objects).toHaveLength(500);expect(persisted.revision).toBe(world.revision);
 }finally{await server.close();await rm(dir,{recursive:true,force:true});}
},15000);
it('places a native model and rejects missing clips before saving',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'agartha-native-model-'));const server=await createServer({configFile:false,root:dir,plugins:[plotSpacePlugin(join(dir,'world.json'))],server:{host:'127.0.0.1',port:0},logLevel:'silent'});await server.listen();
 const base=`http://127.0.0.1:${(server.httpServer!.address() as AddressInfo).port}`;
 try{
  const model=await(await fetch(base+'/api/models?name=Moving%20model&author=Builder',{method:'POST',headers:{'Content-Type':'model/gltf-binary'},body:glbFixture()})).json();
  let world=await(await fetch(base+'/api/plots/plot-1-1')).json();
  const object={id:'model-instance',name:'Moving model',shape:'model',modelId:model.id,position:[0,2,0],scale:[2,2,2],color:'#ffffff',animation:{clip:'Float',speed:1,paused:false}};
  const post=(objects:unknown[])=>fetch(base+'/api/plots/plot-1-1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseRevision:world.revision,author:'Builder',message:'Place native model',objects})});
  const saved=await post([object]);expect(saved.status).toBe(200);world=await saved.json();expect(world.objects[0].animation.clip).toBe('Float');
  const invalid=await post([{...object,animation:{...object.animation,clip:'Missing'}}]);expect(invalid.status).toBe(400);expect((await(await fetch(base+'/api/plots/plot-1-1')).json()).revision).toBe(world.revision);
 }finally{await server.close();await rm(dir,{recursive:true,force:true});}
},15000);
