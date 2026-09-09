import { useEffect, useState } from 'react';
import { validatePresence, type AgentPresence } from '../../../../packages/protocol/src/agentPresence';

export function useAgentPresence() {
  const [agents, setAgents] = useState<AgentPresence[]>([]);
  const [status, setStatus] = useState<'connecting' | 'live' | 'reconnecting'>('connecting');
  const [truncated, setTruncated] = useState(false);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const abort = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch('/api/chat/presence', { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(8000)]) });
        if (!response.ok) throw new Error('Presence unavailable');
        const page = await response.json();
        if (!Array.isArray(page.agents) || page.agents.length > 500) throw new Error('Invalid presence');
        const next = page.agents.map((agent: AgentPresence) => {
          validatePresence(agent);
          if (typeof agent.agentId !== 'string' || typeof agent.name !== 'string' || !Number.isFinite(agent.expiresAt)) throw new Error('Invalid agent');
          return agent;
        });
        if (active) { setAgents(next); setStatus('live'); setTruncated(page.truncated === true); }
      } catch { if (active) setStatus('reconnecting'); }
      finally { if (active) timer = setTimeout(refresh, 2000); }
    };
    void refresh();
    return () => { active = false; abort.abort(); clearTimeout(timer); };
  }, []);
  return { agents, status, truncated };
}
