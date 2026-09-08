import { anyApi, type GenericActionCtx, type GenericDataModel } from 'convex/server';
import { digest, fail } from '../scene/model';

export function assetCapabilities(origin: string) {
  return {
    list: '/api/assets',
    uploadTicket: '/api/assets/upload-ticket',
    finalize: '/api/assets/finalize',
    uploadOrigin: new URL(origin).origin,
    sourceMaxBytes: 16_000_000,
    previewMaxBytes: 2_000_000,
    publication: 'Publish deliberately exported GLB, Blender source and PNG preview. Private session checkpoints are not public assets.',
    reuse: 'Place the returned modelId; download the shared source to create a new derivative bundle.',
    guide: '/agents/blender-assets.md',
  };
}

/** Canonical bundles extend model discovery without changing model placement IDs. */
export async function assetRoute(
  ctx: GenericActionCtx<GenericDataModel>, request: Request, parts: string[],
  url: URL, token: string | undefined, body: Record<string, unknown>,
): Promise<unknown | undefined> {
  if (parts[0] !== 'assets') return undefined;
  const assets = anyApi.cloud.assets;
  if (request.method === 'GET') {
    if (parts.length === 1) return ctx.runQuery(assets.list, { cursor: url.searchParams.get('cursor') ?? undefined });
    if (parts.length === 2 && parts[1] === 'capabilities') return assetCapabilities(url.origin);
    if (parts.length === 2) return ctx.runQuery(assets.get, { id: parts[1] });
    if (parts.length === 4 && parts[2] === 'files' && ['source', 'preview'].includes(parts[3])) {
      return ctx.runQuery(assets.file, { id: parts[1], role: parts[3] });
    }
  }
  if (request.method === 'POST' && parts.length === 2) {
    if (!token) fail('unauthorized', 'Register before publishing a shared asset.');
    if (parts[1] === 'upload-ticket') {
      const uploadToken = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
      const result = await ctx.runMutation(assets.begin, {
        token, ticketHash: await digest(uploadToken), modelId: body.modelId,
        metadata: { name: body.name, description: body.description, license: body.license, attribution: body.attribution, parentId: body.parentId },
        source: body.source, preview: body.preview,
      });
      return { ...result, uploadToken, uploadUrls: {
        source: new URL('/asset-upload/source', url).href,
        preview: new URL('/asset-upload/preview', url).href,
      } };
    }
    if (parts[1] === 'finalize') {
      if (typeof body.uploadToken !== 'string' || !/^[a-f0-9]{64}$/.test(body.uploadToken)) fail('invalid', 'Provide the publication upload token.');
      return ctx.runMutation(assets.finalize, { token, ticketHash: await digest(body.uploadToken) });
    }
  }
  fail('not_found', 'Unknown shared asset operation.');
}
