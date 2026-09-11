import { describe, it, expect, vi } from 'vitest';
import { inferenceRequest, runInference } from '../packages/modeling/inference';
import type { LedgerCall } from '../packages/billing/ledgerClient';
const input = { jobId: 'job', executorId: 'executor', operationId: 'op', brief: 'A red toy chair', history: 'Begin', remainingCents: 435 };
const ledger = () => vi.fn(async (operation: string, _args?: unknown) => operation === 'claimManagedInference' ? { claimed: true } : {});
describe('managed inference budget and retry fences', () => {
  it('pins Astra and reserves a bound below the remaining allowance', () => {
    const request = inferenceRequest(input);
    expect(request.body.model).toBe('openai/gpt-6-astra');
    expect(request.maxCostCents).toBeLessThanOrEqual(435);
    expect(request.body.max_output_tokens).toBeGreaterThanOrEqual(1024);
    expect(() => inferenceRequest({ ...input, remainingCents: 1 })).toThrow('budget');
    expect(() => inferenceRequest({ ...input, history: 'x'.repeat(8001) })).toThrow('limit');
    expect(() => inferenceRequest({ ...input, image: 'https://attacker.test/image' })).toThrow('preview');
  });
  it('uses stateless Responses tools and image parts for both legacy and studio modeling', () => {
    const image = 'data:image/jpeg;base64,AA==';
    for (const [request, name, ceiling, effort, detail] of [
      [inferenceRequest({ ...input, image }), 'modeling_step', 8192, 'medium', 'low'],
      [inferenceRequest({ ...input, protocol: 2, images: [{ label: 'render-front', image }] }), 'blender_action', 12000, 'high', 'high'],
    ] as const) {
      expect(request.body).toMatchObject({ model: 'openai/gpt-6-astra', store: false, stream: false, parallel_tool_calls: false, reasoning: { effort }, max_output_tokens: ceiling, tool_choice: { type: 'function', name } });
      expect(request.body.tools[0]).toMatchObject({ type: 'function', name, strict: false });
      expect(request.body.tools[0]).not.toHaveProperty('function');
      expect(request.body.input).toEqual([expect.objectContaining({ type: 'message', role: 'system', content: [expect.objectContaining({ type: 'input_text' })] }), expect.objectContaining({ type: 'message', role: 'user' })]);
      expect(request.body.input[1].content).toContainEqual({ type: 'input_image', image_url: image, detail });
      expect(request.body.input[1].content).toContainEqual(expect.objectContaining({ type: 'input_text' }));
      for (const obsolete of ['messages', 'max_completion_tokens', 'reasoning_effort', 'previous_response_id']) expect(request.body).not.toHaveProperty(obsolete);
    }
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
  it.each([[400, 'inference_provider_rejected', { chargeCents: 0 }], [402, 'inference_provider_rejected', { chargeCents: 0 }], [500, 'inference_provider_uncertain', { ambiguous: true }]])('reports provider HTTP %s without exposing its body or retrying', async (status, code, settlement) => {
    const call = ledger();
    const fetcher = vi.fn().mockResolvedValue(new Response('private-provider-body', { status }));
    const error = await runInference(input, call as LedgerCall, 'key', fetcher).catch(error => error);
    expect(error).toMatchObject({ status: 503, code });
    expect(error.message).toContain(`provider_status=${status}`);
    expect(error.message).not.toContain('private-provider');
    expect(call).toHaveBeenLastCalledWith('completeManagedInference', expect.objectContaining(settlement));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('preserves the protocol 2 Blender action shape and untyped ledger claim', async () => {
    const action = { action: 'inspect_scene', code: '', objectName: '', views: [], summary: 'Inspect the scene.', critique: 'No render supplied yet.' };
    const call = ledger();
    const fetcher = vi.fn().mockResolvedValue(Response.json({ status: 'completed', usage: { input_tokens: 1000, output_tokens: 200 }, output: [{ type: 'function_call', name: 'blender_action', arguments: JSON.stringify(action), status: 'completed' }] }));
    expect(await runInference({ ...input, protocol: 2, images: [] }, call as LedgerCall, 'key', fetcher)).toEqual(action);
    expect(call.mock.calls[0][1]).not.toHaveProperty('kind');
  });
  it('settles actual token usage before returning code', async () => {
    const call = ledger(); const step = { code: 'import bpy', summary: 'Build', done: false };
    const response = { usage: { input_tokens: 1000, output_tokens: 200, output_tokens_details: { reasoning_tokens: 160 } }, status: 'completed', output: [{ type: 'reasoning', id: 'rs_fixture', summary: [], encrypted_content: 'opaque-private-reasoning' }, { type: 'function_call', id: 'fc_fixture', call_id: 'call_fixture', status: 'completed', name: 'modeling_step', arguments: JSON.stringify(step) }] };
    const fetcher = vi.fn().mockResolvedValue(Response.json(response));
    expect(await runInference(input, call as LedgerCall, 'key', fetcher)).toEqual(step);
    expect(fetcher).toHaveBeenCalledWith('https://ai-gateway.vercel.sh/v1/responses', expect.objectContaining({ headers: { authorization: 'Bearer key', 'content-type': 'application/json' } }));
    expect(call).toHaveBeenLastCalledWith('completeManagedInference', expect.objectContaining({ chargeCents: 2 }));
    expect(call.mock.calls.filter(([operation]) => operation === 'completeManagedInference')).toHaveLength(1);
    expect(JSON.stringify(call.mock.calls)).not.toContain('opaque-private-reasoning');
  });
  it.each([
    ['incomplete', { reason: 'max_output_tokens' }, 'inference_incomplete', 'max_output_tokens'],
    ['incomplete', { reason: 'content_filter' }, 'inference_incomplete', 'content_filter'],
    ['failed', null, 'inference_response_status', 'none'],
    ['private-provider-status', { reason: 'private-provider-reason' }, 'inference_response_status', 'unknown'],
    ['completed', null, 'inference_tool_count', 'none'],
  ])('settles known %s usage once and never executes an incomplete result', async (status, incomplete_details, code, reason) => {
    const call = ledger();
    const fetcher = vi.fn().mockResolvedValue(Response.json({ status, incomplete_details, error: { message: 'private-provider-error' }, usage: { input_tokens: 1000, output_tokens: 200, output_tokens_details: { reasoning_tokens: 200 } }, output: [{ type: 'reasoning', encrypted_content: 'private-provider-reasoning' }] }));
    const error = await runInference(input, call as LedgerCall, 'private-credential', fetcher).catch(error => error);
    expect(error).toMatchObject({ status: 502, code });
    expect(error.message).toContain(`reason=${reason}`);
    expect(error.message).not.toContain('private-');
    expect(error.message.length).toBeLessThan(200);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(call.mock.calls.filter(([operation]) => operation === 'completeManagedInference')).toHaveLength(1);
    expect(call).toHaveBeenLastCalledWith('completeManagedInference', expect.objectContaining({ chargeCents: 2 }));
  });
  it.each([undefined, { input_tokens: 0, output_tokens: 0 }, { input_tokens: 1000 }, { input_tokens: -1, output_tokens: 200 }, { input_tokens: 1000, output_tokens: 1_000_000 }])('retains the reservation for suspicious usage %j', async usage => {
    const call = ledger();
    const fetcher = vi.fn().mockResolvedValue(Response.json({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, usage, output: [] }));
    const error = await runInference(input, call as LedgerCall, 'key', fetcher).catch(error => error);
    expect(error).toMatchObject({ status: 503, code: 'inference_usage_reconciliation' });
    expect(error.message).toContain('status=incomplete, reason=max_output_tokens');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(call.mock.calls.filter(([operation]) => operation === 'completeManagedInference')).toHaveLength(1);
    expect(call).toHaveBeenLastCalledWith('completeManagedInference', expect.objectContaining({ ambiguous: true }));
    expect(JSON.stringify(call.mock.calls)).not.toContain('chargeCents');
  });
  it('does not attempt a second settlement if the ledger fails to acknowledge known usage', async () => {
    const call = vi.fn(async (operation: string) => { if (operation === 'claimManagedInference') return { claimed: true }; throw new Error('ledger acknowledgement lost'); });
    const fetcher = vi.fn().mockResolvedValue(Response.json({ status: 'completed', usage: { input_tokens: 1000, output_tokens: 200 }, output: [] }));
    await expect(runInference(input, call as LedgerCall, 'key', fetcher)).rejects.toThrow('ledger acknowledgement lost');
    expect(call.mock.calls.filter(([operation]) => operation === 'completeManagedInference')).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not invent usage when the provider omits accounting', async () => {
    const call = ledger();
    await expect(runInference(input, call as LedgerCall, 'key', vi.fn().mockResolvedValue(Response.json({ status: 'completed', output: [] })))).rejects.toThrow('reconciliation');
    expect(call).toHaveBeenLastCalledWith('completeManagedInference', expect.objectContaining({ ambiguous: true }));
  });
});
