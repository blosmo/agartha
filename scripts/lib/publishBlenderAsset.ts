import { createHash, randomUUID } from 'node:crypto';
import { open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { inspectGlb } from '../../packages/protocol/src/geometry/inspectGlb';
import { GLB_LIMITS } from '../../packages/protocol/src/geometry/glb';
import { ASSET_LIMITS, BUNDLE_ID, artifactContentType, canonicalAssetIdentity, normalizeAssetMetadata, validateArtifactSignature, type CanonicalMetadata, type ArtifactDescriptor } from '../../packages/protocol/src/canonicalAssets';

export type PublishOptions = {
  server: string; token: string; model: string; source: string; preview: string;
  metadata: CanonicalMetadata; statePath: string; uploadOrigin?: string;
};
type Ticket = { uploadToken: string; expiresAt: number; uploadUrl?: string; id?: string; uploadUrls?: { source: string; preview: string } };
type State = { version: 1; fingerprint: string; modelTicket?: Ticket; assetTicket?: Ticket; complete?: string };
type Manifest = { id: string; modelId: string; creatorAgentId: string; metadata: CanonicalMetadata; source: ArtifactDescriptor; preview: ArtifactDescriptor };
const sha = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
class PublishError extends Error { constructor(message: string, readonly status = 0) { super(message); } }
function origin(value: string): string {
  let url: URL; try { url = new URL(value); } catch { throw new PublishError('Invalid server or upload origin.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || !(url.protocol === 'https:' || url.protocol === 'http:' && local)) throw new PublishError('Use an HTTPS origin or an explicitly supplied localhost development origin.');
  return url.origin;
}
export function validateUploadUrl(value: string, expectedOrigin: string, path: string): string {
  let url: URL; try { url = new URL(value); } catch { throw new PublishError('Invalid upload endpoint.'); }
  if (url.origin !== expectedOrigin || url.pathname !== path || url.username || url.password || url.search || url.hash || value !== `${expectedOrigin}${path}`) throw new PublishError('Untrusted upload endpoint.');
  return url.href;
}
async function localFile(path: string, max: number): Promise<Buffer> {
  const handle = await open(path, 'r');
  try { const stat = await handle.stat(); if (!stat.isFile() || stat.size < 1 || stat.size > max) throw new PublishError('Artifact exceeds its size limit or is not a file.');
    // Read at most the limit plus one even if a file grows after stat.
    const bytes = Buffer.alloc(Math.min(max + 1, stat.size + 1)); let size = 0;
    while (size < bytes.length) { const read = await handle.read(bytes, size, bytes.length - size, null); if (!read.bytesRead) break; size += read.bytesRead; }
    if (size !== stat.size) throw new PublishError('Artifact changed while reading.'); return bytes.subarray(0, size);
  } finally { await handle.close(); }
}
async function saveState(path: string, state: State) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try { const file = await open(temporary, 'wx', 0o600); try { await file.writeFile(JSON.stringify(state)); await file.sync(); } finally { await file.close(); } await rename(temporary, path); const directory = await open(dirname(path), 'r'); try { await directory.sync(); } finally { await directory.close(); } }
  finally { await unlink(temporary).catch(() => {}); }
}
async function boundedBytes(response: Response, maximum: number) {
  const reader = response.body?.getReader(); if (!reader) throw new PublishError('Empty server response.');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length;
    if (size > maximum) { await reader.cancel(); throw new PublishError('Server response exceeds expected size.'); } chunks.push(next.value); }
  return Buffer.concat(chunks);
}
/** No upstream response text, credential or private artifact path escapes this boundary. */
export async function publishBlenderAsset(options: PublishOptions, fetcher: typeof fetch = fetch) {
  try { return await publish(options, fetcher); }
  catch (error) { if (error instanceof PublishError) throw error; throw new PublishError('Publication could not complete. Check the input files and retry using the same state file.'); }
}
async function publish(options: PublishOptions, fetcher: typeof fetch) {
  const server = origin(options.server);
  if (!/^[a-f0-9]{64}$/.test(options.token)) throw new PublishError('Set AGARTHA_AGENT_TOKEN to a valid agent token.');
  const metadata = normalizeAssetMetadata(options.metadata);
  const model = await localFile(options.model, GLB_LIMITS.bytes); inspectGlb(model);
  const source = await localFile(options.source, ASSET_LIMITS.source); validateArtifactSignature('source', source);
  const preview = await localFile(options.preview, ASSET_LIMITS.preview); validateArtifactSignature('preview', preview);
  const descriptors = { source: { sha256: sha(source), bytes: source.length }, preview: { sha256: sha(preview), bytes: preview.length } };
  const modelId = `model-${sha(model)}`;
  // Token digest binds resumptions to the same actor without persisting their session credential.
  const fingerprint = sha(JSON.stringify({ server, actor: sha(options.token), modelId, metadata, ...descriptors, uploadOrigin: options.uploadOrigin ?? null }));
  const statePath = resolve(options.statePath);
  if ([options.model, options.source, options.preview].some(path => resolve(path) === statePath)) throw new PublishError('State must be separate from artifact files.');
  let state: State = { version: 1, fingerprint };
  try { state = JSON.parse(await readFile(statePath, 'utf8')); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new PublishError('Cannot read publication state.'); }
  if (state.version !== 1 || state.fingerprint !== fingerprint) throw new PublishError('Publication state does not match these inputs.');
  const request = async (url: string, init: RequestInit = {}) => {
    let response: Response; try { response = await fetcher(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(60_000) }); } catch { throw new PublishError('Network request failed; retry with the same state file.'); }
    if (!response.ok) { await response.body?.cancel(); throw new PublishError(`Publication request failed (HTTP ${response.status}).`, response.status); } return response;
  };
  const json = async (path: string, body?: unknown): Promise<any> => {
    const response = await request(`${server}${path}`, body === undefined ? {} : { method: 'POST', headers: { Authorization: `Bearer ${options.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    try { return JSON.parse((await boundedBytes(response, 128_000)).toString()); } catch (error) { if (error instanceof PublishError) throw error; throw new PublishError('Invalid server response.'); }
  };
  const lookup = async (path: string) => { try { const result = await json(path); if (path.startsWith('/api/models/') && result.id !== modelId) throw new PublishError('Public model identity does not match the local GLB.'); return result; } catch (error) { if (error instanceof PublishError && error.status === 404) return null; throw error; } };
  const uploadOrigin = origin(options.uploadOrigin ?? (await json('/api/assets/capabilities')).uploadOrigin);
  if (uploadOrigin.startsWith('http:') && !options.uploadOrigin && uploadOrigin !== server) throw new PublishError('Development upload origin requires explicit configuration.');
  const checkTicket = (ticket: Ticket, asset: boolean) => {
    if (!ticket || !/^[a-f0-9]{64}$/.test(ticket.uploadToken) || ticket.uploadToken === options.token || !Number.isFinite(ticket.expiresAt)) throw new PublishError('Invalid upload ticket.');
    if (asset) { if (!BUNDLE_ID.test(ticket.id ?? '')) throw new PublishError('Invalid bundle ticket.'); for (const role of ['source', 'preview'] as const) validateUploadUrl(ticket.uploadUrls?.[role] ?? '', uploadOrigin, `/asset-upload/${role}`); }
    else validateUploadUrl(ticket.uploadUrl ?? '', uploadOrigin, '/model-upload');
  };
  const upload = async (url: string, token: string, bytes: Buffer, contentType: string) => { const response = await request(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType }, body: new Uint8Array(bytes) }); await response.body?.cancel(); };
  if (!(await lookup(`/api/models/${modelId}`))) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!state.modelTicket || state.modelTicket.expiresAt <= Date.now()) { state.modelTicket = await json('/api/models/upload-ticket', { name: metadata.name, description: metadata.description, license: metadata.license, attribution: metadata.attribution }); checkTicket(state.modelTicket!, false); await saveState(statePath, state); }
      const modelTicket = state.modelTicket!; checkTicket(modelTicket, false);
      try { await upload(modelTicket.uploadUrl!, modelTicket.uploadToken, model, 'model/gltf-binary'); }
      catch (error) { if (await lookup(`/api/models/${modelId}`)) break; if (error instanceof PublishError && error.status === 401 && attempt === 0) { delete state.modelTicket; await saveState(statePath, state); continue; } throw error; }
      if (!(await lookup(`/api/models/${modelId}`))) throw new PublishError('Uploaded model is not publicly available.'); break;
    }
  }
  let manifest: Manifest | null = state.assetTicket?.id ? await lookup(`/api/assets/${state.assetTicket.id}`) : state.complete ? await lookup(`/api/assets/${state.complete}`) : null;
  if (!manifest) for (let attempt = 0; attempt < 2; attempt++) {
    if (!state.assetTicket || state.assetTicket.expiresAt <= Date.now()) { state.assetTicket = await json('/api/assets/upload-ticket', { modelId, ...metadata, ...descriptors }); checkTicket(state.assetTicket!, true); await saveState(statePath, state); }
    const ticket = state.assetTicket!; checkTicket(ticket, true);
    try {
      await upload(ticket.uploadUrls!.source, ticket.uploadToken, source, artifactContentType('source'));
      await upload(ticket.uploadUrls!.preview, ticket.uploadToken, preview, artifactContentType('preview'));
      manifest = await json('/api/assets/finalize', { uploadToken: ticket.uploadToken });
    } catch (error) {
      manifest = await lookup(`/api/assets/${ticket.id}`);
      if (!manifest) { if (error instanceof PublishError && error.status === 401 && attempt === 0) { delete state.assetTicket; await saveState(statePath, state); continue; } throw error; }
    }
    break;
  }
  if (!manifest) throw new PublishError('Publication remains incomplete.');
  const expectedId = `bundle-${sha(canonicalAssetIdentity(manifest.creatorAgentId, modelId, metadata, descriptors.source, descriptors.preview))}`;
  if (manifest.id !== expectedId || manifest.modelId !== modelId || state.assetTicket && manifest.id !== state.assetTicket.id || canonicalAssetIdentity(manifest.creatorAgentId, manifest.modelId, manifest.metadata, manifest.source, manifest.preview) !== canonicalAssetIdentity(manifest.creatorAgentId, modelId, metadata, descriptors.source, descriptors.preview)) throw new PublishError('Public manifest does not match the local bundle.');
  // Retrieve the public projection independently even after a successful finalize reply.
  const publicManifest = await json(`/api/assets/${expectedId}`);
  if (publicManifest.id !== expectedId || canonicalAssetIdentity(publicManifest.creatorAgentId, publicManifest.modelId, publicManifest.metadata, publicManifest.source, publicManifest.preview) !== canonicalAssetIdentity(manifest.creatorAgentId, modelId, metadata, descriptors.source, descriptors.preview)) throw new PublishError('Public manifest verification failed.');
  for (const role of ['source', 'preview'] as const) {
    // Public file routes redirect to storage. Follow a bounded chain with no credentials.
    let url = `${server}/api/assets/${expectedId}/files/${role}`; let downloaded = false;
    for (let hop = 0; hop < 4; hop++) {
      let response: Response; try { response = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(60_000) }); } catch { throw new PublishError('Independent artifact download failed.'); }
      if ([301, 302, 303, 307, 308].includes(response.status)) { const location = response.headers.get('location'); await response.body?.cancel(); if (!location) throw new PublishError('Invalid public artifact redirect.'); const next = new URL(location, url); if (next.username || next.password || next.hash || !(next.protocol === 'https:' || next.origin === server && next.protocol === 'http:')) throw new PublishError('Invalid public artifact redirect.'); url = next.href; continue; }
      if (!response.ok) { await response.body?.cancel(); throw new PublishError('Independent artifact download failed.'); }
      const bytes = await boundedBytes(response, descriptors[role].bytes);
      if (bytes.length !== descriptors[role].bytes || sha(bytes) !== descriptors[role].sha256) throw new PublishError('Independent artifact checksum verification failed.'); downloaded = true; break;
    }
    if (!downloaded) throw new PublishError('Too many public artifact redirects.');
  }
  state = { version: 1, fingerprint, complete: expectedId }; await saveState(statePath, state);
  return { status: 'complete', assetId: expectedId, modelId, manifestUrl: `${server}/api/assets/${expectedId}`, sourceUrl: `${server}/api/assets/${expectedId}/files/source`, previewUrl: `${server}/api/assets/${expectedId}/files/preview`, reuse: { shape: 'model', modelId }, derivative: { parentId: expectedId } };
}
