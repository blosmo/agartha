import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { ChatStore } from '../apps/web/chatStore';
import { PresenceStore } from '../apps/web/presenceStore';
import { PRESENCE_TTL_MS } from '../packages/protocol/src/agentPresence';
const dirs: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
async function store() { const dir = await mkdtemp(join(tmpdir(), 'agartha-presence-')); dirs.push(dir); return new ChatStore(join(dir, 'chat.json')); }
it('keeps one room per agent, expires presence, and removes an explicit departure', async () => {
  const chat = await store();
  let now = 1000; vi.spyOn(Date, 'now').mockImplementation(() => now);
  const first = await chat.presence.update({ author: 'Moss', plotId: 'plot-1-1', position: [2, 4] });
  await chat.presence.update({ author: 'Moss', plotId: 'plot-2-1', position: [-2, 4] });
  expect((await chat.presence.list()).agents).toHaveLength(1);
  expect((await chat.presence.list()).agents[0]).toMatchObject({ agentId: first.agent!.agentId, plotId: 'plot-2-1' });
  now += PRESENCE_TTL_MS;
  expect((await chat.presence.list()).agents).toEqual([]);
  await chat.presence.update({ author: 'Moss', plotId: 'plot-1-1' });
  await chat.presence.update({ author: 'Moss', leave: true });
  expect((await chat.presence.list()).agents).toEqual([]);
});
it('snapshots the speaking room, addresses a recipient, and protects retry semantics after moving', async () => {
  const chat = await store();
  await chat.presence.update({ author: 'Moss', plotId: 'plot-1-1' });
  const input = { author: 'Moss', requestId: 'hello', text: 'Hi!', recipientId: 'other-agent' };
  const message = await chat.send(input);
  expect(message).toMatchObject({ plotId: 'plot-1-1', recipientId: 'other-agent' });
  await chat.presence.update({ author: 'Moss', plotId: 'plot-2-2' });
  expect(await chat.send(input)).toEqual(message);
  await expect(chat.send({ ...input, recipientId: 'someone-else' })).rejects.toThrow(/requestId/);
});
it('serializes separate local writers and rejects invalid transforms', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agartha-presence-')); dirs.push(dir);
  const a = new PresenceStore(join(dir, 'presence.json')), b = new PresenceStore(join(dir, 'presence.json'));
  await Promise.all([a.update({ author: 'A', plotId: 'the-commons' }), b.update({ author: 'B', plotId: 'the-commons' })]);
  expect((await a.list()).agents).toHaveLength(2);
  await expect(a.update({ author: 'A', plotId: '../secret' })).rejects.toThrow(/plotId/);
  await expect(a.update({ author: 'A', plotId: 'the-commons', position: [NaN, 0] })).rejects.toThrow(/position/);
  await expect(a.update({ author: 'A', plotId: 'the-commons', position: [0, 20] })).rejects.toThrow(/position/);
});
