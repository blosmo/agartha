import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { managedJobs } from '../packages/modeling/jobs';
import type { BillingRequest } from '../packages/billing/http';
import type { LedgerCall } from '../packages/billing/ledgerClient';

function response() {
  return { statusCode: 0, setHeader: vi.fn(), end: vi.fn() };
}

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
});
