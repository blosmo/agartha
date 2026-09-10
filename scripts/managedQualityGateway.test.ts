import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ row: {} as Record<string, unknown>, ledger: vi.fn() }));
vi.mock('../packages/billing/ledgerClient', async importOriginal => ({ ...await importOriginal<typeof import('../packages/billing/ledgerClient')>(), createLedgerClient: () => state.ledger }));
vi.mock('../packages/billing/http', async importOriginal => ({ ...await importOriginal<typeof import('../packages/billing/http')>(), paymentEnvironment: () => ({ ledger: state.ledger }) }));
import { managedInference } from '../packages/modeling/http';
import { QUALITY_CRITERIA, STRATEGY_MAX_BYTES } from '../packages/modeling/quality';
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
  it('returns maximum structured strategies after settling known usage, including non-ASCII', async () => {
    for (const character of ['x', '形', '🦣', '\u0001']) {
      const maximum = { subjectClass: character.repeat(32), styleUse: character.repeat(140), geometryApproach: character.repeat(300), proportions: Array(3).fill(character.repeat(120)), stages: Array(5).fill(character.repeat(120)), acceptanceChecks: Object.fromEntries(QUALITY_CRITERIA.map(key => [key, character.repeat(100)])) };
      const fetcher = vi.fn().mockResolvedValue(Response.json({ usage: { prompt_tokens: 2000, completion_tokens: 2200 }, choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ function: { name: 'modeling_strategy', arguments: JSON.stringify(maximum) } }] } }] }));
      vi.stubGlobal('fetch', fetcher); const res = response();
      await managedInference(request() as any, res as any);
      expect(Buffer.byteLength(JSON.stringify(maximum))).toBeLessThanOrEqual(STRATEGY_MAX_BYTES);
      expect(JSON.parse(res.end.mock.calls[0][0])).toEqual({ model: 'openai/gpt-6-astra', strategy: maximum });
      expect(JSON.parse(fetcher.mock.calls[0][1].body).parallel_tool_calls).toBe(false);
      expect(state.ledger).toHaveBeenLastCalledWith('completeManagedInference', expect.objectContaining({ chargeCents: 13 }));
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it('rejects malformed paid responses with stable bounded details and never retries', async () => {
    const call = (argumentsValue: string, name = 'modeling_strategy') => ({ function: { name, arguments: argumentsValue } });
    const validCall = call(JSON.stringify(strategy));
    const cases = [
      { calls: [], code: 'quality_tool_count', detail: 'tools=0' },
      { calls: [validCall, validCall], code: 'quality_tool_count', detail: 'tools=2' },
      { calls: [call('{secret-provider-body')], code: 'inference_arguments_json', detail: 'tools=1' },
      { calls: [call(JSON.stringify(strategy), 'secret-provider-tool')], code: 'quality_tool_name', detail: 'tools=1' },
      { calls: [call(JSON.stringify({ ...strategy, geometryApproach: 'secret-provider-text'.repeat(30) }))], code: 'quality_text_bound', detail: 'field=strategy.geometryApproach' },
      { calls: [call(JSON.stringify({ ...strategy, stages: [] }))], code: 'quality_array_bound', detail: 'items=0; min=3; max=5' },
      { calls: [call(JSON.stringify({ ...strategy, 'secret-provider-key': 'secret-provider-value' }))], code: 'quality_fields_invalid', detail: 'actual_fields=7' },
    ];
    for (const example of cases) {
      const fetcher = vi.fn().mockResolvedValue(Response.json({ usage: { prompt_tokens: 2000, completion_tokens: 2200 }, choices: [{ finish_reason: 'secret-provider-finish', message: { tool_calls: example.calls } }] }));
      vi.stubGlobal('fetch', fetcher); const res = response();
      const error = await managedInference(request() as any, res as any).catch(error => error);
      expect(error).toMatchObject({ status: 502, code: example.code });
      expect(error.message).toContain(example.detail);
      expect(error.message).toContain('finish=unknown');
      expect(error.message).not.toContain('secret-provider');
      expect(error.message.length).toBeLessThan(300);
      expect(state.ledger).toHaveBeenLastCalledWith('completeManagedInference', expect.objectContaining({ chargeCents: 13 }));
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(res.end).not.toHaveBeenCalled();
    }
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
