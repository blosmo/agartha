import type { BillingRequest } from '../billing/http.js';
import { managedEnabled } from '../modeling/http.js';

/** Fixed first-party aliases; never accept arbitrary proxy destinations. */
export function playgroundBillingPath(path: string): string | undefined {
  if (path === 'playground/credit-pricing') return 'pricing';
  if (path === 'playground/jobs') return 'jobs';
  if (path === 'playground/credits') return 'purchases';
  const purchase = /^playground\/credits\/([A-Za-z0-9_-]{1,128})(?:\/(checkout|reconcile))?$/.exec(path);
  if (purchase) return `purchases/${purchase[1]}${purchase[2] ? `/${purchase[2]}` : ''}`;
  const job = /^playground\/jobs\/([A-Za-z0-9_-]{1,80})(?:\/(start|cancel|artifacts\/(?:model\.glb|model\.blend|preview\.png|turnaround\.mp4|reference\.jpg|review\.json)))?$/.exec(path);
  if (job) return `jobs/${job[1]}${job[2] ? `/${job[2]}` : ''}`;
  return undefined;
}
export function playgroundBroker(token: string | undefined, request: BillingRequest): URL {
  if (!token || !managedEnabled(token, request)) throw new Error('Managed modeling is not available for this account.');
  let base: URL;
  try { base = new URL(process.env.AGARTHA_BLENDER_BROKER_URL ?? ''); } catch { throw new Error('Compute service is not configured.'); }
  if (base.protocol !== 'https:' || base.username || base.password) throw new Error('Compute service is not configured.');
  return base;
}
export async function launchPlaygroundJob(base: URL, token: string, jobId: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(jobId)) throw new Error('Invalid managed job.');
  try {
    const response = await fetch(new URL(`/jobs/${encodeURIComponent(jobId)}/start`, base), { method: 'POST', headers: { authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(45_000) });
    return response.ok;
  } catch { return false; }
}
