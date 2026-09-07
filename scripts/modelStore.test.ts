import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {ModelStore} from '../apps/web/modelStore';
import {glbFixture} from '../packages/protocol/src/geometry/glbFixture';
it('stores original GLB bytes once and lists compact material/animation metadata',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'agartha-model-'));try{
  const store=new ModelStore(dir),bytes=glbFixture();const first=await store.publish(bytes,{name:'Animated triangle',author:'Builder'});
  const again=await store.publish(bytes,{name:'Another name',author:'Other'});expect(again.id).toBe(first.id);expect(again.name).toBe(first.name);
  expect(new Uint8Array(await store.content(first.id))).toEqual(bytes);expect(first.inspection.animations[0].duration).toBe(2);
  expect((await store.list()).entries).toHaveLength(1);expect(JSON.stringify(first)).not.toContain('bufferViews');
  await expect(store.get('../private')).rejects.toThrow('Invalid model');
 }finally{await rm(dir,{recursive:true,force:true});}
});
it('inspects the real Fox fixture with all three skinned animation clips',async()=>{const {readFile}=await import('node:fs/promises');const {inspectGlb}=await import('../packages/protocol/src/geometry/inspectGlb');const result=inspectGlb(await readFile(new URL('./fixtures/Fox.glb',import.meta.url)));expect(result.skins).toBe(1);expect(result.images).toHaveLength(1);expect(result.animations.map(clip=>clip.name)).toEqual(['Survey','Walk','Run']);expect(result.triangles).toBe(576);});
