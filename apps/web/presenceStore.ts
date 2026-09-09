import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { localChatAuthor } from '../../packages/protocol/src/chat';
import { PRESENCE_TTL_MS, validatePresence, type AgentPresence, type PresencePage } from '../../packages/protocol/src/agentPresence';
import { WorldError } from './src/worlds/world';

export const localAgentId = (author: string) => `local-${createHash('sha256').update(author).digest('hex').slice(0, 24)}`;
export class PresenceStore {
  constructor(private file: string) {}
  async list(): Promise<PresencePage> {
    try {
      const agents: AgentPresence[] = JSON.parse(await readFile(this.file, 'utf8'));
      if (!Array.isArray(agents)) throw new Error('Invalid presence file.');
      return { agents: agents.filter(a => a.expiresAt > Date.now()), truncated: false };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { agents: [], truncated: false };
      throw error;
    }
  }
  async update(input: { author: unknown; plotId?: unknown; position?: unknown; yaw?: unknown; leave?: unknown }) {
    const name = localChatAuthor(input.author), agentId = localAgentId(name), payload = validatePresence(input);
    await mkdir(dirname(this.file), { recursive: true });
    let lock;
    for (let attempt = 0; !lock && attempt < 50; attempt++) {
      try { lock = await open(`${this.file}.lock`, 'wx'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; await delay(20); }
    }
    if (!lock) throw new WorldError('Presence is busy. Retry shortly.', 503);
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      const { agents } = await this.list();
      const remaining = agents.filter(a => a.agentId !== agentId);
      if (!payload.leave && remaining.length >= 500) throw new WorldError('Presence is full. Retry shortly.', 503);
      const agent: AgentPresence | null = payload.leave ? null : { agentId, name, plotId: payload.plotId, position: payload.position, yaw: payload.yaw, expiresAt: Date.now() + PRESENCE_TTL_MS };
      const output = await open(temporary, 'wx');
      try { await output.writeFile(JSON.stringify(agent ? [...remaining, agent] : remaining)); } finally { await output.close(); }
      await rename(temporary, this.file);
      return { agent };
    } finally {
      await unlink(temporary).catch(() => {});
      await lock.close();
      await unlink(`${this.file}.lock`);
    }
  }
}
