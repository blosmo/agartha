import { createHash } from 'node:crypto';
import { BillingHttpError, type LedgerCall } from '../billing/ledgerClient.js';
import {
  MESHY_STAGE_CREDITS,
  meshyCostCents,
  type MeshyRate,
  type MeshyResult,
  type MeshyStage,
} from '../protocol/src/meshy.js';

const MESHY_ORIGIN = 'https://api.meshy.ai/openapi/v1';
const MAX_JSON_BYTES = 200_000;
const MAX_REQUEST_JSON_BYTES = 4_800_000;
const MAX_IMAGE_BYTES = 3_500_000;
const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/;

type MeshyOperation = {
  status?: 'pending' | 'succeeded' | 'failed';
  meshStage?: MeshyStage;
  meshTaskId?: string;
  meshResult?: MeshyResult;
  maxCostCents?: number;
  meshParentOperationId?: string;
  payloadFingerprint?: string;
  meshArtifactReady?: boolean;
  chargeCents?: number;
};

type CommonInput = { jobId: string; executorId: string; operationId: string; rate: MeshyRate };
export type StartMeshyInput = CommonInput & {
  stage: MeshyStage;
  image?: string;
  parentOperationId?: string;
  heightMeters?: number;
  humanoid?: boolean;
};

type Fetcher = typeof fetch;

function idsOf(input: CommonInput) {
  return { jobId: input.jobId, executorId: input.executorId, operationId: input.operationId };
}

function error(status: number, message: string, code?: string): never {
  throw new BillingHttpError(status, message, code);
}

function validId(value: string, label: string) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) error(400, `Invalid ${label}.`);
  return value;
}

function validateTaskId(value: unknown): string {
  if (typeof value !== 'string' || !TASK_ID.test(value)) error(502, 'Meshy returned an invalid task ID.', 'meshy_task_invalid');
  return value;
}

/** Accept only Meshy's documented asset host, without credentials or fragments. */
export function validateMeshyAssetUrl(value: string): string {
  if (typeof value !== 'string' || value.length > 2048) error(502, 'Meshy returned an invalid asset URL.', 'meshy_asset_invalid');
  let parsed: URL;
  try { parsed = new URL(value); } catch { error(502, 'Meshy returned an invalid asset URL.', 'meshy_asset_invalid'); }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'assets.meshy.ai' || parsed.port || parsed.username || parsed.password || parsed.hash) {
    error(502, 'Meshy returned an untrusted asset URL.', 'meshy_asset_untrusted');
  }
  return parsed.href;
}

function validateImage(image: string) {
  if (typeof image !== 'string') error(400, 'Meshy requires a JPEG or PNG data URI.');
  if (!/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) error(400, 'Meshy requires a JPEG or PNG data URI.');
  const comma = image.indexOf(',');
  const encoded = image.slice(comma + 1);
  const bytes = Math.floor(encoded.length * 3 / 4) - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0);
  if (bytes < 1 || bytes > MAX_IMAGE_BYTES) error(400, 'Meshy image exceeds the 3.5 MB limit.');
  // A decode also rejects malformed padding that a permissive regexp could admit.
  try {
    const decoded = Buffer.from(encoded, 'base64');
    if (decoded.byteLength !== bytes || decoded.toString('base64') !== encoded) throw new Error();
    const jpeg = image.startsWith('data:image/jpeg;') && decoded.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
    const png = image.startsWith('data:image/png;') && decoded.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (!jpeg && !png) error(400, 'Meshy image signature does not match its format.');
  } catch { error(400, 'Meshy image is not valid base64.'); }
}

function jsonBody(body: unknown, limit = MAX_JSON_BYTES): string {
  const raw = JSON.stringify(body);
  if (Buffer.byteLength(raw) > limit) error(502, 'Meshy payload is too large.', 'meshy_payload_large');
  return raw;
}

