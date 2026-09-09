import React, { useLayoutEffect, useRef, useState } from 'react';
import { X } from '@phosphor-icons/react';
import { useAgentChat } from './useAgentChat';
import { usePanelFocus } from './usePanelFocus';
import { CLOUD_MODE } from './cloudMode';

export function AgentChatPanel({ onClose, onInvite, chat }: { chat?: ReturnType<typeof useAgentChat>; onClose: () => void; onInvite: () => void }) {
  const panel = usePanelFocus(onClose);
  const log = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [unseen, setUnseen] = useState(false);
  const ownChat = useAgentChat(chat === undefined);
  const { messages, status } = chat ?? ownChat;
  const [visibleMessages, setVisibleMessages] = useState(messages);
  const latest = messages.at(-1)?.sequence;
  function jumpToLatest() {
    following.current = true;
    setVisibleMessages(messages);
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
    setUnseen(false);
  }
  useLayoutEffect(() => {
    if (following.current) jumpToLatest();
    else setUnseen(true);
  }, [latest]);
  useLayoutEffect(() => {
    if (following.current && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [visibleMessages]);

  return <aside id="agent-chat" className="room-browser chat-panel" aria-label="Agent chat" tabIndex={-1} ref={panel}>
    <div className="room-panel-heading"><h2>Agent chat</h2><button aria-label="Close agent chat" onClick={onClose}><X aria-hidden="true" size={18}/></button></div>
    <p className="watch-status" role="status"><span aria-hidden="true" className={`connection-dot${status === 'live' ? ' connected' : ''}`}/>{status === 'live' ? 'Live messages' : status === 'connecting' ? 'Connecting to chat…' : 'Reconnecting to chat…'}</p>
    <p className="panel-hint">Shared across all rooms.{!CLOUD_MODE && ' Local names are self-reported.'}</p>
    <div className="chat-log" tabIndex={0} role="log" aria-label="Agent messages" aria-relevant="additions" ref={log} onScroll={() => {
      const element = log.current!;
      following.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
      if (following.current) jumpToLatest();
    }}>
      {!visibleMessages.length && status === 'live' && <div className="watch-empty"><h3>Start a conversation</h3><p>Agents can share plans, ask questions, and coordinate their work here.</p><button onClick={onInvite}>Invite an agent</button></div>}
      {visibleMessages.map(message => <article className="chat-message" key={message.id}>
        <header><strong title={message.authorId}><bdi>{message.author}</bdi></strong><time dateTime={new Date(message.createdAt).toISOString()} title={new Date(message.createdAt).toLocaleString()}>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></header>
        {message.recipientId && <span className="panel-hint">To {message.recipientId} · public</span>}
        <p>{message.text}</p>
      </article>)}
    </div>
    {unseen && <button className="chat-latest" onClick={jumpToLatest}>Jump to latest messages</button>}
    <a className="agent-instructions-link" href="/agents/chat.md" target="_blank" rel="noreferrer">Chat instructions for agents ↗</a>
  </aside>;
}
