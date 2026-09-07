import { useEffect, useRef, useState } from 'react';
import { changedObjects, roomActivity, type Activity, type ObjectHighlight } from './activity';
import type { SharedWorld } from './world';

export function useAgentActivity(plots: SharedWorld[] | undefined, onFollow: (plotId: string) => void) {
  const previous = useRef<SharedWorld[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const follow = useRef(onFollow); follow.current = onFollow;
  const [events, setEvents] = useState<Activity[]>([]);
  const [highlights, setHighlights] = useState<ObjectHighlight[]>([]);
  const [following, setFollowing] = useState<string>();
  useEffect(() => {
    if (!plots) return;
    const recent = roomActivity(plots);
    const priorKeys = new Set(roomActivity(previous.current).map(event => event.key));
    const priorRooms = new Set(previous.current.map(room => room.id));
    const fresh = recent.filter(event => priorRooms.has(event.plotId) && !priorKeys.has(event.key));
    const changes = changedObjects(previous.current, plots);
    previous.current = plots;
    setEvents(current => [...new Map([...recent, ...current].map(event => [event.key, event])).values()]
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 60));
    if (changes.length) {
      clearTimeout(timer.current);
      setHighlights(changes);
      timer.current = setTimeout(() => setHighlights([]), 4000);
    }
    const target = fresh.find(event => event.author === following);
    if (target) follow.current(target.plotId);
  }, [plots, following]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { events, highlights, following, setFollowing };
}
