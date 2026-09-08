import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { ModelStore } from '../apps/web/modelStore';
import { PlotStore } from '../apps/web/plotStore';
import { installStarterCatalog, STARTER_IDS, type StarterCatalog } from '../apps/web/starterCatalog';
import { glbFixture } from '../packages/protocol/src/geometry/glbFixture';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'agartha-starters-')); directories.push(directory);
  const bytes = glbFixture(json => { delete json.animations; json.accessors[0].max = [1,1,1]; });
  const view = new DataView(bytes.buffer);
  view.setFloat32(28 + view.getUint32(12, true) + 32, 1, true);
  const modelId = `model-${createHash('sha256').update(bytes).digest('hex')}`;
  const catalog: StarterCatalog = { schema: 1, models: [{ modelId, file: 'scene.glb', bytes: bytes.length, bounds: { min: [0,0,0], max: [1,1,1] }, name: 'Fixture scene', author: 'Studio' }], worlds: STARTER_IDS.map(id => ({ id, name: id, brief: 'A crafted starter.', objects: [{ id: 'scene', name: 'Starter scene', shape: 'model', modelId, position: [0,13,0], scale: [25.8,25.8,25.8], color: '#ffffff', author: 'World seed' }] })) };
  const path = join(directory, 'catalog.json'), origin = join(directory, 'world.json'), models = new ModelStore(join(directory,'models'));
  const save = () => writeFile(path,JSON.stringify(catalog));
  await writeFile(join(directory,'scene.glb'),bytes); await save();
  const store = () => new PlotStore(origin, undefined, () => installStarterCatalog(models,path));
  return { directory, path, origin, bytes, catalog, models, save, store };
}
it('installs verified offline models before all nine world writes, reuses their IDs and preserves existing files', async () => {
  const f = await fixture();
  const original = JSON.stringify({ schema:1,id:'the-commons',name:'Existing',brief:'Kept',revision:7,objects:[],events:[] });
  await writeFile(f.origin,original);
  const plots = (await f.store().neighborhood({x:0,z:0})).plots;
  expect(plots).toHaveLength(9);
  expect(await readFile(f.origin,'utf8')).toBe(original);
  expect(await f.models.content(f.catalog.models[0].modelId)).toEqual(Buffer.from(f.bytes));
  expect(plots.find(world=>world.id==='plot-1-1')?.objects[0].modelId).toBe(f.catalog.models[0].modelId);
  expect((await f.models.list()).entries).toHaveLength(1);
  const neighborFile = join(f.directory,'plots','plot-1-1.json');
  const saved = await readFile(neighborFile,'utf8');
  await f.store().get('plot-1-1');
  expect(await readFile(neighborFile,'utf8')).toBe(saved);
});
it.each(['missing catalog','missing GLB','corrupt GLB','incomplete worlds','wrong hash','wrong bounds','wrong reference','wrong footprint','path traversal'])('fails closed before any seed writes: %s', async mode => {
  const f = await fixture();
  if(mode==='missing catalog') await rm(f.path);
  if(mode==='missing GLB') await rm(join(f.directory,'scene.glb'));
  if(mode==='corrupt GLB') await writeFile(join(f.directory,'scene.glb'),'broken');
  if(mode==='incomplete worlds') { f.catalog.worlds.pop(); await f.save(); }
  if(mode==='wrong hash') { f.catalog.models[0].modelId=`model-${'0'.repeat(64)}`; await f.save(); }
  if(mode==='wrong bounds') { f.catalog.models[0].bounds.max[1]=2; await f.save(); }
  if(mode==='wrong reference') { f.catalog.worlds[8].objects[0].modelId=`model-${'0'.repeat(64)}`; await f.save(); }
  if(mode==='wrong footprint') { f.catalog.worlds[8].objects[0].scale[0]=25; await f.save(); }
  if(mode==='path traversal') { f.catalog.models[0].file='../scene.glb'; await f.save(); }
  await expect(f.store().get('the-commons')).rejects.toThrow();
  expect(await readdir(f.directory)).not.toContain('world.json');
  expect(await readdir(f.directory)).not.toContain('plots');
  expect(await readdir(f.directory)).not.toContain('models');
});
it('validates optional reusable component files even when no world places them', async () => {
  const f = await fixture();
  f.catalog.models.push({...f.catalog.models[0],modelId:`model-${'1'.repeat(64)}`,file:'component.glb'}); await f.save();
  await expect(f.store().get('the-commons')).rejects.toThrow();
  expect(await readdir(f.directory)).not.toContain('world.json');
});
it('fails before seed writes if an existing model content file is corrupt', async () => {
  const f = await fixture();
  await f.models.publish(f.bytes,{name:'Existing',author:'Other'});
  await writeFile(join(f.directory,'models',`${f.catalog.models[0].modelId}.glb`),'corrupt');
  await expect(f.store().get('the-commons')).rejects.toThrow('installed model differs');
  expect(await readdir(f.directory)).not.toContain('world.json');
});

it('installs an optional component for reuse without placing it in the worlds', async () => {
  const f = await fixture();
  const component = glbFixture(json => { delete json.animations; json.asset.generator='Component'; json.accessors[0].max=[1,1,1]; });
  const view = new DataView(component.buffer);
  view.setFloat32(28 + view.getUint32(12,true) + 32,1,true);
  const modelId=`model-${createHash('sha256').update(component).digest('hex')}`;
  f.catalog.models.push({...f.catalog.models[0],modelId,file:'component.glb',bytes:component.length});
  await writeFile(join(f.directory,'component.glb'),component); await f.save();
  const worlds = await installStarterCatalog(f.models,f.path);
  expect((await f.models.list()).entries).toHaveLength(2);
  expect(await f.models.content(modelId)).toEqual(Buffer.from(component));
  expect(worlds.every(world=>world.objects.every(object=>object.modelId!==modelId))).toBe(true);
});
