import { localAgentId, PresenceStore } from './presenceStore';
import { validateRecipient } from '../../packages/protocol/src/agentPresence';
import { randomUUID } from 'node:crypto';
import { watch } from 'node:fs';
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { CHAT_PAGE_SIZE, localChatAuthor, validateChatCursor, validateChatSend, type ChatCursor, type ChatMessage, type ChatPage } from '../../packages/protocol/src/chat';
import { WorldError } from './src/worlds/world';

type StoredMessage = ChatMessage & { requestId: string };

/** Atomic files and an exclusive writer lock keep multiple local previews consistent. */
export class ChatStore {
  readonly presence: PresenceStore;
  constructor(private file: string) { this.presence = new PresenceStore(`${file}.presence.json`); }

  private async read(): Promise<StoredMessage[]> {
    try {
      const value = JSON.parse(await readFile(this.file, 'utf8'));
      if (value.schema !== 1 || !Array.isArray(value.messages) || value.messages.some((m: StoredMessage, i: number) => m.sequence !== i + 1)) throw new Error('Invalid chat history.');
      return value.messages;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  async list(cursor: ChatCursor = {}): Promise<ChatPage> {
    validateChatCursor(cursor);
    const all = await this.read();
    const messages = cursor.after !== undefined ? all.filter(m => m.sequence > cursor.after!).slice(0, CHAT_PAGE_SIZE)
      : all.filter(m => cursor.before === undefined || m.sequence < cursor.before).slice(-CHAT_PAGE_SIZE);
    return {
      messages: messages.map(({ requestId: _, ...message }) => message),
      cursor: messages.at(-1)?.sequence ?? cursor.after ?? 0,
      hasOlder: (messages[0]?.sequence ?? 1) > 1,
    };
  }

  async send(input: { requestId: unknown; text: unknown; author: unknown; recipientId?: unknown }): Promise<ChatMessage> {
    const { requestId, text } = validateChatSend(input), author = localChatAuthor(input.author);
    const authorId = localAgentId(author), recipientId = validateRecipient(input.recipientId);
    await mkdir(dirname(this.file), { recursive: true });
    const lockPath = `${this.file}.lock`;
    let lock;
    for (let attempt = 0; !lock && attempt < 50; attempt++) {
      try { lock = await open(lockPath, 'wx'); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        await delay(20);
      }
    }
    if (!lock) throw new WorldError('Chat storage is busy. Retry the same request.', 503);
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      await lock.writeFile(JSON.stringify({ pid: process.pid }));
      const messages = await this.read();
      const previous = messages.find(m => m.authorId === authorId && m.requestId === requestId);
      if (previous) {
        if (previous.text !== text || previous.recipientId !== recipientId) throw new WorldError('This requestId was already used for different text or recipient.', 409);
        const { requestId: _, ...message } = previous;
        return message;
      }
      const now = Date.now();
      if (messages.filter(m => m.authorId === authorId && m.createdAt > now - 60_000).length >= 20) throw new WorldError('Send at most 20 messages per minute.', 429);
      const presence = (await this.presence.list()).agents.find(a => a.agentId === authorId);
      const sequence = messages.length + 1;
      const message: ChatMessage = { id: `chat-${sequence}`, sequence, authorId, author, text, createdAt: now, ...(presence ? { plotId: presence.plotId } : {}), ...(recipientId ? { recipientId } : {}) };
      await writeFile(temporary, JSON.stringify({ schema: 1, messages: [...messages, { ...message, requestId }] }));
      await rename(temporary, this.file);
      return message;
    } finally {
      await unlink(temporary).catch(() => {});
      await lock.close();
      await unlink(lockPath);
    }
  }

  subscribe(after: number | undefined, update: (page: ChatPage) => void, error: (failure: unknown) => void): () => void {
    let closed = false, running = false, pending = false;
    let watcher: ReturnType<typeof watch> | undefined;
    const refresh = async () => {
      if (closed) return;
      if (running) { pending = true; return; }
      running = true;
      try {
        do {
          pending = false;
          const page = await this.list({ after });
          if (!closed) update(page);
        } while (pending && !closed);
      } catch (failure) { if (!closed) error(failure); }
      finally { running = false; }
    };
    void mkdir(dirname(this.file), { recursive: true }).then(() => {
      if (closed) return;
      watcher = watch(dirname(this.file), (_event, name) => { if (!name || name.toString() === basename(this.file)) void refresh(); });
      watcher.on('error', error);
      void refresh();
    }).catch(error);
    return () => { closed = true; watcher?.close(); };
  }
}
