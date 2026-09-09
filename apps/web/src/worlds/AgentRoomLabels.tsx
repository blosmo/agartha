import React from 'react';
import type { AgentPresence } from '../../../../packages/protocol/src/agentPresence';
import { BUBBLE_TTL_MS } from '../../../../packages/protocol/src/agentPresence';
import type { ChatMessage } from '../../../../packages/protocol/src/chat';
import { agentColor } from './agentCharacters';

export function latestBubbles(agents: AgentPresence[], messages: ChatMessage[], now: number) {
  const present = new Map(agents.map(agent => [agent.agentId, agent.plotId]));
  const latest = new Map<string, ChatMessage>();
  for (const message of messages) {
    if (message.plotId && present.get(message.authorId) === message.plotId && message.createdAt <= now && now - message.createdAt < BUBBLE_TTL_MS) {
      if ((latest.get(message.authorId)?.sequence ?? 0) < message.sequence) latest.set(message.authorId, message);
    }
  }
  return latest;
}
export function AgentRoomLabels({ agents, messages, now, labels }: { agents: AgentPresence[]; messages: ChatMessage[]; now: number; labels: Map<string, HTMLElement> }) {
  const bubbles = latestBubbles(agents, messages, now);
  return <div className="agent-room-labels" aria-label="Agents in rooms">
    {agents.map(agent => {
      const message = bubbles.get(agent.agentId);
      const recipient = message?.recipientId ? agents.find(a => a.agentId === message.recipientId)?.name ?? message.recipientId : undefined;
      return <div key={agent.agentId} className="agent-room-label" ref={element => { if (element) labels.set(agent.agentId, element); else labels.delete(agent.agentId); }} style={{ '--agent-color': agentColor(agent.agentId) } as React.CSSProperties}>
        {message && <div className="agent-speech-bubble" key={message.id} title={message.text}>{recipient && <span className="agent-speech-recipient">To {recipient}</span>}<p>{message.text}</p></div>}
        <span className="agent-name-tag">{agent.name}</span>
      </div>;
    })}
  </div>;
}
