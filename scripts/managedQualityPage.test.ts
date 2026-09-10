// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

const html = readFileSync('apps/web/public/compute/index.html', 'utf8');
const script = readFileSync('apps/web/public/compute/managed.js', 'utf8');
afterEach(() => { vi.unstubAllGlobals(); });

async function openReview(report: Record<string, unknown>) {
  document.documentElement.innerHTML = html;
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
  localStorage.setItem('agartha-compute-token', 'a'.repeat(64));
  localStorage.setItem('agartha-compute-job', JSON.stringify({ jobId: 'job', budgetCents: 500, brief: 'Chair', referenceMode: 'none' }));
  vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json(
    url.endsWith('review.json') ? report
      : url.endsWith('/jobs/job') ? { status: 'partial', artifacts: ['review.json'], workflowVersion: 3, visuallyInspected: false }
      : url.endsWith('/balance') ? { availableCents: 0 }
      : url.endsWith('/capabilities') ? { managed: { enabled: true, workflowVersion: 3, defaultReferenceMode: 'generate', references: { enabled: true } } } : {})));
  new Function(script)();
  await vi.waitFor(() => expect(document.getElementById('managed-artifacts')?.textContent).toContain('View quality review'));
  const button = [...document.querySelectorAll('button')].find(button => button.textContent === 'View quality review')!;
  button.click();
  const panel = document.getElementById('managed-inspection')!.nextElementSibling!;
  await vi.waitFor(() => expect((panel as HTMLElement).hidden).toBe(false));
  return panel;
}

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

it('shows accepted v3 evidence as an export-bound GLB review', async () => {
  const evidence = 'The isolated front view shows a continuous silhouette and connected supports.';
  const panel = await openReview({
    protocol: 3,
    acceptedRevision: 2,
    reviews: [
      { candidateRevision: 1, status: 'reviewed', verdict: { accepted: false, defects: [{ severity: 'major', criterion: 'construction', description: 'One support is disconnected.' }] } },
      { candidateRevision: 2, status: 'reviewed', verdict: { accepted: true, criteria: { construction: { pass: true, evidence } }, defects: [] } },
    ],
  });
  expect(panel.textContent).toContain('An accepted exported GLB passed independent review.');
  expect(panel.textContent).toContain('Reviewed exported candidate 2: accepted.');
  expect(panel.textContent).toContain(`construction: ${evidence}`);
  expect(panel.textContent).toContain('export-bound GLB rendered in an isolated neutral scene');
  expect(panel.textContent).not.toContain('This review covers Blender renders');
});

it('shows rejected v3 defects without claiming an accepted checkpoint', async () => {
  const panel = await openReview({
    protocol: 3,
    acceptedRevision: null,
    reviews: [{ candidateRevision: 4, status: 'reviewed', verdict: { accepted: false, criteria: {}, defects: [{ severity: 'major', criterion: 'proportions', description: 'The front legs are too short compared with the body.' }] } }],
  });
  expect(panel.textContent).toContain('No independently accepted exported GLB is recorded.');
  expect(panel.textContent).toContain('Reviewed exported candidate 4: changes required.');
  expect(panel.textContent).toContain('major · proportions: The front legs are too short compared with the body.');
  expect(panel.textContent).toContain('export-bound GLB rendered in an isolated neutral scene');
  expect(panel.textContent).not.toContain('An accepted checkpoint');
});
