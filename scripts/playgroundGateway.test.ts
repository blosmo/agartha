import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { playgroundRoute } from '../convex/cloud/playgroundRoutes';
import { playgroundBillingPath } from '../packages/playground/gateway';
vi.mock('../api/blender.js', () => ({ default: vi.fn(async (_req, res) => { res.end(JSON.stringify({ bridged: true })); }) }));
import blenderHandler from '../api/blender';
import handler from '../api/index';
const access = 'a'.repeat(64), recovery = 'b'.repeat(64), agentId = `agent-${'c'.repeat(24)}`;
function response() {
  const headers: Record<string, unknown> = {};
  const res = { statusCode: 200, setHeader: (key: string, value: unknown) => { headers[key] = value; }, getHeader: (key: string) => headers[key], end: vi.fn(), headers };
  return res;
}
const request = (path: string, method = 'GET', body?: object, headers?: Record<string, string>) => ({ method, query: { path }, headers: { host: 'agartha.test', ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body }) as unknown as Parameters<typeof handler>[0];
beforeEach(() => { vi.stubEnv('AGARTHA_CONVEX_SITE_URL', 'https://backend.test'); vi.stubEnv('AGARTHA_CLOUD_GATEWAY_KEY', 'test-gateway'); vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture'); vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('playground hosted gateway', () => {
  it('creates a recoverable browser identity without exposing secrets in JSON', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ agentId, name: 'Maker', accessToken: access, recoveryToken: recovery, expiresAt: Date.now() + 1000, recoveryConfigured: true, recoverable: true }));
    vi.stubGlobal('fetch', fetcher);
    const res = response();
    await handler(request('session', 'POST', { name: 'Maker' }, { origin: 'https://agartha.test' }), res as unknown as ServerResponse);
    const output = res.end.mock.calls[0][0] as string;
    expect(output).toContain('Maker'); expect(output).not.toContain(access); expect(output).not.toContain(recovery);
    expect(res.headers['Set-Cookie']).toEqual(expect.arrayContaining([expect.stringContaining('__Host-agartha_session='), expect.stringContaining('__Host-agartha_recovery=')]));
    expect(String(fetcher.mock.calls[0][0])).toContain('/cloud/session/browser');
  });
  it('keeps anonymous discovery public and derives payment mode from the server', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ page: [], continueCursor: null })); vi.stubGlobal('fetch', fetcher);
    const res = response();
    await handler(request('playground/projects', 'GET', undefined, { 'x-agartha-payment-mode': 'live' }), res as unknown as ServerResponse);
    const sent = fetcher.mock.calls[0][1] as RequestInit;
    expect(sent.headers).toMatchObject({ 'x-agartha-payment-mode': 'test' });
    expect((sent.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(res.statusCode).toBe(200);
  });
  it('rejects cross-origin cookie spending before forwarding', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher); const res = response();
    await handler(request('playground/credits', 'POST', { amountCents: 500 }, { origin: 'https://other.test', cookie: `__Host-agartha_session=${access}` }), res as unknown as ServerResponse);
    expect(res.statusCode).toBe(403); expect(fetcher).not.toHaveBeenCalled(); expect(blenderHandler).not.toHaveBeenCalled();
  });
  it('bridges same-owner browser credits without putting the credential in a URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ agentId, name: 'Maker', accessToken: access, recoveryToken: recovery, expiresAt: Date.now() + 1000, recoveryConfigured: true, recoverable: true })));
    const res = response();
    await handler(request('playground/credits', 'POST', { amountCents: 500, requestId: 'buy', purchaseId: 'buy', paymentRail: 'checkout' }, { origin: 'https://agartha.test', cookie: `__Host-agartha_session=${access}` }), res as unknown as ServerResponse);
    const forwarded = vi.mocked(blenderHandler).mock.calls[0][0];
    expect(forwarded.query?.path).toBe('purchases'); expect(forwarded.headers.authorization).toBe(`Bearer ${access}`);
    expect(JSON.stringify(forwarded.query)).not.toContain(access);
  });
  it('checks compute availability before reserving and retains job identity after an uncertain dispatch', async () => {
    vi.stubEnv('AGARTHA_MANAGED_MODELING_ENABLED', 'false'); vi.stubEnv('AGARTHA_MANAGED_MODELING_OPERATOR_AGENT_ID', '');
    const fetcher = vi.fn(async (url: URL | string) => String(url).includes('/cloud/') ? Response.json({ projectId: 'project-one', jobId: 'job-one', status: 'building' }) : Response.json({ error: 'Unavailable' }, { status: 503 })); vi.stubGlobal('fetch', fetcher);
    const req = request('playground/projects/project-one/funding/start', 'POST', { requestId: 'same-start' }, { authorization: `Bearer ${access}` });
    const disabled = response(); await handler(req, disabled as unknown as ServerResponse); expect(disabled.statusCode).toBe(503); expect(fetcher).not.toHaveBeenCalled();
    vi.stubEnv('AGARTHA_MANAGED_MODELING_ENABLED', 'true'); vi.stubEnv('AI_GATEWAY_API_KEY', 'test-only'); vi.stubEnv('AGARTHA_BLENDER_BROKER_URL', 'https://broker.test');
    const uncertain = response(); await handler(req, uncertain as unknown as ServerResponse);
    expect(uncertain.statusCode).toBe(503); expect(JSON.parse(uncertain.end.mock.calls[0][0])).toMatchObject({ jobId: 'job-one' });
    const retry = response(); await handler(req, retry as unknown as ServerResponse);
    const jobs = fetcher.mock.calls.filter(([url]) => String(url).includes('broker.test')).map(([url]) => String(url));
    expect(jobs).toEqual(['https://broker.test/jobs/job-one/start', 'https://broker.test/jobs/job-one/start']);
  });
  it('forwards reviewed funding terms and never accepts client-selected payment mode', async () => {
    const runMutation = vi.fn(async (_ref, args) => args);
    const args = await playgroundRoute({ runMutation } as never, new Request('https://backend.test/cloud/playground/projects/p/funding/back', { method: 'POST', headers: { 'x-agartha-payment-mode': 'test' } }), ['playground', 'projects', 'p', 'funding', 'back'], new URL('https://backend.test'), access, { requestId: 'back', amountCents: 10, expectedTargetCents: 200, expectedFeeCents: 20, livemode: true });
    expect(args).toMatchObject({ livemode: false, expectedTargetCents: 200, expectedFeeCents: 20, amountCents: 10 });
    expect(playgroundBillingPath('playground/jobs/job-one/artifacts/model.glb')).toBe('jobs/job-one/artifacts/model.glb');
    expect(playgroundBillingPath('playground/jobs/job-one/artifacts/../../secrets')).toBeUndefined();
  });
});
