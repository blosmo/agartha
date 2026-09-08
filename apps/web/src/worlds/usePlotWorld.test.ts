import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { usePlotWorld } from './usePlotWorld';
import { createWorld } from './world';

afterEach(() => vi.unstubAllGlobals());

it('keeps the loaded neighborhood when selecting a room, but recenters on navigation', async () => {
  window.history.replaceState(null, '', '/?plot=plot-0-0');
  const plots = ['plot-0-0', 'plot-1-0', 'plot--1-0'].map(id => ({ ...createWorld(), id }));
  const fetchMock = vi.fn(async (path: string) => {
    const url = new URL(path, window.location.origin);
    return { ok: true, json: async () => ({ center: { x: Number(url.searchParams.get('x')), z: 0 }, plotSize: 32, plots, empty: [] }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  const { result, unmount } = renderHook(() => usePlotWorld());
  await waitFor(() => expect(result.current.connected).toBe(true));
  act(() => result.current.navigate('plot-1-0', false));
  await waitFor(() => expect(result.current.world?.id).toBe('plot-1-0'));
  expect(fetchMock).toHaveBeenLastCalledWith('/api/plots?x=0&z=0', expect.anything());
  expect(result.current.neighborhood?.plots.map(plot => plot.id)).toContain('plot--1-0');
  act(() => result.current.navigate('plot-1-0'));
  await waitFor(() => expect(result.current.neighborhood?.center.x).toBe(1));
  expect(fetchMock).toHaveBeenLastCalledWith('/api/plots?x=1&z=0', expect.anything());
  unmount();
});

it('aborts obsolete neighborhood reads and immediately restores a visited neighborhood', async () => {
  window.history.replaceState(null, '', '/?plot=the-commons');
  const signals: AbortSignal[]=[];
  let finishRefresh: (()=>void)|undefined;
  let visits=0;
  vi.stubGlobal('fetch',vi.fn(async (path:string,options:RequestInit)=>{
    signals.push(options.signal as AbortSignal);
    const x=Number(new URL(path,window.location.origin).searchParams.get('x'));
    if(x===0&&++visits>1)await new Promise<void>(resolve=>{finishRefresh=resolve;});
    return {ok:true,json:async()=>({center:{x,z:0},plotSize:32,plots:[{...createWorld(),id:x===0?'the-commons':'plot-1-0'}],empty:[]})};
  }));
  const {result,unmount}=renderHook(()=>usePlotWorld());
  await waitFor(()=>expect(result.current.connected).toBe(true));
  act(()=>result.current.navigate('plot-1-0'));
  expect(signals[0].aborted).toBe(true);
  await waitFor(()=>expect(result.current.neighborhood?.center.x).toBe(1));
  act(()=>result.current.navigate('the-commons'));
  expect(result.current.neighborhood?.center.x).toBe(0);
  expect(result.current.world?.id).toBe('the-commons');
  unmount();finishRefresh?.();
});
