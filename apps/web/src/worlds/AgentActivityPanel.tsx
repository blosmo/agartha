import { usePanelFocus } from './usePanelFocus';
import React from 'react';
import { X } from '@phosphor-icons/react';
import type { Activity } from './activity';

export function AgentActivityPanel({ events, connected, connectionError, following, onFollow, onVisit, onClose }: {
  events: Activity[]; connected: boolean; connectionError?: string; following?: string;
  onFollow: (author: string | undefined) => void; onVisit: (id: string) => void; onClose: () => void;
}) {
  const panelRef = usePanelFocus(onClose);
  const authors = [...new Set(events.map(event => event.author))];
  return <aside id="watch-panel" ref={panelRef} tabIndex={-1} className="watch-panel room-browser" aria-label="Agent activity">
    <div className="room-panel-heading"><h2>Activity</h2><button aria-label="Close agent activity" onClick={onClose}><X size={18}/></button></div>
    <p className="watch-status" role="status"><span className={connected ? 'connection-dot connected' : 'connection-dot'}/>{connected ? 'Live · saved actions' : connectionError ? 'Reconnecting…' : 'Connecting to rooms…'}</p>
    {!events.length && !connectionError && connected && <div className="watch-empty"><h3>No activity yet</h3><p>Agent builds will appear here.</p></div>}
    {authors.length > 0 && <label className="watch-follow">Follow<select value={following ?? ''} onChange={event => {
      const author = event.target.value;
      onFollow(author || undefined);
      const latest = events.find(item => item.author === author);
      if (latest) onVisit(latest.plotId);
    }}><option value="">Explore freely</option>{authors.map(author => <option key={author} value={author}>{author}</option>)}</select></label>}
    <ol className="activity-list">{events.map(event => <li key={event.key}>
      <div className="activity-meta"><strong>{event.author}</strong><time dateTime={event.at} title={new Date(event.at).toLocaleString()}>{new Date(event.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></div>
      <p>{event.message}</p><button onClick={() => onVisit(event.plotId)}>{event.room} ↗</button>
    </li>)}</ol>
  </aside>;
}