async function readJson(response: Response): Promise<any> {
  const reader = response.body?.getReader();
  if (!reader) error(503, 'Meshy returned no response body.', 'meshy_response_invalid');
  let raw = ''; let bytes = 0; const decoder = new TextDecoder();
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_JSON_BYTES) { await reader.cancel(); error(502, 'Meshy response is too large.', 'meshy_response_large'); }
      raw += decoder.decode(chunk.value, { stream: true });
    }
    raw += decoder.decode();
    return JSON.parse(raw);
  } catch (cause) {
    if (cause instanceof BillingHttpError) throw cause;
    error(502, 'Meshy returned invalid JSON.', 'meshy_response_invalid');
  }
}

function normalized(operationId: string, operation: MeshyOperation, chargeCents?: number) {
  return { operationId, ...(operation.meshTaskId ? { taskId: operation.meshTaskId } : {}), status: operation.meshResult?.status ?? operation.status ?? 'pending', ...(operation.meshResult ? { result: operation.meshResult } : {}), ...(chargeCents === undefined ? {} : { chargeCents }) };
}

function existingState(operationId: string, operation: MeshyOperation | null | undefined) {
  return operation ? normalized(operationId, operation) : undefined;
}

async function providerRequest(fetcher: Fetcher, url: string, init: RequestInit, credential: string, method: 'POST' | 'GET') {
  try {
    return await fetcher(url, { ...init, method, headers: { authorization: `Bearer ${credential}`, ...(init.headers ?? {}) }, redirect: 'error', signal: AbortSignal.timeout(method === 'POST' ? 60_000 : 30_000) });
  } catch {
    error(503, `Meshy ${method} request outcome is uncertain; retry the same operation.`, 'meshy_provider_unavailable');
  }
}

function quote(stage: MeshyStage, rate: MeshyRate) {
  return meshyCostCents(MESHY_STAGE_CREDITS[stage], rate);
}

