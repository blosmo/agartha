import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, it, vi } from 'vitest';
import type { ChatPage } from '../packages/protocol/src/chat';

const fake = vi.hoisted(() => ({
  latest: undefined as undefined | {
    update: (page: ChatPage) => void;
    connection: (state: { isWebSocketConnected: boolean; hasEverConnected: boolean; connectionRetries: number }) => void;
    queries: unknown[];
    closed: boolean;
    url: string;
  },
}));
vi.mock('convex/browser', () => ({ ConvexClient: class {
  queries: unknown[] = []; closed = false;
  update = (_page: ChatPage) => {};
  connection = (_state: { isWebSocketConnected: boolean; hasEverConnected: boolean; connectionRetries: number }) => {};
  constructor(public url: string) { fake.latest = this; }
  onUpdate(_query: unknown, args: unknown, update: (page: ChatPage) => void) { this.queries.push(args); this.update = update; return () => {}; }
  subscribeToConnectionState(callback: typeof this.connection) { this.connection = callback; return () => {}; }
  async close() { this.closed = true; }
} }));
import { hostedChatStream } from '../apps/web/hostedChatStream';
afterEach(() => vi.unstubAllEnvs());

it('subscribes with the resume cursor, forwards updates, and cleans up on disconnect', async () => {
  vi.stubEnv('AGARTHA_CONVEX_URL', 'https://fixture.convex.cloud');
  const server = createServer((req, res) => { void hostedChatStream(req, res, new URL(req.url!, 'http://localhost'), 'https://fixture.convex.site'); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const abort = new AbortController();
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/?after=0`, { headers: { 'Last-Event-ID': '8' }, signal: abort.signal });
    expect(fake.latest?.url).toBe('https://fixture.convex.cloud');
    expect(fake.latest?.queries[0]).toEqual({ after: 8 });
    fake.latest!.update({ messages: [{ id: 'chat-9', sequence: 9, author: 'Fixture', authorId: 'fixture', text: 'Live update', createdAt: 1 }], cursor: 9, hasOlder: true });
    const reader = response.body!.getReader(); let text = '';
    while (!text.includes('Live update')) { const chunk = await reader.read(); text += new TextDecoder().decode(chunk.value); }
    expect(text).toContain('id: 9\ndata:');
    await vi.waitFor(() => expect(fake.latest?.queries.at(-1)).toEqual({ after: 9 }));
    fake.latest!.connection({ isWebSocketConnected: false, hasEverConnected: true, connectionRetries: 1 });
    while (true) { const chunk = await reader.read(); if (chunk.done) break; text += new TextDecoder().decode(chunk.value); }
    expect(text).toContain('event: chat-error');
    await vi.waitFor(() => expect(fake.latest?.closed).toBe(true));
  } finally { abort.abort(); await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); }
}, 10_000);

it('pins an initially empty stream to cursor zero before later messages arrive', async () => {
  vi.stubEnv('AGARTHA_CONVEX_URL', 'https://fixture.convex.cloud');
  const server = createServer((req, res) => { void hostedChatStream(req, res, new URL(req.url!, 'http://localhost'), 'https://fixture.convex.site'); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const abort = new AbortController();
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`, { signal: abort.signal });
    expect(fake.latest?.queries[0]).toEqual({});
    fake.latest!.update({ messages: [], cursor: 0, hasOlder: false });
    const reader = response.body!.getReader(); let text = '';
    while (!text.includes('event: ready')) { const chunk = await reader.read(); text += new TextDecoder().decode(chunk.value); }
    expect(text).toContain('id: 0\nevent: ready');
    await vi.waitFor(() => expect(fake.latest?.queries.at(-1)).toEqual({ after: 0 }));
  } finally { abort.abort(); await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); }
});
