import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { convexTest } from 'convex-test';
import { anyApi } from 'convex/server';
import { afterEach, expect, it, vi } from 'vitest';
import schema from './schema';

const modules = import.meta.glob('./**/*.{ts,js}');
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it('runs the Python broker through real Convex HTTP funding, reservation, checkpoint, settlement and resume', async () => {
  vi.stubEnv('AGARTHA_BILLING_GATEWAY_KEY', 'fixture-gateway');
  vi.stubEnv('AGARTHA_BILLING_BROKER_KEY', 'fixture-broker');
  vi.stubEnv('BLENDER_BILLING_ACTIVE', 'true');
  const t = convexTest({ schema, modules, transactionLimits: true });
  const realNow = Date.now.bind(Date);
  let clockOffsetMs = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => realNow() + clockOffsetMs);
  const token = 'a'.repeat(64);
  const actor = await t.mutation(anyApi.cloud.session.register, { token, name: 'Paid flow test', ipHash: 'paid-flow' });
  vi.stubEnv('BLENDER_TEST_OPERATOR_AGENT_IDS', actor.agentId);
  await t.mutation(anyApi.cloud.purchases.createPurchase, { token, purchaseId: 'flow-funding', amountCents: 500, livemode: false, paymentRail: 'mpp', requestId: 'flow-funding' });
  const { generation } = await t.mutation(anyApi.cloud.purchases.beginPaymentReconciliation, { paymentId: 'pi_flow', eventId: 'flow-verified' });
  await t.mutation(anyApi.cloud.purchases.fulfillPurchase, { purchaseId: 'flow-funding', paymentId: 'pi_flow', generation, amountCents: 500, currency: 'usd', livemode: false, paid: true, refundedCents: 0, disputedCents: 0, disputeOpen: false });
  const server = createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      if (req.method === 'POST' && req.url === '/fixture/advance-clock') {
        clockOffsetMs += 61_000;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ offsetSeconds: clockOffsetMs / 1000 }));
        return;
      }
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) if (typeof value === 'string') headers[key] = value;
      const response = await t.fetch(req.url!, { method: req.method, headers, body: Buffer.concat(chunks) });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.writeHead(500); res.end(); }
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test server address');
    const { stdout } = await promisify(execFile)('python3', ['-m', 'cloud.blender_billing.verify_local'], { env: { ...process.env, BILLING_FIXTURE_URL: `http://127.0.0.1:${address.port}` }, timeout: 30_000 });
    expect(JSON.parse(stdout)).toMatchObject({ simulatedProvider: true, checkpointRestored: true, chargedCents: 80, allWorkersStopped: true });
    expect(await t.query(anyApi.cloud.purchases.balance, { token, livemode: false })).toMatchObject({ availableCents: 420, heldCents: 0 });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}, 40_000);
