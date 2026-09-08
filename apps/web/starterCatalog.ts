import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Box3, LoadingManager, Mesh } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { inspectGlb } from '../../packages/protocol/src/geometry/inspectGlb';
import { assertRoomRenderBudget, sceneCost } from '../../packages/protocol/src/geometry/sceneBudget';
import { addressFromId, PLOT_SIZE } from '../../packages/protocol/src/plots';
import { ModelStore, MODEL_ID } from './modelStore';
import { applyWorldEdit, type SharedWorld, type Vec3, type WorldObject } from './src/worlds/world';

export const STARTER_IDS = ['the-commons', 'plot-0--1', 'plot-1-0', 'plot-0-1', 'plot--1-0', 'plot--1--1', 'plot-1--1', 'plot--1-1', 'plot-1-1'] as const;
export const BUNDLED_STARTER_CATALOG = fileURLToPath(new URL('./public/starter-assets/catalog.json', import.meta.url));
export type StarterModel = {
  modelId: string; file: string; bytes: number; bounds: { min: Vec3; max: Vec3 };
  name: string; author: string; description?: string; source?: string; license?: string; attribution?: string;
};
export type StarterCatalog = {
  schema: 1;
  models: StarterModel[];
  worlds: Array<{ id: string; name: string; brief: string; objects: WorldObject[] }>;
};
function fail(message: string): never { throw new Error(`Invalid starter catalog: ${message}`); }
function text(value: unknown, max: number) { return typeof value === 'string' && value.trim().length > 0 && value.length <= max; }
function vector(value: unknown): value is Vec3 { return Array.isArray(value) && value.length === 3 && value.every(n => typeof n === 'number' && Number.isFinite(n)); }
function near(a: number, b: number) { return Math.abs(a - b) <= .001; }

/** All bytes and placements are checked before the first library or world write. No network access. */
export async function installStarterCatalog(models: ModelStore, catalogFile = BUNDLED_STARTER_CATALOG): Promise<SharedWorld[]> {
  const raw = JSON.parse(await readFile(catalogFile, 'utf8')) as StarterCatalog;
  if (!raw || raw.schema !== 1 || !Array.isArray(raw.models) || !raw.models.length || raw.models.length > 128 || !Array.isArray(raw.worlds)) fail('expected schema 1, models and worlds');
  const ids = raw.worlds.map(world => world?.id);
  if (ids.length !== STARTER_IDS.length || new Set(ids).size !== ids.length || STARTER_IDS.some(id => !ids.includes(id))) fail('all nine required starter worlds must appear exactly once');
  const verified = new Map<string, { entry: StarterModel; bytes: Buffer; inspection: ReturnType<typeof inspectGlb> }>();
  for (const entry of raw.models) {
    if (!entry || !MODEL_ID.test(entry.modelId) || verified.has(entry.modelId)) fail('invalid or duplicate model ID');
    if (typeof entry.file !== 'string' || !/^[a-zA-Z0-9_-]+\.glb$/.test(entry.file)) fail('model files must be local GLB basenames');
    if (!text(entry.name, 80) || !text(entry.author, 60)) fail('model name and author are required');
    for (const [field, max] of [['description',500],['source',2000],['license',80],['attribution',500]] as const) {
      if (entry[field] !== undefined && (typeof entry[field] !== 'string' || entry[field]!.length > max)) fail(`invalid model ${field}`);
    }
    if (!entry.bounds || !vector(entry.bounds.min) || !vector(entry.bounds.max) || entry.bounds.max.some((n,i) => n <= entry.bounds.min[i])) fail('finite nonzero source bounds are required');
    const bytes = await readFile(join(dirname(catalogFile), entry.file));
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes !== bytes.length || `model-${createHash('sha256').update(bytes).digest('hex')}` !== entry.modelId) fail(`model hash or byte count mismatch: ${entry.file}`);
    const inspection = inspectGlb(bytes);
    if (inspection.images.length || inspection.animations.length || inspection.skins || inspection.morphTargets) fail('starter assets must be static and texture-free');
    const manager = new LoadingManager();
    manager.setURLModifier(() => fail('external resources are not permitted'));
    const gltf = await new GLTFLoader(manager).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    try {
      gltf.scene.updateMatrixWorld(true);
      const bounds = new Box3().setFromObject(gltf.scene, true);
      const min = bounds.min.toArray(), max = bounds.max.toArray();
      if (bounds.isEmpty() || min.some((n,i) => !near(n, entry.bounds.min[i])) || max.some((n,i) => !near(n, entry.bounds.max[i]))) fail(`source bounds mismatch: ${entry.file}`);
    } finally {
      gltf.scene.traverse(node => { if (node instanceof Mesh) { node.geometry.dispose(); for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.dispose(); } });
    }
    verified.set(entry.modelId, { entry, bytes, inspection });
  }
  const geometry = new Map([...verified].map(([id, value]) => [id, value.inspection]));
  const worlds = raw.worlds.map(input => {
    if (!text(input.name, 80) || !text(input.brief, 1200) || !Array.isArray(input.objects) || !input.objects.length) fail('world metadata and objects are required');
    const base: SharedWorld = { schema: 1, id: input.id, name: input.name, brief: input.brief, revision: 0, placement: { ...addressFromId(input.id), size: PLOT_SIZE }, objects: [], events: [] };
    const parsed = applyWorldEdit(base, { baseRevision: 0, author: 'World seed', message: 'Installed crafted starter world.', objects: input.objects });
    const scenes = parsed.objects.filter(object => object.shape === 'model');
    if (scenes.length !== 1) fail('each world requires exactly one scene model');
    for (const object of parsed.objects) {
      if (object.shape === 'mesh' || object.shaderId || object.motion || object.animation) fail('only static models and native gateway objects are supported');
      if (object.modelId && !verified.has(object.modelId)) fail('world references an unlisted model');
    }
    const scene = scenes[0], source = verified.get(scene.modelId!)!.entry.bounds;
    const size = source.max.map((n,i) => n-source.min[i]);
    if (!near(size[0],size[2]) || !near(scene.scale[0],25.8) || !near(scene.scale[2],25.8) || !near(scene.scale[1], size[1]*25.8/size[0])) fail('scene placement must preserve source proportions in a 25.8-unit square');
    assertRoomRenderBudget(sceneCost(parsed.objects, geometry));
    return { ...parsed, revision: 0, objects: parsed.objects.map(object => ({ ...object, owner: 'platform-seed' })), events: parsed.events.map(event => ({ ...event, revision: 0 })) };
  });
  const collection = sceneCost(worlds.flatMap(world => world.objects), geometry);
  const visibleIds = new Set(worlds.flatMap(world => world.objects.flatMap(object => object.modelId ? [object.modelId] : [])));
  const visibleBytes = [...visibleIds].reduce((total,id) => total + verified.get(id)!.bytes.length, 0);
  if (collection.triangles >= 160_000 || collection.draws >= 150 || visibleBytes >= 24_000_000) fail('visible starter collection exceeds its rendering targets');
  for (const { entry, bytes } of verified.values()) {
    const installed = await models.publish(bytes, entry);
    if (installed.id !== entry.modelId || !Buffer.from(await models.content(installed.id)).equals(bytes)) fail(`installed model differs: ${entry.file}`);
  }
  return worlds;
}
