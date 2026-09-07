import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorldPreview } from './worldPreview';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { applyWorldEdit, createWorld, WorldError, type SharedWorld } from './src/worlds/world';

export function worldSpacePlugin(file: string): Plugin {
  let queue: Promise<unknown> = Promise.resolve();
  const preview = createWorldPreview(resolve(dirname(fileURLToPath(import.meta.url)), '../../packages/renderer/render.ts'));
  async function read(): Promise<SharedWorld> {
    try {
      const world = JSON.parse(await readFile(file, 'utf8')) as SharedWorld;
      if (world.schema !== 1 || !Array.isArray(world.objects) || !Number.isSafeInteger(world.revision)) throw new Error('Unsupported world file');
      return world;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const seed = createWorld();
      await save(seed);
      return seed;
    }
  }
  async function save(world: SharedWorld) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(`${file}.tmp`, JSON.stringify(world), 'utf8');
    await rename(`${file}.tmp`, file);
  }
  async function handle(req: IncomingMessage, res: ServerResponse) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (req.method !== 'GET' && req.method !== 'POST') throw new WorldError('Method not allowed', 405);
      // This is a trusted local workspace, never a public write API.
      const host = req.headers.host ?? '';
      if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) throw new WorldError('Local access only', 403);
      if (req.headers.origin && req.headers.origin !== `http://${host}`) throw new WorldError('Cross-origin access is not allowed', 403);
      const path = (req.url ?? '/').split('?')[0];
      if (path === '/preview') {
        if (req.method !== 'GET') throw new WorldError('Method not allowed', 405);
        const snapshot = queue.then(read);
        queue = snapshot.catch(() => {});
        const world = await snapshot;
        try {
          const png = await preview(world);
          res.setHeader('Content-Type', 'image/png');
          res.setHeader('X-Agartha-Revision', String(world.revision));
          res.setHeader('X-Agartha-Renderer', 'vgpu');
          res.end(png);
        } catch (error) { throw new WorldError(error instanceof Error ? error.message : 'Preview rendering failed', 503); }
        return;
      }
      if (path !== '/' && path !== '') throw new WorldError('Not found', 404);
      let input: unknown;
      if (req.method === 'POST') {
        if (!req.headers['content-type']?.startsWith('application/json')) throw new WorldError('Use application/json', 415);
        let body = '';
        for await (const chunk of req) {
          body += chunk.toString();
          if (Buffer.byteLength(body) > 65536) throw new WorldError('Edit exceeds 64 KB', 413);
        }
        try { input = JSON.parse(body); } catch { throw new WorldError('Invalid JSON'); }
      }
      // Serialize reads and writes so every accepted revision is durable and unique.
      const transaction = queue.then(async () => {
        const world = await read();
        if (req.method === 'GET') return world;
        const next = applyWorldEdit(world, input);
        await save(next);
        return next;
      });
      queue = transaction.catch(() => {});
      res.end(JSON.stringify(await transaction));
    } catch (error) {
      res.statusCode = error instanceof WorldError ? error.status : 500;
      res.end(JSON.stringify({ error: error instanceof WorldError ? error.message : 'Unable to read or persist the shared world' }));
    }
  }
  return {
    name: 'agartha-shared-world',
    configureServer(server) { server.middlewares.use('/api/world', (req, res) => { void handle(req, res); }); },
    configurePreviewServer(server) { server.middlewares.use('/api/world', (req, res) => { void handle(req, res); }); },
  };
}
