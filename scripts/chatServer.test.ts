import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { ChatStore } from '../apps/web/chatStore';
import { chatHandler } from '../apps/web/chatServer';

async function open(file: string) {
  const handle = chatHandler(new ChatStore(file));
  const server = createServer((req, res) => { req.url = req.url?.replace(/^\/api\/chat/, '') || '/'; void handle(req, res); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/chat` };
}
const close = (server: Server) => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
const post = (url: string, body: unknown, origin?: string) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });

async function nextMessage(reader: ReadableStreamDefaultReader<Uint8Array>) {
  let buffer = '';
  const deadline = new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new Error('Timed out waiting for chat')), 4000); timer.unref(); });
  return Promise.race([(async () => {
    while (true) {
      const { value, done } = await reader.read();
      if (done) throw new Error('Chat stream closed');
      buffer += new TextDecoder().decode(value);
      const event = buffer.match(/id: (\d+)\ndata: ([^\n]+)\n\n/);
      if (event) return JSON.parse(event[2]);
    }
  })(), deadline]);
}

it('delivers between two live clients, survives restart, and resumes after the last received ID', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agartha-chat-'));
  let running = await open(join(dir, 'chat.json'));
  const abort = new AbortController();
  try {
    const streamA = await fetch(`${running.url}/events?after=0`, { signal: abort.signal });
    const streamB = await fetch(`${running.url}/events?after=0`, { signal: abort.signal });
    expect(streamA.headers.get('content-type')).toBe('text/event-stream');
    const readA = nextMessage(streamA.body!.getReader()), readB = nextMessage(streamB.body!.getReader());
    const sent = await (await post(running.url, { requestId: 'first', author: 'Fixture A', text: 'Hello 🌎\nSecond line' })).json();
    expect(await readA).toEqual(sent); expect(await readB).toEqual(sent);
    expect(sent.sequence).toBe(1);
    expect(await (await post(running.url, { requestId: 'first', author: 'Fixture A', text: 'Hello 🌎\nSecond line' })).json()).toEqual(sent);
    expect((await post(running.url, { requestId: 'first', author: 'Fixture A', text: 'Different' })).status).toBe(409);
    expect((await post(running.url, { requestId: 'bad-origin', author: 'Fixture B', text: 'No' }, 'https://other.example')).status).toBe(403);
    abort.abort(); await close(running.server);
    running = await open(join(dir, 'chat.json'));
    expect((await (await fetch(running.url)).json()).messages).toEqual([sent]);
    const second = await (await post(running.url, { requestId: 'second', author: 'Fixture B', text: 'Reply' })).json();
    const resumed = await fetch(`${running.url}/events?after=0`, { headers: { 'Last-Event-ID': '1' } });
    const reader = resumed.body!.getReader();
    expect(await nextMessage(reader)).toEqual(second);
    await reader.cancel();
  } finally { abort.abort(); await close(running.server); await rm(dir, { recursive: true, force: true }); }
}, 15_000);

it('serializes two local stores sharing a file and validates public input', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agartha-chat-race-'));
  const file = join(dir, 'chat.json'), a = new ChatStore(file), b = new ChatStore(file);
  try {
    await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? a : b).send({ requestId: `r-${i}`, author: `Agent ${i}`, text: `Text ${i}` })));
    const page = await a.list(); expect(page.messages.map(m => m.sequence)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    await expect(a.send({ author: '', requestId: 'r', text: 'Hello' })).rejects.toThrow(/author/);
    await expect(a.send({ author: 'Agent', requestId: 'r', text: 'x'.repeat(2001) })).rejects.toThrow(/characters/);
    await expect(a.list({ after: -1 })).rejects.toThrow(/cursor/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it('catches up across full pages while a new message arrives', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agartha-chat-pages-'));
  const file = join(dir, 'chat.json');
  await writeFile(file, JSON.stringify({ schema: 1, messages: Array.from({ length: 205 }, (_, i) => ({ id: `chat-${i+1}`, sequence: i+1, requestId: `seed-${i}`, authorId: 'fixture', author: 'Fixture', text: `Message ${i+1}`, createdAt: 1 })) }));
  const running = await open(file), abort = new AbortController();
  try {
    const response = await fetch(`${running.url}/events?after=0`, { signal: abort.signal });
    const reader = response.body!.getReader();
    const reading = (async () => {
      let buffer = ''; const ids: number[] = []; const decoder = new TextDecoder();
      while (ids.length < 206) {
        const { value, done } = await reader.read(); if (done) throw new Error('Stream ended before catch-up');
        buffer += decoder.decode(value, { stream: true });
        let boundary;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
          const id = frame.match(/^id: (\d+)/); if (id) ids.push(Number(id[1]));
        }
      }
      return ids;
    })();
    expect((await post(running.url, { requestId: 'live', author: 'Fixture B', text: 'Live tail' })).status).toBe(200);
    expect(await reading).toEqual(Array.from({ length: 206 }, (_, i) => i+1));
    await reader.cancel();
  } finally { abort.abort(); await close(running.server); await rm(dir, { recursive: true, force: true }); }
}, 10_000);
