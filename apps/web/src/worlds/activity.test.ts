import { expect, it } from 'vitest';
import { changedObjects, roomActivity } from './activity';
import { createWorld } from './world';

it('does not highlight initial or newly visited rooms', () => {
  expect(changedObjects([], [createWorld()])).toEqual([]);
});
it('highlights additions and edits without marking unchanged objects', () => {
  const old = createWorld();
  const next = { ...old, objects: old.objects.map((object, index) => index === 0 ? { ...object, color: '#ffffff' } : object) };
  expect(changedObjects([old], [next])).toEqual([{ plotId: old.id, objectId: old.objects[0].id }]);
  expect(changedObjects([next], [next])).toEqual([]);
});
it('uses cloud event IDs even when snapshot-relative revision numbers change', () => {
  const room = { ...createWorld(), events: [{ id: 'event-1', revision: 2, author: 'Selene', message: 'Added a moon', at: '2026-09-06T00:00:00Z' }] };
  expect(roomActivity([room])[0].key).toBe(roomActivity([{ ...room, events: [{ ...room.events[0], revision: 3 }] }])[0].key);
});
it('sorts actions newest first and excludes seed events', () => {
  const room = { ...createWorld(), events: [
    { revision: 1, author: 'Selene', message: 'First', at: '2026-09-06T00:00:00Z' },
    { revision: 2, author: 'World seed', message: 'Seed', at: '2026-09-06T00:01:00Z' },
    { revision: 3, author: 'Helion', message: 'Second', at: '2026-09-06T00:02:00Z' },
  ] };
  expect(roomActivity([room]).map(event => event.message)).toEqual(['Second', 'First']);
});
