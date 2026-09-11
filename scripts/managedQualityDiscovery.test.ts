import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { managedJobs } from '../packages/modeling/jobs';
import type { BillingRequest } from '../packages/billing/http';
import type { LedgerCall } from '../packages/billing/ledgerClient';

function response() {
  return { statusCode: 0, setHeader: vi.fn(), end: vi.fn() };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('managed quality discovery', () => {
  it('publishes review.json for a v3 checkpoint without requiring references', async () => {
    const res = response();
    const ledger = vi.fn(async () => ({ jobId: 'job', workflowVersion: 3, referenceMode: 'none', artifactsReady: true }));
    await managedJobs({ method: 'GET' } as BillingRequest, res as never, 'jobs/job', 'a'.repeat(64), ledger as LedgerCall, false);
    const body = JSON.parse(res.end.mock.calls[0][0]);
    expect(body.artifacts.map((artifact: { name: string }) => artifact.name)).toEqual(['model.glb', 'model.blend', 'preview.png', 'review.json']);
  });

  it('keeps legacy no-reference checkpoint links unchanged', async () => {
    const res = response();
    const ledger = vi.fn(async () => ({ jobId: 'job', referenceMode: 'none', artifactsReady: true }));
    await managedJobs({ method: 'GET' } as BillingRequest, res as never, 'jobs/job', 'a'.repeat(64), ledger as LedgerCall, false);
    const body = JSON.parse(res.end.mock.calls[0][0]);
    expect(body.artifacts.map((artifact: { name: string }) => artifact.name)).toEqual(['model.glb', 'model.blend', 'preview.png']);
  });

  it('publishes only validated late Meshy recovery artifacts', async () => {
    const res = response();
    const valid = 'generated-image-to-3d-' + 'a'.repeat(64) + '.glb';
    const ledger = vi.fn(async () => ({ jobId: 'job', generatedMeshyArtifacts: [valid, '../private.glb', 'generated-short.glb'] }));
    await managedJobs({ method: 'GET' } as BillingRequest, res as never, 'jobs/job', 'a'.repeat(64), ledger as LedgerCall, false);
    const body = JSON.parse(res.end.mock.calls[0][0]);
    expect(body.artifacts).toEqual([{ name: valid, url: `/api/blender/jobs/job/artifacts/${valid}` }]);
  });

  it('routes only the Compute hostname discovery files before generic redirects', async () => {
    const config = JSON.parse(await readFile('vercel.json', 'utf8'));
    const redirects = config.redirects as Array<{ source: string; destination: string; has?: Array<{ type: string; value: string }> }>;
    for (const [source, destination] of [['/skill.md', '/compute/skill.md'], ['/llms.txt', '/compute/llms.txt']]) {
      const index = redirects.findIndex(route => route.source === source && route.has?.some(condition => condition.type === 'host' && condition.value === '3dforagents.com'));
      expect(index).toBeGreaterThanOrEqual(0);
      expect(redirects[index].destination).toBe(destination);
      expect(index).toBeLessThan(redirects.findIndex(route => route.source === '/:path*'));
      expect(redirects.some(route => route.source === source && route.has?.some(condition => condition.value.includes('agartha')))).toBe(false);
    }
  });

  it('returns an exact prior request after admission flags are removed', async () => {
    vi.stubEnv('AGARTHA_MANAGED_MODELING_ENABLED', 'true');
    vi.stubEnv('AGARTHA_REFERENCE_MODELING_ENABLED', 'true');
    vi.stubEnv('AI_GATEWAY_API_KEY', 'fixture');
    const body = { jobId: 'job', requestId: 'request', brief: 'A chair', budgetCents: 500, referenceMode: 'generate' };
    let prior: Record<string, unknown> | undefined;
    const ledger = vi.fn(async (_operation: string, args: Record<string, unknown>) => {
      if (prior) return prior;
      expect(args).toMatchObject({ admissionEnabled: true, referenceAdmissionEnabled: true });
      prior = { ...args, workflowVersion: 3, artifactsReady: false };
      return prior;
    }) as LedgerCall;
    await managedJobs({ method: 'POST', headers: { 'content-type': 'application/json' }, body } as BillingRequest, response() as never, 'jobs', 'a'.repeat(64), ledger, false);
    vi.stubEnv('AGARTHA_MANAGED_MODELING_ENABLED', 'false');
    vi.stubEnv('AGARTHA_REFERENCE_MODELING_ENABLED', 'false');
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    const retried = response();
    await managedJobs({ method: 'POST', headers: { 'content-type': 'application/json' }, body } as BillingRequest, retried as never, 'jobs', 'a'.repeat(64), ledger, false);
    expect(ledger).toHaveBeenLastCalledWith('createManagedJob', expect.objectContaining({ admissionEnabled: false, referenceAdmissionEnabled: false, referenceMode: 'generate' }));
    expect(JSON.parse(retried.end.mock.calls[0][0])).toMatchObject({ jobId: 'job', referenceMode: 'generate' });
  });

  it('allows an admitted job start retry after the admission flag is removed', async () => {
    vi.stubEnv('AGARTHA_MANAGED_MODELING_ENABLED', 'false');
    vi.stubEnv('AGARTHA_BLENDER_BROKER_URL', 'https://broker.example');
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 202 }));
    vi.stubGlobal('fetch', fetcher);
    const ledger = vi.fn(async () => ({ jobId: 'job', status: 'queued' })) as LedgerCall;
    const res = response();
    await managedJobs({ method: 'POST' } as BillingRequest, res as never, 'jobs/job/start', 'a'.repeat(64), ledger, false);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(202);
  });
});
