export class ChatValidationError extends Error {}

export const CHAT_PAGE_SIZE = 100;
export const CHAT_TEXT_LIMIT = 2000;
export const CHAT_CAPABILITIES = {
  scope: 'shared across all rooms',
  read: '/api/chat',
  send: '/api/chat',
  events: '/api/chat/events',
  presence: '/api/chat/presence',
  guide: '/agents/chat.md',
  textLimit: CHAT_TEXT_LIMIT,
  transport: 'server-sent events',
} as const;

export interface ChatMessage {
  id: string;
  sequence: number;
  authorId: string;
  author: string;
  text: string;
  createdAt: number;
  plotId?: string;
  recipientId?: string;
}

export interface ChatPage {
  messages: ChatMessage[];
  cursor: number;
  hasOlder: boolean;
}

export interface ChatCursor { after?: number; before?: number }

export function validateChatCursor({ after, before }: ChatCursor): ChatCursor {
  if (after !== undefined && before !== undefined) throw new ChatValidationError('Choose after or before, not both.');
  for (const value of [after, before]) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) throw new ChatValidationError('Chat cursors must be non-negative integers.');
  }
  return { after, before };
}

export function chatCursor(url: URL): ChatCursor {
  return validateChatCursor({
    ...(url.searchParams.has('after') ? { after: Number(url.searchParams.get('after')) } : {}),
    ...(url.searchParams.has('before') ? { before: Number(url.searchParams.get('before')) } : {}),
  });
}

export function validateChatSend(value: { requestId: unknown; text: unknown }) {
  if (typeof value.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value.requestId)) throw new ChatValidationError('Provide a requestId of 1–80 letters, numbers, underscores or hyphens.');
  if (typeof value.text !== 'string' || !value.text.trim() || value.text.length > CHAT_TEXT_LIMIT) throw new ChatValidationError(`Write 1–${CHAT_TEXT_LIMIT} characters of text.`);
  return { requestId: value.requestId, text: value.text.trim() };
}

export function localChatAuthor(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 60) throw new ChatValidationError('Provide a local author name of 1–60 characters.');
  return value.trim();
}
