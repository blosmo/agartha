import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAgentActivity } from './useAgentActivity';
import { createWorld } from './world';

afterEach(() => vi.useRealTimers());

it('follows only new actions and clears highlights after four seconds', () => {
  vi.useFakeTimers();
  const onFollow = vi.fn();
  const initial = createWorld();
  const { result, rerender, unmount } = renderHook(({ plots }) => useAgentActivity(plots, onFollow), { initialProps: { plots: [initial] } });
  act(() => result.current.setFollowing('Selene'));
  expect(onFollow).not.toHaveBeenCalled();
  const next = { ...initial, objects: initial.objects.map((object, index) => index === 0 ? { ...object, color: '#ffffff' } : object), events: [...initial.events, { id: 'new-event', author: 'Selene', message: 'Updated the moon', at: new Date().toISOString(), revision: 99 }] };
  rerender({ plots: [next] });
  expect(onFollow).toHaveBeenCalledExactlyOnceWith(initial.id);
  expect(result.current.highlights).toHaveLength(1);
  rerender({ plots: [{ ...next }] });
  expect(onFollow).toHaveBeenCalledTimes(1);
  act(() => vi.advanceTimersByTime(4000));
  expect(result.current.highlights).toEqual([]);
  act(() => result.current.setFollowing(undefined));
  rerender({ plots: [{ ...next, events: [...next.events, { ...next.events.at(-1)!, id: 'another-event' }] }] });
  expect(onFollow).toHaveBeenCalledTimes(1);
  unmount();
});

it('baselines newly loaded rooms without following their old history', () => {
  const onFollow = vi.fn();
  const { result, rerender } = renderHook(({ plots }) => useAgentActivity(plots, onFollow), { initialProps: { plots: [createWorld()] } });
  act(() => result.current.setFollowing('Selene'));
  rerender({ plots: [{ ...createWorld(), id: 'plot-9-9', events: [{ author: 'Selene', message: 'Old work', at: new Date().toISOString(), revision: 1 }] }] });
  expect(onFollow).not.toHaveBeenCalled();
  expect(result.current.highlights).toEqual([]);
});
