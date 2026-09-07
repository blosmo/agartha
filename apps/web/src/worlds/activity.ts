import type { SharedWorld } from './world';

export type Activity = { key: string; plotId: string; room: string; author: string; message: string; at: string };
export type ObjectHighlight = { plotId: string; objectId: string };

export function roomActivity(plots: SharedWorld[]): Activity[] {
  return plots.flatMap(plot => plot.events.filter(event => event.author !== 'World seed').map(event => ({
    key: `${plot.id}:${event.id ?? `${event.at}:${event.revision}:${event.author}:${event.message}`}`,
    plotId: plot.id, room: plot.name, author: event.author, message: event.message, at: event.at,
  }))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 60);
}

export function changedObjects(previous: SharedWorld[], next: SharedWorld[]): ObjectHighlight[] {
  const rooms = new Map(previous.map(room => [room.id, room]));
  return next.flatMap(room => {
    const old = rooms.get(room.id);
    if (!old) return []; // Arriving in a room is not a building action.
    const objects = new Map(old.objects.map(object => [object.id, object]));
    return room.objects.filter(object => JSON.stringify(objects.get(object.id)) !== JSON.stringify(object))
      .map(object => ({ plotId: room.id, objectId: object.id }));
  });
}
