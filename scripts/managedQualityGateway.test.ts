import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ row: {} as Record<string, unknown>, ledger: vi.fn() }));
vi.mock('../packages/billing/ledgerClient', async importOriginal => ({ ...await importOriginal<typeof import('../packages/billing/ledgerClient')>(), createLedgerClient: () => state.ledger }));
vi.mock('../packages/billing/http', async importOriginal => ({ ...await importOriginal<typeof import('../packages/billing/http')>(), paymentEnvironment: () => ({ ledger: state.ledger }) }));
import { managedInference } from '../packages/modeling/http';
import { QUALITY_CRITERIA } from '../packages/modeling/quality';
const evidence = 'The front and right views show coherent anatomical proportions and a continuous silhouette.';
const strategy = { subjectClass: 'organic', styleUse: evidence, geometryApproach: evidence, proportions: [evidence], stages: [evidence, evidence, evidence], acceptanceChecks: Object.fromEntries(QUALITY_CRITERIA.map(key => [key, evidence])) };
const body = { jobId: 'job', executorId: 'worker', operationId: 'worker-strategy', protocol: 3, kind: 'strategy', images: [], brief: 'Injected client brief' };
const response = () => ({ setHeader: vi.fn(), end: vi.fn(), statusCode: 0 });
const request = (value = body) => ({ method: 'POST', headers: { 'x-agartha-broker-key': 'x'.repeat(32) }, body: value });
beforeEach(() => {
  vi.stubEnv('AGARTHA_MANAGED_MODELING_ENABLED', 'true'); vi.stubEnv('AI_GATEWAY_API_KEY', 'fixture');
  state.row = { workflowVersion: 3, referenceMode: 'none', brief: 'Persisted customer elephant brief', reservedAiCents: 335, chargedAiCents: 0, pendingAiCents: 0 };
  state.ledger.mockReset().mockImplementation(async (operation: string) => operation === 'getManagedJobForBroker' ? state.row : operation === 'claimManagedInference' ? { claimed: true } : {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('persisted managed quality gateway protocol', () => {
  it('routes v3 planning through the service provider using only the persisted brief', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ usage: { prompt_tokens: 1000, completion_tokens: 200 }, choices: [{ message: { tool_calls: [{ function: { name: 'modeling_strategy', arguments: JSON.stringify(strategy) } }] } }] }));
    vi.stubGlobal('fetch', fetcher); const res = response();
    await managedInference(request({ ...body, providerUrl: 'https://untrusted.test', history: 'Modeler claims perfect' } as any) as any, res as any);
    expect(res.statusCode).toBe(200);
    expect(fetcher.mock.calls[0][0]).toBe('https://ai-gateway.vercel.sh/v1/chat/completions');
    expect(fetcher.mock.calls[0][1].body).toContain(state.row.brief);
    expect(fetcher.mock.calls[0][1].body).not.toContain(body.brief);
    expect(fetcher.mock.calls[0][1].body).not.toContain('Modeler claims perfect');
    expect(JSON.parse(res.end.mock.calls[0][0])).toEqual({ model: 'openai/gpt-6-astra', strategy });
  });
  it('rejects v3 downgrades and legacy upgrades before provider dispatch', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    for (const [version, protocol] of [[3, 2], [3, undefined], [undefined, 3], [2, 3], [3, 4]]) {
      state.row.workflowVersion = version;
      await expect(managedInference(request({ ...body, protocol } as any) as any, response() as any)).rejects.toThrow(/protocol/i);
    }
    expect(fetcher).not.toHaveBeenCalled();
    expect(state.ledger.mock.calls.some(([name]) => name === 'claimManagedInference')).toBe(false);
  });
  it('preserves protocol 2 reference jobs and forbids references for explicit none', async () => {
    state.row.workflowVersion = undefined; state.row.referenceMode = 'generate';
    await expect(managedInference(request({ ...body, protocol: 2 } as any) as any, response() as any)).rejects.toThrow('Unknown modeling');
    state.row.workflowVersion = 3; state.row.referenceMode = 'none';
    await expect(managedInference(request({ ...body, kind: 'reference', operationId: 'worker-reference' }) as any, response() as any)).rejects.toThrow('reference operation');
  });
  it('identifies only pre-dispatch modeling budget rejection for service final review', async () => {
    state.row.reservedAiCents = 110;
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher); const res = response();
    await managedInference(request({ ...body, kind: 'modeling', strategy, history: 'Begin', images: [] } as any) as any, res as any);
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.end.mock.calls[0][0]).code).toBe('quality_review_reserved');
    expect(fetcher).not.toHaveBeenCalled();
    expect(state.ledger.mock.calls.some(([name]) => name === 'claimManagedInference')).toBe(false);
  });
});
