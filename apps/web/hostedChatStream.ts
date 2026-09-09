import { ConvexClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { chatCursor, ChatValidationError } from '../../packages/protocol/src/chat.js';
import { streamChat } from './chatStream.js';

export function chatDeploymentUrl(siteUrl: string) {
  if (process.env.AGARTHA_CONVEX_URL) return process.env.AGARTHA_CONVEX_URL;
  const site = new URL(siteUrl);
  if (site.protocol !== 'https:' || !site.hostname.endsWith('.convex.site')) throw new Error('Set AGARTHA_CONVEX_URL for live chat on a custom deployment.');
  site.hostname = site.hostname.replace(/\.convex\.site$/, '.convex.cloud');
  return site.origin;
}

export async function hostedChatStream(req: IncomingMessage, res: ServerResponse, url: URL, siteUrl: string) {
  const after = req.headers['last-event-id'];
  if (typeof after === 'string') url.searchParams.set('after', after);
  if (chatCursor(url).before !== undefined) throw new ChatValidationError('Live chat accepts after, not before.');
  const client = new ConvexClient(chatDeploymentUrl(siteUrl));
  try {
    await streamChat(req, res, url, (cursor, update, error) => {
      const stopConnection = client.subscribeToConnectionState(state => {
        if (!state.isWebSocketConnected && (state.hasEverConnected || state.connectionRetries > 0)) error(new Error('Chat backend disconnected.'));
      });
      const stopQuery = client.onUpdate(anyApi.cloud.chat.feed, cursor === undefined ? {} : { after: cursor }, update, error);
      return () => { stopConnection(); stopQuery(); };
    });
  } finally { await client.close(); }
}
