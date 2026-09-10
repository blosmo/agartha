import { expect, it, vi } from 'vitest';
import { criticRequest, parseVisualReview } from '../packages/modeling/visualReview';
import { runInference } from '../packages/modeling/inference';
import type { LedgerCall } from '../packages/billing/ledgerClient';

const images = ['reference-front', 'render-front', 'render-right'].map(label => ({ label, image: 'data:image/jpeg;base64,AA==' }));
const input = { jobId: 'job', executorId: 'worker', operationId: 'worker-review-1', brief: 'A walnut chair', history: 'Builder says this is perfect', images, remainingCents: 435, protocol: 2 as const, kind: 'critique' as const };
const ready = { verdict: 'ready', score: 8, summary: 'Coherent silhouette and connected supports.', corrections: [] };

it('isolates the reviewer from builder history and editing tools, with a bounded allowance', () => {
  const request = criticRequest(input);
  expect(JSON.stringify(request.body)).not.toContain(input.history);
  expect(request.body.tools.map(tool => tool.function.name)).toEqual(['visual_review']);
  expect(request.body.max_completion_tokens).toBeLessThanOrEqual(2048);
  expect(request.maxCostCents).toBeLessThanOrEqual(input.remainingCents);
  expect(() => criticRequest({ ...input, remainingCents: 1 })).toThrow('budget');
  expect(() => criticRequest({ ...input, images: images.slice(0, 2) })).toThrow('two whole-model');
  expect(() => criticRequest({ ...input, images: [...images.slice(0, 2), { ...images[2], label: 'render-detail' }] })).toThrow('two whole-model');
  expect(() => criticRequest({ ...input, images: [{ label: 'render-front', image: 'https://example.com/image' }] })).toThrow('image');
});

it('rejects contradictory approvals and unbounded or empty correction records', () => {
  expect(parseVisualReview({ ...ready, extra: 'discard' })).toEqual(ready);
  for (const change of [{ score: 7 }, { score: NaN }, { verdict: 'revise' }, { summary: '' }, { corrections: [null] }, { corrections: [{ area: 'structure', issueId: 'front-leg-floating', evidence: 'front', change: 'fix' }] }]) expect(() => parseVisualReview({ ...ready, ...change })).toThrow('invalid independent review');
  const revise = { ...ready, verdict: 'revise', score: 6, corrections: [{ area: 'structure', issueId: 'front-leg-floating', evidence: 'Front legs float above the floor in render-front.', change: 'Extend the legs to the floor.' }] };
  expect(parseVisualReview(revise)).toEqual(revise);
  expect(() => parseVisualReview({ ...revise, corrections: [revise.corrections[0], revise.corrections[0]] })).toThrow('duplicate correction');
  expect(() => parseVisualReview({ ...revise, corrections: Array(4).fill(revise.corrections[0]) })).toThrow();
});

it('uses the existing durable charge fence and settles before returning review feedback', async () => {
  const ledger = vi.fn(async (operation: string) => operation === 'claimManagedInference' ? { claimed: true } : {});
  const fetcher = vi.fn().mockResolvedValue(Response.json({ usage: { prompt_tokens: 1000, completion_tokens: 200 }, choices: [{ message: { tool_calls: [{ function: { name: 'visual_review', arguments: JSON.stringify(ready) } }] } }] }));
  expect(await runInference(input, ledger as LedgerCall, 'key', fetcher)).toEqual(ready);
  expect(ledger.mock.invocationCallOrder[0]).toBeLessThan(fetcher.mock.invocationCallOrder[0]);
  expect(ledger).toHaveBeenLastCalledWith('completeManagedInference', expect.objectContaining({ chargeCents: 2 }));
  const duplicate = vi.fn(async () => ({ claimed: false }));
  await expect(runInference(input, duplicate as LedgerCall, 'key', fetcher)).rejects.toThrow('already dispatched');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
