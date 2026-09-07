import { isDeepStrictEqual } from 'node:util';
import { addressFromId } from '../packages/protocol/src/plots';
import { INSTALLATION_SURFACES, roomInstallations } from './roomInstallations';
import type { SharedWorld } from '../apps/web/src/worlds/world';

// Explicit local authoring command; never runs on startup or writes to cloud.
const origin = 'http://127.0.0.1:5174';
async function request(path: string, body?: unknown) {
  const response = await fetch(`${origin}${path}`, {
    method: body ? 'POST' : 'GET', headers: body ? {'Content-Type':'application/json'} : undefined,
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${result.error}`);
  return result;
}
const shaders = {} as Record<keyof typeof INSTALLATION_SURFACES,string>;
for (const key of Object.keys(INSTALLATION_SURFACES) as Array<keyof typeof INSTALLATION_SURFACES>) {
  const entry = await request('/api/library',{plotId:'plot-1-1',author:'Codex',definition:INSTALLATION_SURFACES[key]});
  shaders[key] = entry.id;
}
for (const installation of roomInstallations(shaders)) {
  let world: SharedWorld;
  try { world = await request(`/api/plots/${installation.id}`); }
  catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith('404:')) throw error;
    world = await request('/api/plots',{...addressFromId(installation.id),name:installation.name,author:'Codex'});
  }
  const existing = new Map(world.objects.map(object => [object.id, object]));
  const missing = installation.objects.filter(object => {
    const stored = existing.get(object.id);
    if (!stored) return true;
    if (Object.entries(object).some(([key,value]) => !isDeepStrictEqual(stored[key as keyof typeof stored], value))) throw new Error(`Existing installation object changed: ${object.id}; leaving it intact.`);
    return false;
  });
  if (missing.length) world = await request(`/api/plots/${installation.id}`,{
    baseRevision:world.revision,author:'Codex',message:`Added ${installation.name === 'Common Future' ? 'floating jade sculptures, ripple water and breathing lanterns' : installation.name === 'Tidal Chamber' ? 'a floating moon over animated tidal rings' : 'rotating solar vanes and a breathing amber sun'}.`,objects:missing,
  });
  const check: SharedWorld = await request(`/api/plots/${installation.id}`);
  if (!installation.objects.every(object => check.objects.some(stored => stored.id === object.id && isDeepStrictEqual(stored.motion, object.motion)))) throw new Error(`Installation verification failed: ${installation.id}`);
  console.log(`${installation.name}: ${missing.length} objects added, ${check.objects.filter(object=>object.motion).length} animated, revision ${check.revision}`);
}
