import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createServer } from 'vite';
import { expect, it } from 'vitest';
import { worldSpacePlugin } from '../apps/web/worldServer';
import { crewContribution } from '../apps/web/src/worlds/world';

it('serializes competing clients, rejects bad origins, and preserves accepted edits across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agartha-world-test-'));
  const open = async () => {
    const server = await createServer({ configFile: false, root: directory, plugins: [worldSpacePlugin(join(directory, 'world.json'))], server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
    await server.listen();
    const url = `http://127.0.0.1:${(server.httpServer!.address() as AddressInfo).port}/api/world`;
    return { server, url };
  };
  let running = await open();
  try {
    const world = await (await fetch(running.url)).json();
    const post = (body: unknown, origin?: string) => fetch(running.url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
    const edits = [crewContribution(world, 0), crewContribution(world, 1)];
    const results = await Promise.all(edits.map(edit => post(edit)));
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    const accepted = await results.find(r => r.ok)!.json();
    expect(accepted.revision).toBe(1);
    expect((await post(crewContribution(accepted, 2), 'https://untrusted.example')).status).toBe(403);
    const invalid = crewContribution(accepted, 2);
    invalid.objects![0].scale = [-1,1,1];
    expect((await post(invalid)).status).toBe(400);
    expect(await (await fetch(running.url)).json()).toEqual(accepted);
    await running.server.close();
    running = await open();
    expect(await (await fetch(running.url)).json()).toEqual(accepted);
    expect((await post(crewContribution(accepted, 2))).status).toBe(200);
  } finally {
    await running.server.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 15000);
