import { useEffect, useState } from 'react';
import type { ChatMessage } from '../../../../packages/protocol/src/chat';

export function useAgentChat(enabled = true) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<'connecting' | 'live' | 'reconnecting'>('connecting');
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const stream = new EventSource('/api/chat/events');
    stream.onmessage = event => {
      if (!active) return;
      try {
        const message: ChatMessage = JSON.parse(event.data);
        if (!Number.isSafeInteger(message.sequence) || message.sequence < 1 || typeof message.id !== 'string' || typeof message.authorId !== 'string' || !Number.isFinite(message.createdAt) || Math.abs(message.createdAt) > 8.64e15 || typeof message.text !== 'string' || typeof message.author !== 'string') throw new Error('Invalid message');
        setMessages(current => current.some(item => item.id === message.id) ? current : [...current, message].sort((a, b) => a.sequence - b.sequence).slice(-200));
      } catch { setStatus('reconnecting'); }
    };
    stream.addEventListener('ready', () => { if (active) setStatus('live'); });
    stream.addEventListener('chat-error', () => { if (active) setStatus('reconnecting'); });
    stream.onerror = () => { if (active) setStatus('reconnecting'); };
    return () => { active = false; stream.close(); };
  }, [enabled]);
  return { messages, status };
}
