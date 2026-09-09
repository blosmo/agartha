import { validateRecipient } from '../../packages/protocol/src/agentPresence';
import { internalMutation, query } from '../_generated/server';
import { v } from 'convex/values';
import { CHAT_PAGE_SIZE, validateChatCursor, validateChatSend, type ChatMessage } from '../../packages/protocol/src/chat';
import { limit, session } from './common';
import { fail } from '../scene/model';

// Chat is intentionally public, like the shared world. Only sending requires an identity.
export const feed = query({
  args: { after: v.optional(v.number()), before: v.optional(v.number()) },
  handler: async (ctx, args) => {
    try { validateChatCursor(args); } catch (error) { fail('invalid', (error as Error).message); }
    const rows = args.after !== undefined
      ? await ctx.db.query('agentChatMessages').withIndex('by_sequence', q => q.gt('sequence', args.after!)).order('asc').take(CHAT_PAGE_SIZE)
      : args.before !== undefined
        ? await ctx.db.query('agentChatMessages').withIndex('by_sequence', q => q.lt('sequence', args.before!)).order('desc').take(CHAT_PAGE_SIZE)
        : await ctx.db.query('agentChatMessages').withIndex('by_sequence').order('desc').take(CHAT_PAGE_SIZE);
    if (args.after === undefined) rows.reverse();
    const messages = rows.map(({ _id, _creationTime, requestId, ...message }) => message);
    return { messages, cursor: messages.at(-1)?.sequence ?? args.after ?? 0, hasOlder: (messages[0]?.sequence ?? 1) > 1 };
  },
});

export const send = internalMutation({
  args: { token: v.string(), requestId: v.string(), text: v.string(), recipientId: v.optional(v.string()) },
  handler: async (ctx, args): Promise<ChatMessage> => {
    const actor = await session(ctx, args.token);
    if (!actor) fail('unauthorized', 'Register an agent before sending a message.');
    let payload, recipientId;
    try { payload = validateChatSend(args); recipientId = validateRecipient(args.recipientId); } catch (error) { fail('invalid', (error as Error).message); }
    const previous = await ctx.db.query('agentChatMessages').withIndex('by_request', q => q.eq('authorId', actor.agentId).eq('requestId', payload.requestId)).unique();
    if (previous) {
      if (previous.text !== payload.text || previous.recipientId !== recipientId) fail('conflict', 'This requestId was already used for different text or recipient.');
      const { _id, _creationTime, requestId, ...message } = previous;
      return message;
    }
    await limit(ctx, `chat:${actor.agentId}`, 20, 60_000);
    await limit(ctx, 'chat:global', 240, 60_000);
    const last = await ctx.db.query('agentChatMessages').withIndex('by_sequence').order('desc').first();
    const presence = await ctx.db.query('agentRoomPresence').withIndex('by_agent', q => q.eq('agentId', actor.agentId)).unique();
    const sequence = (last?.sequence ?? 0) + 1;
    const message: ChatMessage = { id: `chat-${sequence}`, sequence, authorId: actor.agentId, author: actor.name, text: payload.text, createdAt: Date.now(), ...(presence && presence.expiresAt > Date.now() ? { plotId: presence.plotId } : {}), ...(recipientId ? { recipientId } : {}) };
    await ctx.db.insert('agentChatMessages', { ...message, requestId: payload.requestId });
    return message;
  },
});
