// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

const html = readFileSync('apps/web/public/compute/index.html', 'utf8');
const script = readFileSync('apps/web/public/compute/managed.js', 'utf8');
const el = (id: string) => document.getElementById(`managed-${id}`)!;

function reply(data: unknown, status = 200) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => data });
}

async function boot(jobState: Record<string, unknown> = { status: 'completed', progress: 'Done', workflowVersion: 3, referenceMode: 'none', visuallyInspected: false }, meshy = { enabled: true, maximumAllowanceCents: 1000 }) {
  document.documentElement.innerHTML = html;
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, String(value)),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  });
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  const requests: Array<{ path: string; body?: Record<string, unknown> }> = [];
  const fetcher = vi.fn(async (input: string, init?: RequestInit) => {
    const path = String(input);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    requests.push({ path, body });
    if (path === '/api/blender/capabilities') return reply({ managed: { enabled: true, workflowVersion: 3, defaultReferenceMode: 'generate', minimumBudgetCents: 100, maximumBudgetCents: 2000, references: { enabled: true, minimumBudgetCents: 500 }, meshy } });
    if (path === '/api/blender/pricing') return reply({ purchasesEnabled: false, paymentMode: 'unconfigured' });
    if (path === '/api/session') return reply({ recoveryConfigured: true });
    if (path === '/api/session/renew') return reply({});
    if (path === '/api/blender/balance') return reply({ availableCents: 500, heldCents: 0 });
    if (path === '/api/blender/jobs') return reply({ jobId: body?.jobId, status: 'queued' }, 201);
    if (path.endsWith('/start')) return reply({}, 202);
    if (/\/api\/blender\/jobs\//.test(path)) return reply({ jobId: 'job', artifacts: [], ...jobState });
    throw new Error(`Unexpected request: ${path}`);
  });
  vi.stubGlobal('fetch', fetcher);
  new Function(script)();
  await vi.waitFor(() => expect((el('submit') as HTMLButtonElement).disabled).toBe(false));
  return { fetcher, requests, values };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('preserves an explicit reference opt-out through refresh and submits none', async () => {
  const { requests } = await boot();
  const references = el('references') as HTMLInputElement;
  expect(references.checked).toBe(true);
  references.checked = false;
  references.dispatchEvent(new Event('change', { bubbles: true }));
  el('check').click();
  await vi.waitFor(() => expect(requests.filter(request => request.path === '/api/blender/capabilities')).toHaveLength(2));
  expect(references.checked).toBe(false);
  (el('brief') as HTMLTextAreaElement).value = 'A ceramic teapot';
  (el('budget') as HTMLInputElement).value = '5.00';
  el('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(requests.some(request => request.path === '/api/blender/jobs')).toBe(true));
  expect(requests.find(request => request.path === '/api/blender/jobs')?.body).toMatchObject({ referenceMode: 'none', budgetCents: 500 });
});

it('does not describe legacy visual inspection as independent acceptance', async () => {
  await boot({ status: 'completed', progress: 'Done', referenceMode: 'none', visuallyInspected: true });
  (el('references') as HTMLInputElement).checked = false;
  (el('references') as HTMLInputElement).dispatchEvent(new Event('change', { bubbles: true }));
  (el('brief') as HTMLTextAreaElement).value = 'A ceramic teapot';
  (el('budget') as HTMLInputElement).value = '5.00';
  el('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(el('inspection').textContent).toContain('Astra inspected a preview'));
  expect(el('inspection').textContent).not.toContain('Independent visual review accepted');
});

it('submits the optional Meshy allowance inside the same total cap', async () => {
  const { requests } = await boot({ status: 'completed', progress: 'Done', referenceMode: 'none', visuallyInspected: false, chargedAiCents: 40, chargedMeshyCents: 10, computeChargedCents: 20 });
  (el('references') as HTMLInputElement).checked = false;
  (el('references') as HTMLInputElement).dispatchEvent(new Event('change', { bubbles: true }));
  (el('meshy') as HTMLInputElement).checked = true;
  (el('meshy') as HTMLInputElement).dispatchEvent(new Event('change', { bubbles: true }));
  (el('meshy-budget') as HTMLInputElement).value = '1.00';
  (el('meshy-assets') as HTMLSelectElement).value = '2';
  (el('meshy-rigging') as HTMLInputElement).checked = true;
  (el('brief') as HTMLTextAreaElement).value = 'A ceramic teapot';
  (el('budget') as HTMLInputElement).value = '5.00';
  el('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(requests.some(request => request.path === '/api/blender/jobs')).toBe(true));
  expect(requests.find(request => request.path === '/api/blender/jobs')?.body).toMatchObject({ budgetCents: 500, meshyAllowance: { budgetCents: 100, maxAssets: 2, allowRigging: true } });
  await vi.waitFor(() => expect(el('cost').textContent).toContain('Meshy component: $0.10 (included in AI usage).'));
  expect(el('cost').textContent).toContain('$0.60 charged of $5.00 cap.');
});

it('shows an authenticated late Meshy component download', async () => {
  const name = 'generated-image-to-3d-' + 'a'.repeat(64) + '.glb';
  await boot({ status: 'partial', progress: 'Provider component retained', workflowVersion: 3, referenceMode: 'none', visuallyInspected: false, artifacts: [{ name, url: `/api/blender/jobs/job/artifacts/${name}` }] });
  (el('references') as HTMLInputElement).checked = false;
  (el('references') as HTMLInputElement).dispatchEvent(new Event('change', { bubbles: true }));
  (el('brief') as HTMLTextAreaElement).value = 'A ceramic teapot';
  (el('budget') as HTMLInputElement).value = '5.00';
  el('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(el('artifacts').textContent).toContain('Download generated component'));
});

it('hides Meshy and omits its allowance when the capability is disabled', async () => {
  const { requests } = await boot(undefined, { enabled: false, maximumAllowanceCents: 1000 });
  expect((el('meshy-option') as HTMLElement).hidden).toBe(true);
  expect((el('meshy') as HTMLInputElement).disabled).toBe(true);
  // Simulate stale or scripted browser state. The request must still be capability-gated.
  (el('meshy') as HTMLInputElement).checked = true;
  (el('brief') as HTMLTextAreaElement).value = 'A ceramic teapot';
  (el('budget') as HTMLInputElement).value = '5.00';
  el('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(requests.some(request => request.path === '/api/blender/jobs')).toBe(true));
  expect(requests.find(request => request.path === '/api/blender/jobs')?.body).not.toHaveProperty('meshyAllowance');
});

it('rejects an allowance above the advertised Meshy cap', async () => {
  const { requests } = await boot(undefined, { enabled: true, maximumAllowanceCents: 75 });
  (el('meshy') as HTMLInputElement).checked = true;
  (el('meshy') as HTMLInputElement).dispatchEvent(new Event('change', { bubbles: true }));
  (el('meshy-budget') as HTMLInputElement).value = '0.76';
  (el('brief') as HTMLTextAreaElement).value = 'A ceramic teapot';
  (el('budget') as HTMLInputElement).value = '5.00';
  el('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(el('error').textContent).toContain('between $0.01 and $0.75'));
  expect(requests.some(request => request.path === '/api/blender/jobs')).toBe(false);
});

it('retains the exact request and allowance for a replayable saved job', async () => {
  const { requests, values } = await boot({ status: 'running', progress: 'Queued', referenceMode: 'none', visuallyInspected: false });
  (el('meshy') as HTMLInputElement).checked = true;
  (el('meshy') as HTMLInputElement).dispatchEvent(new Event('change', { bubbles: true }));
  (el('meshy-budget') as HTMLInputElement).value = '1.00';
  (el('meshy-assets') as HTMLSelectElement).value = '3';
  (el('brief') as HTMLTextAreaElement).value = 'A ceramic teapot';
  (el('budget') as HTMLInputElement).value = '5.00';
  el('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(requests.some(request => request.path === '/api/blender/jobs')).toBe(true));
  const first = requests.find(request => request.path === '/api/blender/jobs')?.body;
  expect(first).toMatchObject({ jobId: expect.any(String), requestId: expect.any(String), budgetCents: 500, meshyAllowance: { budgetCents: 100, maxAssets: 3, allowRigging: false } });
  const saved = JSON.parse(values.get('agartha-compute-job')!);
  expect(saved).toEqual(first);
  expect(saved.requestId).toMatch(/^[0-9a-f-]{36}$/);
  const startsBeforeRetry = requests.filter(request => request.path.endsWith('/start')).length;
  el('retry').click();
  await vi.waitFor(() => expect(requests.filter(request => request.path.endsWith('/start')).length).toBe(startsBeforeRetry + 1));
  expect(JSON.parse(values.get('agartha-compute-job')!)).toEqual(first);
});
