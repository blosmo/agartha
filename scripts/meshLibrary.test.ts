import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {LibraryStore} from '../apps/web/libraryStore';
import {createWorld,applyWorldEdit} from '../apps/web/src/worlds/world';
import {instantiateAsset} from '../packages/protocol/src/sharedLibrary';
it('publishes, reuses and enriches meshes without putting vertex arrays in polling snapshots',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'agartha-mesh-'));const store=new LibraryStore(dir);
 try{
  const mesh=await store.publish({kind:'mesh',name:'Folded sheet',obj:'v 0 0 0\nv 2 0 0\nv 0 2 0\nf 1 2 3'},'Builder');expect(mesh.kind).toBe('mesh');
  const objects=[{id:'sheet',name:'Folded sheet',shape:'mesh' as const,meshId:mesh.id,position:[0,2,0],scale:[2,2,.1],color:'#ffffff'}];
  await store.validateReferences(objects);
  const asset=await store.publish({kind:'asset',name:'Sheet assembly',objects},'Builder');if(asset.kind!=='asset')throw new Error('Expected asset');expect(instantiateAsset(asset,{},'copy')[0].meshId).toBe(mesh.id);
  const world=applyWorldEdit(createWorld(),{baseRevision:0,author:'Builder',message:'Place mesh',objects});
  expect((await store.enrich(world)).meshes).toBeUndefined();
  expect((await store.enrich(world,true)).meshes?.[0].id).toBe(mesh.id);
  expect((await store.list('mesh')).entries[0]).not.toHaveProperty('geometry.positions');
  await expect(store.validateReferences([{meshId:`mesh-${'f'.repeat(64)}`}])).rejects.toThrow();
 }finally{await rm(dir,{recursive:true,force:true});}
});
