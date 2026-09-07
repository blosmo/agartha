import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {LibraryStore} from '../apps/web/libraryStore';
import {PlotStore} from '../apps/web/plotStore';
import {instantiateAsset} from '../packages/protocol/src/sharedLibrary';
it('shares immutable assets and shader versions across plots',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'agartha-library-'));
  try {
    const library=new LibraryStore(join(dir,'library')),plots=new PlotStore(join(dir,'world.json'));
    const shader=await library.publish({kind:'shader',name:'Green',expression:'color * vec3f(0.5, 1.0, 0.5)'},'Agent');
    const repeated=await library.publish({kind:'shader',name:'Green',expression:'color * vec3f(0.5, 1.0, 0.5)'},'Other agent');expect(repeated.id).toBe(shader.id);expect(repeated.author).toBe('Agent');
    const revision=await library.publish({kind:'shader',name:'Green',expression:'color * vec3f(0.2, 1.0, 0.2)'},'Agent');expect(revision.id).not.toBe(shader.id);
    const asset=await library.publish({kind:'asset',name:'Shared stone',objects:[{name:'Stone',shape:'box',position:[0,0,0],scale:[2,1,2],color:'#aabbcc',shaderId:shader.id}]},'Agent');if(asset.kind!=='asset')throw new Error();
    const objects=instantiateAsset(asset,{},'copy');await library.validateReferences(objects);
    await plots.addObjects('plot-1-1',objects,0,'Builder','Placed a shared stone');
    const world=await library.enrich(await plots.get('plot-1-1'));expect(world.objects[0].shaderId).toBe(shader.id);expect(world.shaders?.[0].expression).toBe('color * vec3f(0.5, 1.0, 0.5)');
    expect((await plots.get('plot--1--1')).objects).toHaveLength(0);
  }finally{await rm(dir,{recursive:true,force:true});}
});