export async function startMeshy(input: StartMeshyInput, ledger: LedgerCall, credential: string, fetcher: Fetcher = fetch) {
  validId(input.jobId, 'job ID'); validId(input.executorId, 'executor ID'); validId(input.operationId, 'operation ID');
  if (input.stage !== 'image-to-3d' && input.stage !== 'rigging') error(400, 'Invalid Meshy stage.');
  if (input.humanoid !== undefined && typeof input.humanoid !== 'boolean') error(400, 'Invalid Meshy humanoid option.');
  if (!credential) error(500, 'Meshy credential is not configured.');
  const ids = idsOf(input);
  const old = await ledger<MeshyOperation | null>('getManagedMeshyOperation', ids);

  let body: Record<string, unknown>;
  if (input.stage === 'image-to-3d') {
    if (input.image === undefined) error(400, 'Meshy image generation requires an image.');
    validateImage(input.image);
    body = { image_url: input.image, ai_model: 'meshy-7', enable_pbr: true, should_texture: true, texture_resolution: '2k', should_remesh: true, target_polycount: 20_000, target_formats: ['glb'], ...(input.humanoid ? { pose_mode: 'a-pose' } : {}) };
  } else {
    if (!input.parentOperationId) error(400, 'Meshy rigging requires a parent operation.');
    validId(input.parentOperationId, 'parent operation ID');
    if (input.heightMeters !== undefined && (!Number.isFinite(input.heightMeters) || input.heightMeters < 0.2 || input.heightMeters > 5)) error(400, 'Meshy rigging height must be between 0.2 and 5 meters.');
    const parent = await ledger<MeshyOperation | null>('getManagedMeshyOperation', { ...ids, operationId: input.parentOperationId });
    if (!parent || parent.meshStage !== 'image-to-3d' || !parent.meshTaskId || parent.meshResult?.status !== 'succeeded' || !parent.meshResult.modelUrl) error(409, 'Meshy rigging parent is not an owned successful generation.', 'meshy_parent_invalid');
    // Meshy accepts the completed image-to-3d task as the rigging input.
    body = { input_task_id: validateTaskId(parent.meshTaskId), ...(input.heightMeters === undefined ? {} : { height_meters: input.heightMeters }) };
  }
  const serializedBody = jsonBody(body, MAX_REQUEST_JSON_BYTES);
  const payloadFingerprint = createHash('sha256').update(serializedBody).digest('hex');
  if (old && (old.meshStage !== undefined && old.meshStage !== input.stage || old.meshParentOperationId !== undefined && old.meshParentOperationId !== input.parentOperationId || old.payloadFingerprint !== undefined && old.payloadFingerprint !== payloadFingerprint)) {
    error(409, 'Meshy operation payload does not match its persisted claim.', 'meshy_operation_mismatch');
  }
  const maxCostCents = quote(input.stage, input.rate);
  const claim = await ledger<{ claimed?: boolean }>('claimManagedInference', { ...ids, kind: 'meshy', meshStage: input.stage, ...(input.parentOperationId ? { meshParentOperationId: input.parentOperationId } : {}), maxCostCents, payloadFingerprint });
  if (claim.claimed !== true) {
    const state = await ledger<MeshyOperation | null>('getManagedMeshyOperation', ids);
    const known = existingState(input.operationId, state);
    if (known && (state?.meshTaskId || state?.meshResult || state?.status === 'failed')) return known;
    error(409, 'This Meshy operation was already dispatched; its outcome is being reconciled.', 'meshy_dispatch_uncertain');
  }

  let response: Response;
  try {
    response = await providerRequest(fetcher, `${MESHY_ORIGIN}/${input.stage}`, { headers: { 'content-type': 'application/json' }, body: serializedBody }, credential, 'POST');
  } catch (cause) {
    if (cause instanceof BillingHttpError && cause.code === 'meshy_provider_unavailable') await ledger('completeManagedInference', { ...ids, ambiguous: true });
    throw cause;
  }
  if (!response.ok) {
    const admissionRejected = [400, 401, 402, 403, 404, 413, 422, 429].includes(response.status);
    if (admissionRejected) {
      await ledger('completeManagedMeshyTask', { ...ids, chargeCents: 0, result: { status: 'failed' } });
      error(503, `Meshy request was rejected. (provider_status=${response.status})`, 'meshy_provider_rejected');
    }
    await ledger('completeManagedInference', { ...ids, ambiguous: true });
    error(503, `Meshy request outcome is uncertain. (provider_status=${response.status})`, 'meshy_provider_uncertain');
  }
  let data: any;
  try { data = await readJson(response); } catch { await ledger('completeManagedInference', { ...ids, ambiguous: true }); throw new BillingHttpError(503, 'Meshy task admission requires reconciliation.', 'meshy_admission_uncertain'); }
  let taskId: string;
  try { taskId = validateTaskId(data?.result ?? data?.task_id ?? data?.id); } catch (cause) { await ledger('completeManagedInference', { ...ids, ambiguous: true }); throw cause; }
  try { await ledger('attachManagedMeshyTask', { ...ids, taskId }); }
  catch { await ledger('completeManagedInference', { ...ids, ambiguous: true }); error(503, 'Meshy task admission requires reconciliation.', 'meshy_admission_uncertain'); }
  return { operationId: input.operationId, taskId, status: 'pending' as const };
}

function parseCredits(data: any): number | undefined {
  const value = data?.consumed_credits ?? data?.credits ?? data?.usage?.credits;
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 0) error(502, 'Meshy returned invalid credit usage.', 'meshy_usage_invalid');
  return value;
}

function parseResult(stage: MeshyStage, data: any): MeshyResult {
  const status = String(data?.status ?? '').toLowerCase();
  if (status === 'succeeded' || status === 'completed') {
    if (stage === 'image-to-3d') {
      const modelUrl = data?.model_urls?.glb ?? data?.model_url;
      if (typeof modelUrl !== 'string') error(502, 'Meshy succeeded without a GLB URL.', 'meshy_result_invalid');
      return { status: 'succeeded', modelUrl: validateMeshyAssetUrl(modelUrl), ...(typeof data?.thumbnail_url === 'string' ? { thumbnailUrl: validateMeshyAssetUrl(data.thumbnail_url) } : {}) };
    }
    const result = data?.result ?? data;
    if (typeof result?.rigged_character_glb_url !== 'string') error(502, 'Meshy rigging succeeded without a GLB URL.', 'meshy_result_invalid');
    return { status: 'succeeded', modelUrl: validateMeshyAssetUrl(result.rigged_character_glb_url), ...(typeof result?.basic_animations?.walking_glb_url === 'string' ? { walkingUrl: validateMeshyAssetUrl(result.basic_animations.walking_glb_url) } : {}), ...(typeof data?.thumbnail_url === 'string' ? { thumbnailUrl: validateMeshyAssetUrl(data.thumbnail_url) } : {}) };
  }
  return { status: 'failed' };
}

