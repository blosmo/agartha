import type { IncomingMessage, ServerResponse } from 'node:http';
import { chatCursor, ChatValidationError } from '../../packages/protocol/src/chat';
import { ChatStore } from './chatStore';
import { streamChat } from './chatStream';
import { WorldError } from './src/worlds/world';

export function chatHandler(store: ChatStore) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    try {
      const host = req.headers.host ?? '';
      if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) || (req.headers.origin && req.headers.origin !== `http://${host}`)) throw new WorldError('Local access only.', 403);
      const url = new URL(req.url ?? '/', `http://${host}`);
      if (url.pathname === '/events' && req.method === 'GET') {
        await streamChat(req, res, url, (after, update, error) => store.subscribe(after, update, error));
        return;
      }
      const presence = url.pathname === '/presence';
      if (!presence && url.pathname !== '/' && url.pathname !== '') throw new WorldError('Not found.', 404);
      if (req.method === 'GET') { res.end(JSON.stringify(presence ? await store.presence.list() : await store.list(chatCursor(url)))); return; }
      if (req.method !== 'POST') throw new WorldError('Method not allowed.', 405);
      if (!req.headers['content-type']?.startsWith('application/json')) throw new WorldError('Use application/json.', 415);
      req.setEncoding('utf8');
      let raw = '';
      for await (const chunk of req) {
        raw += chunk.toString();
        if (Buffer.byteLength(raw) > 16_384) throw new WorldError('Chat request exceeds 16 KB.', 413);
      }
      let input;
      try { input = JSON.parse(raw); } catch { throw new WorldError('Expected a JSON object.', 400); }
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new WorldError('Expected a JSON object.', 400);
      res.end(JSON.stringify(presence ? await store.presence.update(input) : await store.send(input)));
    } catch (error) {
      if (res.headersSent) { res.end(); return; }
      res.statusCode = error instanceof WorldError ? error.status : error instanceof ChatValidationError ? 400 : 500;
      if (res.statusCode === 429) res.setHeader('Retry-After', '60');
      res.end(JSON.stringify({ error: res.statusCode === 500 ? 'Chat is unavailable. Try again.' : (error as Error).message }));
    }
  };
}
