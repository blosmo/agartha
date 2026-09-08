import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { STARTER_BASELINE } from '../../convex/cloud/starterBaseline';
import type { StarterCatalog } from '../../apps/web/starterCatalog';

const { values } = parseArgs({ options: {
  apply: { type: 'boolean', default: false }, catalog: { type: 'string' },
  server: { type: 'string', default: 'https://agartha-dusky.vercel.app' },
  'deployment-dir': { type: 'string' }, output: { type: 'string' },
} });
const catalog = JSON.parse(await readFile(resolve(values.catalog ?? 'apps/web/public/starter-assets/catalog.json'), 'utf8')) as StarterCatalog;
const catalogId = 'starter-worlds-20260908-v1';
const payloads = catalog.worlds.map(world => {
  const baseline = STARTER_BASELINE[world.id];
  if (!baseline) throw new Error('Only captured starter IDs are eligible.');
  return { id: world.id, expectedVersion: baseline.version, catalogId, brief: world.brief,
    objects: world.objects.map(({ author, owner, ...object }) => object) };
});
const output = resolve(values.output ?? '.agartha/starter-rollout.json');
await mkdir(dirname(output), { recursive: true });
const evidence: { catalogId: string; payloads: typeof payloads; applied: Array<{ id: string; version: string; objects: number }> } = { catalogId, payloads, applied: [] };
await writeFile(output, JSON.stringify(evidence, null, 2) + '\n');
if (!values.apply) console.log(JSON.stringify({ status: 'planned', worlds: payloads.map(p => p.id), output }));
else for (const payload of payloads) {
  const result = spawnSync('npx', ['convex', 'run', '--prod', 'cloud/starterWorlds:upgrade', JSON.stringify(payload)], {
    cwd: resolve(values['deployment-dir'] ?? '.'), encoding: 'utf8', timeout: 60_000,
  });
  if (result.status !== 0) throw new Error(`Starter upgrade stopped at ${payload.id}: ${result.stderr.slice(-1500)}`);
  const response = await fetch(new URL(`/api/plots/${payload.id}`, values.server), { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error('Cannot verify the saved starter.');
  const saved = await response.json();
  if (saved.objects.length !== payload.objects.length || payload.objects.some(object => !saved.objects.some((candidate: { id: string; modelId?: string }) => candidate.id === object.id && candidate.modelId === object.modelId))) throw new Error('Saved starter does not match the reviewed catalog.');
  evidence.applied.push({ id: payload.id, version: saved.version, objects: saved.objects.length });
  await writeFile(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence.applied.at(-1)));
}
