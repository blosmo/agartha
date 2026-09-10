// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

const html = readFileSync('apps/web/public/compute/index.html', 'utf8');
const script = readFileSync('apps/web/public/compute/managed.js', 'utf8');
afterEach(() => { vi.unstubAllGlobals(); });

it('shows correction evidence on demand without treating unaccepted work as approved or executing report text', async () => {
  document.documentElement.innerHTML = html;
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
  localStorage.setItem('agartha-compute-token', 'a'.repeat(64));
  localStorage.setItem('agartha-compute-job', JSON.stringify({ jobId: 'job', budgetCents: 500, brief: 'Chair', referenceMode: 'generate' }));
  const fetcher = vi.fn(async (url: string) => Response.json(
    url.endsWith('review.json') ? { acceptedRevision: null, quality: { reviews: [{ candidateRevision: 1, verdict: 'revise', score: 5, summary: '<img src=x onerror=alert(1)>', corrections: [{ evidence: 'Floating leg in front view.', change: 'Extend leg to floor.' }] }], stopReason: 'Stopped after repeated reviews found no improvement.' } }
      : url.endsWith('/jobs/job') ? { status: 'partial', artifacts: ['review.json'], visuallyInspected: false }
      : url.endsWith('/balance') ? { availableCents: 0 }
      : url.endsWith('/capabilities') ? { managed: { enabled: true, references: { enabled: true } } } : {}));
  vi.stubGlobal('fetch', fetcher);
  new Function(script)();
  await vi.waitFor(() => expect(document.getElementById('managed-artifacts')?.textContent).toContain('View quality review'));
  expect(fetcher.mock.calls.some(([url]) => url.endsWith('review.json'))).toBe(false);
  const button = [...document.querySelectorAll('button')].find(button => button.textContent === 'View quality review')!;
  button.click();
  await vi.waitFor(() => expect(document.body.textContent).toContain('Extend leg to floor.'));
  const panel = document.getElementById('managed-inspection')!.nextElementSibling!;
  expect(panel.textContent).toContain('No independently accepted checkpoint');
  expect(panel.textContent).toContain('Blender renders');
  expect(panel.querySelector('img')).toBeNull();
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith('review.json'))).toHaveLength(1);
  let rejectReview!: (reason: Error) => void;
  fetcher.mockImplementationOnce(() => new Promise<Response>((_resolve, reject) => { rejectReview = reject; }));
  button.click();
  expect(button.disabled).toBe(true);
  document.getElementById('managed-new')!.click();
  rejectReview(new Error('Old review failed'));
  await vi.waitFor(() => expect(button.disabled).toBe(false));
  expect(document.getElementById('managed-error')!.textContent).not.toContain('Old review failed');
  expect((panel as HTMLElement).hidden).toBe(true);
  expect(panel.textContent).toBe('');
});
