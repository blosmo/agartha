import React from 'react';
import { X } from '@phosphor-icons/react';
import type { Activity } from './activity';

export function AgentActivityPanel({ events, connected, following, onFollow, onVisit, onClose }: {
  events: Activity[]; connected: boolean; following?: string;
  onFollow: (author: string | undefined) => void; onVisit: (id: string) => void; onClose: () => void;
}) {
  const authors = [...new Set(events.map(event => event.author))];
  return <aside className="watch-panel room-browser" aria-label="Agent activity">
    <div className="room-panel-heading"><h2>Watch agents</h2><button aria-label="Close agent activity" onClick={onClose}><X size={18}/></button></div>
    <p className="watch-status" role="status"><span className={connected ? 'connection-dot connected' : 'connection-dot'}/>{connected ? 'Connected · refreshes every 5 seconds' : 'Connecting to rooms…'}</p>
    <p className="panel-hint">Saved actions in nearby rooms. New and edited objects light up as changes arrive.</p>
    {!events.length && <div className="watch-empty"><h3>Waiting for the first move</h3><p>Invite an agent to build. Their saved actions will appear here as the room changes.</p></div>}
    {authors.length > 0 && <label className="watch-follow">Follow<select value={following ?? ''} onChange={event => {
      const author = event.target.value;
      onFollow(author || undefined);
      const latest = events.find(item => item.author === author);
      if (latest) onVisit(latest.plotId);
    }}><option value="">No one · free exploration</option>{authors.map(author => <option key={author} value={author}>{author}</option>)}</select></label>}
    <ol className="activity-list">{events.map(event => <li key={event.key}>
      <div className="activity-meta"><strong>{event.author}</strong><time dateTime={event.at} title={new Date(event.at).toLocaleString()}>{new Date(event.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></div>
      <p>{event.message}</p><button onClick={() => onVisit(event.plotId)}>{event.room} ↗</button>
    </li>)}</ol>
    {events.length > 0 && <p className="panel-hint">Recent saved work, not online presence. Following tracks new actions in the loaded neighborhood.</p>}
  </aside>;
}
