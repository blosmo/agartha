import { describe, it, expect } from 'vitest';
import { runBenchmark, validateManifest } from './managed-quality-benchmark.mjs';
const manifest = () => ({ baseUrl: 'https://example.com', brief: 'An elephant', runs: { baseline: { jobId: 'old', budgetCents: 500 }, improved: { jobId: 'new', budgetCents: 500 } } });
const row = (overrides = {}) => ({ jobId: 'new', brief: 'An elephant', budgetCents: 500, workflowVersion: 3, status: 'queued', ...overrides });
function harness(job = row()) {
  const state = manifest(), saved = [], calls = [], written = [];
  let postFails = false;
  const options = { state, name: 'improved', action: 'status', token: 'private-token', save: async value => saved.push(structuredClone(value)), writeArtifact: async (...args) => written.push(args), fetchImpl: async (url, init) => {
    calls.push({ url, method: init.method });
    expect(init.redirect).toBe('error');
    if (init.method === 'POST' && postFails) throw Error('uncertain');
    return new Response(JSON.stringify(job), { status: 200 });
  } };
  return { options, saved, calls, written, failPost: () => { postFails = true; } };
}
describe('bounded managed comparison', () => {
  it('refuses changed caps, duplicate jobs and credential-bearing origins', () => {
    for (const change of [s => s.runs.improved.budgetCents++, s => s.runs.improved.jobId = 'old', s => s.baseUrl = 'https://user:secret@example.com']) {
      const state = manifest(); change(state); expect(() => validateManifest(state)).toThrow();
    }
  });
  it('persists dispatch before network and refuses an uncertain second start', async () => {
    const h = harness(); h.options.action = 'start'; h.failPost();
    await expect(runBenchmark(h.options)).rejects.toThrow('uncertain');
    expect(h.saved.at(-1).runs.improved.startAttempted).toBeTruthy();
    await expect(runBenchmark(h.options)).rejects.toThrow('Refusing');
    expect(h.calls.filter(c => c.method === 'POST')).toHaveLength(1);
  });
  it('refuses a different stored brief or workflow before dispatch', async () => {
    for (const change of [{ brief: 'Something else' }, { workflowVersion: undefined }, { budgetCents: 501 }, { shareMaterials: true }, { shareComponents: { license: 'CC0-1.0' } }]) {
      const h = harness(row(change)); h.options.action = 'start';
      await expect(runBenchmark(h.options)).rejects.toThrow();
      expect(h.calls).toHaveLength(1);
    }
  });
  it('status never starts a job', async () => {
    const h = harness(); await runBenchmark(h.options);
    expect(h.calls).toHaveLength(1); expect(h.options.state.runs.improved.startAttempted).toBeUndefined();
  });
  it('refuses an artifact URL outside the authenticated job route', async () => {
    const h = harness(row({ status: 'partial', artifacts: [{ name: 'model.glb', url: 'https://elsewhere.example/model.glb' }] })); h.options.action = 'download';
    await expect(runBenchmark(h.options)).rejects.toThrow('Unexpected artifact route');
    expect(h.calls).toHaveLength(1); expect(h.written).toHaveLength(0);
  });
  it('streams only a bounded file and records its digest', async () => {
    const h = harness(); h.options.action = 'download';
    h.options.fetchImpl = async url => url.endsWith('/model.glb') ? new Response('glb') : new Response(JSON.stringify(row({ status: 'partial', artifacts: [{ name: 'model.glb', url: '/api/blender/jobs/new/artifacts/model.glb' }] })));
    const result = await runBenchmark(h.options);
    expect(h.written[0].slice(0, 2)).toEqual(['improved', 'model.glb']);
    expect(result.downloads['model.glb'].bytes).toBe(3);
    expect(result.downloads['model.glb'].sha256).toHaveLength(64);
  });
  it('does not write an oversized artifact', async () => {
    const h = harness(); h.options.action = 'download';
    h.options.fetchImpl = async url => url.endsWith('/model.glb') ? new Response(new Uint8Array(16 * 1024 * 1024 + 1)) : new Response(JSON.stringify(row({ status: 'partial', artifacts: [{ name: 'model.glb', url: '/api/blender/jobs/new/artifacts/model.glb' }] })));
    await expect(runBenchmark(h.options)).rejects.toThrow('16 MiB'); expect(h.written).toHaveLength(0);
  });
});
