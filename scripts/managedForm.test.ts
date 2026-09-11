// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

const html = readFileSync('apps/web/public/compute/index.html', 'utf8');
const script = readFileSync('apps/web/public/compute/managed.js', 'utf8');
const el = (id: string) => document.getElementById(`managed-${id}`)!;

function reply(data: unknown, status = 200) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => data });
}

async function boot(jobState: Record<string, unknown> = { status: 'completed', progress: 'Done', workflowVersion: 3, referenceMode: 'none', visuallyInspected: false }) {
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
    if (path === '/api/blender/capabilities') return reply({ managed: { enabled: true, workflowVersion: 3, defaultReferenceMode: 'generate', minimumBudgetCents: 100, maximumBudgetCents: 2000, references: { enabled: true, minimumBudgetCents: 500 } } });
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
  return { fetcher, requests };
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
