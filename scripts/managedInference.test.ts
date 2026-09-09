import { describe, it, expect, vi } from 'vitest';
import { inferenceRequest, runInference } from '../packages/modeling/inference';
import type { LedgerCall } from '../packages/billing/ledgerClient';
const input = { jobId: 'job', executorId: 'executor', operationId: 'op', brief: 'A red toy chair', history: 'Begin', remainingCents: 435 };
const ledger = () => vi.fn(async (operation: string) => operation === 'claimManagedInference' ? { claimed: true } : {});
describe('managed inference budget and retry fences', () => {
  it('pins Astra and reserves a bound below the remaining allowance', () => {
    const request = inferenceRequest(input);
    expect(request.body.model).toBe('openai/gpt-6-astra');
    expect(request.maxCostCents).toBeLessThanOrEqual(435);
    expect(request.body.max_completion_tokens).toBeGreaterThanOrEqual(1024);
    expect(() => inferenceRequest({ ...input, remainingCents: 1 })).toThrow('budget');
    expect(() => inferenceRequest({ ...input, history: 'x'.repeat(8001) })).toThrow('limit');
    expect(() => inferenceRequest({ ...input, image: 'https://attacker.test/image' })).toThrow('preview');
  });
  it('never dispatches a duplicate claim', async () => {
    const call = vi.fn(async () => ({ claimed: false })); const fetcher = vi.fn();
    await expect(runInference(input, call as LedgerCall, 'key', fetcher)).rejects.toThrow('already dispatched');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('retains uncertain usage after network failure, without retrying', async () => {
    const call = ledger(); const fetcher = vi.fn().mockRejectedValue(new Error('socket gone'));
    await expect(runInference(input, call as LedgerCall, 'key', fetcher)).rejects.toThrow('uncertain');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenLastCalledWith('completeManagedInference', expect.objectContaining({ ambiguous: true }));
  });
  it('releases an explicit admission rejection without charging', async () => {
    const call = ledger();
    await expect(runInference(input, call as LedgerCall, 'key', vi.fn().mockResolvedValue(new Response('{}', { status: 402 })))).rejects.toThrow('unavailable');
    expect(call).toHaveBeenLastCalledWith('completeManagedInference', expect.objectContaining({ chargeCents: 0 }));
  });
  it('settles actual token usage before returning code', async () => {
    const call = ledger(); const step = { code: 'import bpy', summary: 'Build', done: false };
    const response = { usage: { prompt_tokens: 1000, completion_tokens: 200 }, choices: [{ message: { tool_calls: [{ function: { name: 'modeling_step', arguments: JSON.stringify(step) } }] } }] };
    expect(await runInference(input, call as LedgerCall, 'key', vi.fn().mockResolvedValue(Response.json(response)))).toEqual(step);
    expect(call).toHaveBeenLastCalledWith('completeManagedInference', expect.objectContaining({ chargeCents: 2 }));
  });
  it('does not invent usage when the provider omits accounting', async () => {
    const call = ledger();
    await expect(runInference(input, call as LedgerCall, 'key', vi.fn().mockResolvedValue(Response.json({ choices: [] })))).rejects.toThrow('reconciliation');
    expect(call).toHaveBeenLastCalledWith('completeManagedInference', expect.objectContaining({ ambiguous: true }));
  });
});
