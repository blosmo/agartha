import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { managedJobs } from '../packages/modeling/jobs';
import type { BillingRequest } from '../packages/billing/http';
import type { LedgerCall } from '../packages/billing/ledgerClient';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('streams a valid large artifact rather than buffering it into end()', async () => {
  vi.stubEnv('AGARTHA_BLENDER_BROKER_URL', 'https://broker.example');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array(6 * 1024 * 1024))));
  const response = Object.assign(new EventEmitter(), { setHeader: vi.fn(), write: vi.fn(() => true), end: vi.fn(), destroyed: false, destroy: vi.fn() });
  const ledger = vi.fn(async () => ({ jobId: 'job', artifactsReady: true }));
  await managedJobs({ method: 'GET' } as BillingRequest, response as unknown as ServerResponse, 'jobs/job/artifacts/model.blend', 'a'.repeat(64), ledger as LedgerCall, true);
  expect(response.write).toHaveBeenCalled();
  expect(response.end).toHaveBeenCalledWith();
  expect(response.destroy).not.toHaveBeenCalled();
});
