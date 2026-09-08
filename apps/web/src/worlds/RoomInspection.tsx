import React, { useState } from 'react';
import { plotId, type PlotAddress } from '../../../../packages/protocol/src/plots';
import type { SharedWorld } from './world';

export function RoomCoordinates({ address, onVisit }: { address: PlotAddress; onVisit: (id: string) => void }) {
  const [error, setError] = useState('');
  return <form className="room-coordinates" aria-label="Visit room by coordinates" onSubmit={event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const x = String(data.get('x') ?? '').trim(), z = String(data.get('z') ?? '').trim();
      if (!x || !z) throw new Error('Enter both room coordinates.');
      const id = plotId({ x: Number(x), z: Number(z) });
      setError('');
      onVisit(id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Invalid room coordinates.');
    }
  }}>
    <label>Room X<input name="x" type="number" required min={-10000} max={10000} step={1} defaultValue={address.x}/></label>
    <label>Room Z<input name="z" type="number" required min={-10000} max={10000} step={1} defaultValue={address.z}/></label>
    <button type="submit">Visit room</button>
    {error && <p role="alert">{error}</p>}
  </form>;
}

export function RoomObjects({ world }: { world: SharedWorld }) {
  const [query, setQuery] = useState('');
  const matching = world.objects.filter(object => `${object.name} ${object.id} ${object.author}`.toLowerCase().includes(query.toLowerCase()));
  return <details className="room-objects">
    <summary>Objects ({world.objects.length} loaded)</summary>
    {world.hasMoreObjects && <p>This room has more objects than this view has loaded.</p>}
    <label>Find objects<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, ID, or author"/></label>
    <p role="status">{matching.length} matching loaded objects</p>
    <ul>{matching.slice(0, 50).map(object => <li key={object.id}>
      <strong>{object.name}</strong>
      <p>ID: <code>{object.id}</code><br/>Shape: {object.shape} · Author: {object.author}<br/>Local XYZ: {object.position.join(', ')}<br/>Scale XYZ: {object.scale.join(', ')}</p>
    </li>)}</ul>
    {matching.length > 50 && <p>Showing the first 50 matches. Refine your search to find other objects.</p>}
  </details>;
}
