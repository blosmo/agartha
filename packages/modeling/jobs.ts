import type { ServerResponse } from 'node:http';
import { BillingHttpError, type LedgerCall } from '../billing/ledgerClient.js';
import { jsonBody, jsonResponse, type BillingRequest } from '../billing/http.js';
import { managedEnabled, referencesEnabled } from './http.js';
import { meshyConfiguration } from './meshyConfig.js';
import { parseMeshyAllowance } from '../protocol/src/meshy.js';

const names = ['model.glb', 'model.blend', 'preview.png'];
function links(row: Record<string, any>) {
  const base = `/api/blender/jobs/${encodeURIComponent(row.jobId)}`;
  const artifacts = [
    ...(row.artifactsReady ? [...names, ...(row.videoReady ? ['turnaround.mp4'] : []), ...(row.workflowVersion === 3 ? ['review.json'] : [])] : []),
    ...(row.referenceReady ? ['reference.jpg', ...(row.workflowVersion === 3 ? [] : ['review.json'])] : []),
  ];
  return { ...row, statusUrl: base, startUrl: `${base}/start`, cancelUrl: `${base}/cancel`, artifacts: artifacts.map(name => ({ name, url: `${base}/artifacts/${name}` })) };
}
export async function managedJobs(req: BillingRequest, res: ServerResponse, path: string, token: string, ledger: LedgerCall, livemode: boolean) {
  if (path === 'jobs' && req.method === 'POST') {
    const body = await jsonBody(req);
    let meshyAllowance;
    try { meshyAllowance = parseMeshyAllowance(body.meshyAllowance); }
    catch { throw new BillingHttpError(400, 'Choose a Meshy allowance of 1–1000 cents, up to 3 assets and optional rigging.'); }
    const meshy = meshyConfiguration();
    const row = await ledger<Record<string, any>>('createManagedJob', { token, jobId: body.jobId, requestId: body.requestId, brief: body.brief, ...(body.referenceMode === undefined ? {} : { referenceMode: body.referenceMode }), ...(body.shareMaterials === undefined ? {} : {shareMaterials:body.shareMaterials}), ...(body.shareComponents === undefined ? {} : {shareComponents:body.shareComponents}), ...(meshyAllowance ? { meshyAllowance, meshyRate: meshy.rate, meshyAdmissionEnabled: meshy.enabled } : {}), budgetCents: body.budgetCents, livemode, admissionEnabled: managedEnabled(token, req), referenceAdmissionEnabled: referencesEnabled(token) });
    jsonResponse(res, links(row), 201);
    return;
  }
  const match = /^jobs\/([A-Za-z0-9_-]{1,80})(?:\/(start|cancel|artifacts\/(?:model\.glb|model\.blend|preview\.png|turnaround\.mp4|reference\.jpg|review\.json)))?$/.exec(path);
  if (!match) throw new BillingHttpError(404, 'Job not found.');
  const jobId = match[1], action = match[2];
  const row = await ledger<Record<string, any>>('getManagedJob', { token, jobId });
  if (!action && req.method === 'GET') { jsonResponse(res, links(row)); return; }
  if (action === 'cancel' && req.method === 'POST') { jsonResponse(res, links(await ledger('requestManagedCancel', { token, jobId }))); return; }
  if (action === 'start' && req.method === 'POST' || action?.startsWith('artifacts/') && req.method === 'GET') {
    const base = new URL(process.env.AGARTHA_BLENDER_BROKER_URL || 'https://invalid.invalid');
    if (base.protocol !== 'https:' || base.username || base.password || base.hostname === 'invalid.invalid') throw new BillingHttpError(503, 'Compute service is unavailable.');
    const response = await fetch(new URL(`/jobs/${encodeURIComponent(jobId)}/${action}`, base), { method: req.method, headers: { authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(45_000) });
    if (!response.ok) throw new BillingHttpError(response.status, action === 'start' ? 'Job start was not confirmed. Retry this same job.' : 'Artifact is not available.');
    if (action === 'start') { jsonResponse(res, links(row), 202); return; }
    const reader = response.body?.getReader();
    if (!reader) throw new BillingHttpError(502, 'Empty artifact.');
    const length = Number(response.headers.get('content-length'));
    if (length > 16 * 1024 * 1024) { await reader.cancel(); throw new BillingHttpError(502, 'Artifact is too large.'); }
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${action.slice('artifacts/'.length)}"`);
    // Streaming avoids Vercel's buffered response limit for editable BLEND files.
    let count = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        count += value.length;
        if (count > 16 * 1024 * 1024) { await reader.cancel(); res.destroy(); return; }
        if (!res.write(value)) await new Promise<void>(resolve => {
          const resume = () => { res.off('drain', resume); res.off('close', resume); resolve(); };
          res.once('drain', resume); res.once('close', resume);
        });
        if (res.destroyed) { await reader.cancel(); return; }
      }
      res.end();
    } catch { res.destroy(); }
    return;
  }
  throw new BillingHttpError(405, 'Use the documented job operation.');
}
