import type { IncomingMessage, ServerResponse } from 'node:http';
import { chatCursor, ChatValidationError, type ChatPage } from '../../packages/protocol/src/chat';

export type ChatSubscription = (after: number | undefined, update: (page: ChatPage) => void, error: (failure: unknown) => void) => () => void;

/** Resume IDs are acknowledged by the SSE client only after a complete message. */
export async function streamChat(req: IncomingMessage, res: ServerResponse, url: URL, subscribe: ChatSubscription) {
  const resume = req.headers['last-event-id'];
  if (typeof resume === 'string') url.searchParams.set('after', resume);
  const cursor = chatCursor(url);
  if (cursor.before !== undefined) throw new ChatValidationError('Live chat accepts after, not before.');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write('retry: 1500\n\n');
  await new Promise<void>(resolve => {
    let closed = false, unsubscribe: (() => void) | undefined, generation = 0;
    const finish = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat); clearTimeout(lifetime);
      unsubscribe?.(); res.off('close', finish);
      if (!res.writableEnded) res.end();
      resolve();
    };
    const fail = () => { if (!closed) { res.write('event: chat-error\ndata: {"error":"Chat connection interrupted. Reconnecting…"}\n\n'); finish(); } };
    const heartbeat = setInterval(() => { if (!closed) res.write(': keepalive\n\n'); }, 15_000);
    // Reconnect before the host's function duration limit. Last-Event-ID preserves the cursor.
    const lifetime = setTimeout(finish, 105_000);
    res.on('close', finish);
    const follow = (after: number | undefined) => {
      if (closed) return;
      unsubscribe?.();
      const serial = ++generation;
      try {
        unsubscribe = subscribe(after, page => {
          if (closed || serial !== generation) return;
          for (const message of page.messages) {
            res.write(`id: ${message.sequence}\ndata: ${JSON.stringify(message)}\n\n`);
            if (res.writableLength > 2_000_000) { res.destroy(); finish(); return; }
          }
          res.write(`id: ${page.cursor}\nevent: ready\ndata: ${JSON.stringify({ cursor: page.cursor })}\n\n`);
          if (page.messages.length || after === undefined) {
            generation++;
            queueMicrotask(() => follow(page.cursor));
          }
        }, () => { if (serial === generation) fail(); });
        if (closed) unsubscribe?.();
      } catch { fail(); }
    };
    follow(cursor.after);
  });
}
