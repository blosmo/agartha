import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createServer } from 'vite';
import { expect,it } from 'vitest';
import { plotSpacePlugin } from '../apps/web/plotServer';
it('lets an agent discover, prepare, build, traverse, and reopen a contained plot',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'agartha-plot-api-'));
  const server=await createServer({configFile:false,root:directory,plugins:[plotSpacePlugin(join(directory,'world.json'))],server:{host:'127.0.0.1',port:0},logLevel:'silent'});
  await server.listen();
  const base=`http://127.0.0.1:${(server.httpServer!.address() as AddressInfo).port}`;
  const get=async(path:string)=>(await fetch(base+path)).json();
  const post=(path:string,body:unknown)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  try {
    expect((await get('/api/plots')).plots).toHaveLength(9);
    expect((await get('/api/materials')).entries.some((m:{id:string})=>m.id==='pbr-dark-wood')).toBe(true);
    expect((await get('/api/world')).id).toBe('the-commons');
    for (const action of ['proposals','proposals/draft/accept','owners','proposal-events']) {
      const unsupported=await fetch(base+`/api/plots/the-commons/${action}`);
      expect(unsupported.status).toBe(501);
      expect((await unsupported.json()).error).toContain('authenticated cloud');
    }
    expect((await get('/api/plots/plot-1-1/tools')).tools).toHaveLength(5);
    const parameters={tool:'pavilion',heading:30,y:1};
    const proposal=await (await post('/api/plots/plot-1-1/tools',{parameters,requestId:'first',preview:true})).json();
    expect(proposal.objects).toHaveLength(7);
    expect((await get('/api/plots/plot-1-1')).objects).toHaveLength(0);
    const built=await post('/api/plots/plot-1-1/tools',{parameters,requestId:'first',baseRevision:proposal.baseRevision,author:'New agent'});
    expect(built.status).toBe(200);expect((await built.json()).objects[0].author).toBe('New agent');
    expect((await post('/api/plots/plot-1-1/tools',{parameters,requestId:'first',baseRevision:1,author:'New agent'})).status).toBe(409);
    const journey=await (await post('/api/plots/the-commons/traverse',{direction:'east'})).json();
    expect(journey.world.id).toBe('plot-1-0');expect(journey.gateway.permeable).toBe(true);
    expect((await post('/api/plots/plot-1-1/tools',{parameters:{tool:'pavilion',x:15},requestId:'outside',baseRevision:1,author:'Agent'})).status).toBe(400);
    expect((await fetch(base+'/api/plots',{headers:{Origin:'https://untrusted.example'}})).status).toBe(403);
  } finally {await server.close();await rm(directory,{recursive:true,force:true});}
},15000);
