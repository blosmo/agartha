import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import { glbFixture } from '../packages/protocol/src/geometry/glbFixture';
import { canonicalAssetIdentity } from '../packages/protocol/src/canonicalAssets';
import { publishBlenderAsset, validateUploadUrl, type PublishOptions } from './lib/publishBlenderAsset';
const sha = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'agartha-publisher-')); dirs.push(dir);
  const model = glbFixture(), source = Buffer.from('BLENDER-v400exported source');
  const preview = PNG.sync.write(new PNG({width:1,height:1}));
  const options: PublishOptions = { server: 'https://agartha.example', token: 'a'.repeat(64), model: join(dir,'runtime.glb'), source: join(dir,'shared.blend'), preview: join(dir,'preview.png'), metadata: { name: 'Test pavilion', license: 'CC0' }, statePath: join(dir,'state.json') };
  await Promise.all([writeFile(options.model, model), writeFile(options.source, source), writeFile(options.preview, preview)]);
  const descriptors = { source: { sha256: sha(source), bytes: source.length }, preview: { sha256: sha(preview), bytes: preview.length } };
  const modelId = `model-${sha(model)}`, creatorAgentId = 'studio';
  const id = `bundle-${sha(canonicalAssetIdentity(creatorAgentId, modelId, options.metadata, descriptors.source, descriptors.preview))}`;
  const manifest = { id, creatorAgentId, modelId, metadata: options.metadata, ...descriptors };
  const calls: { url: string; init: RequestInit }[] = [];
  let modelExists = false, finalized = false;
  const behavior = { foreign: false, interrupted: false, loseModelReply: false, loseFinalizeReply: false, badManifest: false, corruptDownload: false, failDownload: false, expired: false, redirectUpload: false, alwaysExpired: false };
  const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = String(input); calls.push({ url, init }); const path = new URL(url).pathname;
    const auth = new Headers(init.headers).get('authorization');
    if (!init.method || init.method === 'GET') expect(auth).toBeNull();
    if (path.endsWith('/capabilities')) return response({ uploadOrigin: 'https://upload.example' });
    if (path === `/api/models/${modelId}`) return response({ id: modelId }, modelExists ? 200 : 404);
    if (path === '/api/models/upload-ticket') { expect(auth).toBe(`Bearer ${options.token}`); return response({ uploadToken: 'b'.repeat(64), uploadUrl: `https://${behavior.foreign ? 'evil' : 'upload'}.example/model-upload`, expiresAt: Date.now()+60_000 }); }
    if (path === '/model-upload') { expect(auth).toBe(`Bearer ${'b'.repeat(64)}`); expect(init.redirect).toBe('error'); if (behavior.redirectUpload) return new Response(null, { status: 302, headers: { location: 'https://evil.example' } }); modelExists = true; if (behavior.loseModelReply) throw new Error('secret upstream body'); return response({ id: modelId }); }
    if (path === '/api/assets/upload-ticket') { expect(auth).toBe(`Bearer ${options.token}`); return response({ id, uploadToken: 'c'.repeat(64), expiresAt: Date.now()+60_000, uploadUrls: { source: 'https://upload.example/asset-upload/source', preview: 'https://upload.example/asset-upload/preview' } }); }
    if (path.startsWith('/asset-upload/')) { expect(auth).toBe(`Bearer ${'c'.repeat(64)}`); expect(init.redirect).toBe('error'); if (behavior.expired || behavior.alwaysExpired) { behavior.expired = false; return response({}, 401); } if (behavior.interrupted && path.endsWith('/preview')) throw new Error('sensitive upstream error'); return response({}); }
    if (path === '/api/assets/finalize') { expect(auth).toBe(`Bearer ${options.token}`); finalized = true; if (behavior.loseFinalizeReply) throw new Error('lost reply'); return response(behavior.badManifest ? { ...manifest, metadata: { name: 'wrong' } } : manifest); }
    if (path === `/api/assets/${id}`) return response(behavior.badManifest ? { ...manifest, source: { ...descriptors.source, sha256: '0'.repeat(64) } } : manifest, finalized ? 200 : 404);
    if (path.includes('/files/')) return new Response(null, { status: 302, headers: { location: `https://storage.example/${path.endsWith('source') ? 'source' : 'preview'}` } });
    if (url.startsWith('https://storage.example/')) { if (behavior.failDownload) return response({}, 503); return new Response(new Uint8Array(behavior.corruptDownload ? Buffer.from('bad') : path.endsWith('source') ? source : preview)); }
    throw new Error('Unexpected request');
  };
  return { options, fetcher, calls, behavior, id };
}
it('publishes and independently verifies both public files without public credentials; clears scoped secrets on completion', async () => {
  const f = await fixture(); const result = await publishBlenderAsset(f.options, f.fetcher); expect(result.assetId).toBe(f.id);
  expect(f.calls.filter(c=>c.url.startsWith('https://storage.example'))).toHaveLength(2);
  const state = await readFile(f.options.statePath,'utf8'); expect(state).not.toContain(f.options.token); expect(state).not.toContain('c'.repeat(64)); expect(JSON.parse(state).complete).toBe(f.id); expect((await stat(f.options.statePath)).mode & 0o777).toBe(0o600);
  expect(JSON.stringify(result)).not.toContain(f.options.source);
});
it('rejects foreign upload origins before sending scoped or agent credentials', async () => {
  const f = await fixture(); f.behavior.foreign = true; await expect(publishBlenderAsset(f.options,f.fetcher)).rejects.toThrow('Untrusted upload endpoint'); expect(f.calls.some(c=>c.url.startsWith('https://evil'))).toBe(false);
});
it('rejects queries, credentials, deceptive paths and redirects on upload endpoints', async () => {
  for (const url of ['https://upload.example/model-upload?q=1','https://a@upload.example/model-upload','https://upload.example/other','https://upload.example/model-upload#x']) expect(()=>validateUploadUrl(url,'https://upload.example','/model-upload')).toThrow();
  const f = await fixture(); f.behavior.redirectUpload = true; await expect(publishBlenderAsset(f.options,f.fetcher)).rejects.toThrow('HTTP 302'); expect(f.calls.some(c=>c.url.startsWith('https://evil'))).toBe(false);
});
it('resumes interrupted artifact uploads using private durable tickets', async () => {
  const f = await fixture(); f.behavior.interrupted = true; await expect(publishBlenderAsset(f.options,f.fetcher)).rejects.toThrow('Network request failed'); const pending = await readFile(f.options.statePath,'utf8'); expect(pending).not.toContain(f.options.token); expect(JSON.parse(pending).complete).toBeUndefined(); expect((await stat(f.options.statePath)).mode & 0o777).toBe(0o600);
  f.behavior.interrupted = false; expect((await publishBlenderAsset(f.options,f.fetcher)).assetId).toBe(f.id); expect(f.calls.filter(c=>c.url.endsWith('/api/assets/upload-ticket'))).toHaveLength(1);
});
it('recovers lost model and finalize replies by their immutable IDs', async () => {
  const f = await fixture(); f.behavior.loseModelReply = true; f.behavior.loseFinalizeReply = true; expect((await publishBlenderAsset(f.options,f.fetcher)).assetId).toBe(f.id); expect(f.calls.filter(c=>c.url.endsWith('/api/assets/finalize'))).toHaveLength(1);
});
it('reissues an expired ticket once and completes safely', async () => {
  const f = await fixture(); f.behavior.expired = true; expect((await publishBlenderAsset(f.options,f.fetcher)).assetId).toBe(f.id); expect(f.calls.filter(c=>c.url.endsWith('/api/assets/upload-ticket'))).toHaveLength(2);
});
it.each(['model','source','preview'] as const)('rejects corrupt %s before writes or network', async role => {
  const f = await fixture(); await writeFile(f.options[role], 'corrupt'); await expect(publishBlenderAsset(f.options,f.fetcher)).rejects.toThrow(); expect(f.calls).toHaveLength(0); await expect(stat(f.options.statePath)).rejects.toMatchObject({code:'ENOENT'});
});
it('binds resume state to local file content and metadata', async () => {
  const f = await fixture(); f.behavior.interrupted = true; await expect(publishBlenderAsset(f.options,f.fetcher)).rejects.toThrow(); const count = f.calls.length; f.options.metadata.name = 'Changed'; await expect(publishBlenderAsset(f.options,f.fetcher)).rejects.toThrow('does not match'); expect(f.calls).toHaveLength(count);
});
it.each(['badManifest','corruptDownload','failDownload'] as const)('never reports completion after %s', async failure => {
  const f = await fixture(); f.behavior[failure] = true; await expect(publishBlenderAsset(f.options,f.fetcher)).rejects.toThrow(); expect(JSON.parse(await readFile(f.options.statePath,'utf8')).complete).toBeUndefined();
});

it('bounds expired-ticket retries and never reports incomplete publication as complete', async () => {
  const f = await fixture(); f.behavior.alwaysExpired = true; await expect(publishBlenderAsset(f.options,f.fetcher)).rejects.toThrow('HTTP 401'); expect(f.calls.filter(c=>c.url.endsWith('/api/assets/upload-ticket'))).toHaveLength(2); expect(JSON.parse(await readFile(f.options.statePath,'utf8')).complete).toBeUndefined();
});