export async function pollMeshy(input: CommonInput & { refreshResult?: boolean }, ledger: LedgerCall, credential: string, fetcher: Fetcher = fetch) {
  validId(input.jobId, 'job ID'); validId(input.executorId, 'executor ID'); validId(input.operationId, 'operation ID');
  if (!credential) error(500, 'Meshy credential is not configured.');
  const ids = idsOf(input);
  const operation = await ledger<MeshyOperation | null>('getManagedMeshyOperation', ids);
  if (!operation?.meshTaskId || !operation.meshStage) error(404, 'Meshy operation or task was not found.', 'meshy_operation_missing');
  const refreshing = input.refreshResult === true && operation.meshResult?.status === 'succeeded' && !operation.meshArtifactReady;
  if (operation.meshResult && !refreshing) return normalized(input.operationId, operation);
  const taskId = validateTaskId(operation.meshTaskId);
  const response = await providerRequest(fetcher, `${MESHY_ORIGIN}/${operation.meshStage}/${encodeURIComponent(taskId)}`, {}, credential, 'GET');
  if (!response.ok) error(503, `Meshy polling failed. (provider_status=${response.status})`, 'meshy_poll_failed');
  const data = await readJson(response);
  if (data?.id !== taskId) error(502, 'Meshy returned a mismatched task ID.', 'meshy_task_mismatch');
  const status = String(data?.status ?? '').toUpperCase();
  if (refreshing) {
    if (status !== 'SUCCEEDED') error(503, 'Meshy completed result is temporarily unavailable.', 'meshy_result_refresh_failed');
    const result = parseResult(operation.meshStage, data);
    if (result.status !== 'succeeded') error(503, 'Meshy completed result is temporarily unavailable.', 'meshy_result_refresh_failed');
    return normalized(input.operationId, { ...operation, meshResult: result }, operation.chargeCents);
  }
  if (status === 'PENDING' || status === 'IN_PROGRESS') return { operationId: input.operationId, taskId, status: 'pending' as const };
  if (status !== 'SUCCEEDED' && status !== 'FAILED' && status !== 'CANCELED') error(502, 'Meshy returned an unknown task status.', 'meshy_status_invalid');
  let result: MeshyResult;
  let consumed: number | undefined;
  try { result = parseResult(operation.meshStage, data); consumed = parseCredits(data); }
  catch (cause) { await ledger('completeManagedInference', { ...ids, ambiguous: true }); throw cause; }
  const expectedCredits = MESHY_STAGE_CREDITS[operation.meshStage];
  if (result.status === 'succeeded' && consumed !== undefined && consumed > expectedCredits) {
    await ledger('completeManagedInference', { ...ids, ambiguous: true });
    error(502, 'Meshy usage exceeded the quoted allowance.', 'meshy_usage_overrun');
  }
  if (result.status === 'succeeded' && (consumed === undefined || consumed <= 0 || consumed > expectedCredits)) {
    await ledger('completeManagedInference', { ...ids, ambiguous: true });
    error(502, 'Meshy usage requires reconciliation.', 'meshy_usage_reconciliation');
  }
  const chargeCents = result.status === 'failed' ? 0 : meshyCostCents(consumed as number, input.rate);
  await ledger('completeManagedMeshyTask', { ...ids, chargeCents, result });
  return normalized(input.operationId, { ...operation, meshResult: result, status: result.status }, chargeCents);
}
