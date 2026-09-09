import { convexTest } from 'convex-test';
import { anyApi } from 'convex/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import schema from './schema';

const modules = import.meta.glob('./**/*.{ts,js}');
const gateway = 'chat-test-gateway';
beforeEach(() => vi.stubEnv('AGARTHA_CLOUD_GATEWAY_KEY', gateway));
afterEach(() => vi.unstubAllEnvs());
const headers = (token?: string) => ({ 'Content-Type': 'application/json', 'x-agartha-gateway-key': gateway, 'x-agartha-client': 'chat-test', ...(token ? { Authorization: `Bearer ${token}` } : {}) });

it('authenticates senders, ignores forged author fields, and deduplicates retries', async () => {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const token = 'a'.repeat(64);
  const registration = await t.fetch('/cloud/session', { method: 'POST', headers: headers(), body: JSON.stringify({ agentToken: token, name: 'Test agent' }) });
  const actor = await registration.json();
  const send = (value: unknown, credential?: string) => t.fetch('/cloud/chat', { method: 'POST', headers: headers(credential), body: JSON.stringify(value) });
  const body = { requestId: 'hello', text: 'Hello, world', author: 'Imposter' };
  expect((await send(body)).status).toBe(401);
  const accepted = await send(body, token);
  expect(accepted.status).toBe(200);
  const message = await accepted.json();
  expect(message).toMatchObject({ author: 'Test agent', authorId: actor.agentId, text: 'Hello, world', sequence: 1 });
  expect(await (await send(body, token)).json()).toEqual(message);
  expect((await send({ ...body, text: 'Changed' }, token)).status).toBe(409);
  expect((await send({ requestId: 'empty', text: ' ' }, token)).status).toBe(400);
  expect((await send({ requestId: 'huge', text: 'x'.repeat(2001) }, token)).status).toBe(400);
  const page = await (await t.fetch('/cloud/chat', { headers: headers() })).json();
  expect(page.messages).toEqual([message]);
  expect(JSON.stringify(page)).not.toContain(token);
  expect(JSON.stringify(page)).not.toContain('requestId');
  await t.run(async ctx => { const session = await ctx.db.query('cloudSessions').first(); await ctx.db.patch(session!._id, { revoked: true }); });
  expect((await send({ requestId: 'revoked', text: 'Cannot send' }, token)).status).toBe(401);
});

it('orders and paginates public history for initial, catch-up, and older reads', async () => {
  const t = convexTest({ schema, modules });
  await t.run(async ctx => {
    for (let sequence = 1; sequence <= 205; sequence++) await ctx.db.insert('agentChatMessages', { id: `chat-${sequence}`, sequence, requestId: `req-${sequence}`, author: 'Fixture', authorId: 'fixture', text: `Message ${sequence}`, createdAt: 1 });
  });
  const latest = await t.query(anyApi.cloud.chat.feed, {});
  expect(latest.messages).toHaveLength(100);
  expect(latest.messages[0].sequence).toBe(106);
  const older = await t.query(anyApi.cloud.chat.feed, { before: 106 });
  expect(older.messages[0].sequence).toBe(6);
  const catchup = await t.query(anyApi.cloud.chat.feed, { after: 0 });
  expect(catchup.messages[0].sequence).toBe(1);
  expect(catchup.cursor).toBe(100);
  expect((await t.query(anyApi.cloud.chat.feed, { after: 205 })).messages).toEqual([]);
  expect((await t.fetch('/cloud/chat?after=-1', { headers: headers() })).status).toBe(400);
});

it('limits new sends but permits an identical retry at the limit', async () => {
  const t = convexTest({ schema, modules });
  const token = 'b'.repeat(64);
  await t.mutation(anyApi.cloud.session.register, { token, name: 'Limited agent', ipHash: 'fixture' });
  for (let i = 0; i < 20; i++) await t.mutation(anyApi.cloud.chat.send, { token, requestId: `m-${i}`, text: 'Hello' });
  await expect(t.mutation(anyApi.cloud.chat.send, { token, requestId: 'm-20', text: 'More' })).rejects.toThrow(/limit/i);
  expect((await t.mutation(anyApi.cloud.chat.send, { token, requestId: 'm-0', text: 'Hello' })).sequence).toBe(1);
});

it('authenticates room presence and derives message location from the sender', async () => {
  const t = convexTest({ schema, modules });
  const token = 'c'.repeat(64);
  const actor = await t.mutation(anyApi.cloud.session.register, { token, name: 'Moss', ipHash: 'fixture' });
  const enter = (body: unknown, credential?: string) => t.fetch('/cloud/chat/presence', { method: 'POST', headers: headers(credential), body: JSON.stringify(body) });
  expect((await enter({ plotId: 'plot-1-1' })).status).toBe(401);
  expect((await enter({ plotId: 'plot-1-1', position: [0, 2], author: 'Fake', agentId: 'fake' }, token)).status).toBe(200);
  const page = await t.query(anyApi.cloud.presence.feed, { now: Date.now() });
  expect(page.agents[0]).toMatchObject({ agentId: actor.agentId, name: 'Moss', plotId: 'plot-1-1' });
  expect(JSON.stringify(page)).not.toContain(token);
  const sent = await t.mutation(anyApi.cloud.chat.send, { token, requestId: 'spatial', text: 'Hello there', recipientId: 'fern' });
  expect(sent).toMatchObject({ authorId: actor.agentId, plotId: 'plot-1-1', recipientId: 'fern' });
  await t.mutation(anyApi.cloud.presence.update, { token, plotId: 'plot-2-2' });
  expect(await t.mutation(anyApi.cloud.chat.send, { token, requestId: 'spatial', text: 'Hello there', recipientId: 'fern' })).toEqual(sent);
  await expect(t.mutation(anyApi.cloud.chat.send, { token, requestId: 'spatial', text: 'Hello there', recipientId: 'other' })).rejects.toThrow(/requestId/);
  await t.run(async ctx => { const row = await ctx.db.query('agentRoomPresence').first(); await ctx.db.patch(row!._id, { expiresAt: Date.now() - 1 }); });
  expect((await t.query(anyApi.cloud.presence.feed, { now: Date.now() })).agents).toEqual([]);
  expect((await t.mutation(anyApi.cloud.chat.send, { token, requestId: 'expired', text: 'Away' })).plotId).toBeUndefined();
  await t.mutation(anyApi.cloud.presence.update, { token, leave: true });
  expect(await t.run(ctx => ctx.db.query('agentRoomPresence').collect())).toEqual([]);
});
