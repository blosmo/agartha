import { CLOUD_MODE, ensureCloudSession } from './cloudMode';
import { useEffect, useRef, useState } from 'react';
import { addressFromId, plotId, type PlotAddress } from '../../../../packages/protocol/src/plots';
import type { SharedWorld, WorldEdit } from './world';
import { streamNeighborhood } from './streamNeighborhood';
import type { PlotNeighborhood } from './plotTypes';
export async function plotRequest<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  if(body!==undefined||path.endsWith('/preview'))await ensureCloudSession();
  if(CLOUD_MODE && body && typeof body==='object') { const value=body as Record<string,unknown>;body={...value,requestId:value.requestId??crypto.randomUUID(),issuedAt:value.issuedAt??Date.now()}; }
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(CLOUD_MODE?25000:10000)]) : AbortSignal.timeout(CLOUD_MODE?25000:10000) });
  if (!response.ok) { const failure = await response.json().catch(() => ({})); throw new Error(failure.error ?? `Plot request failed (${response.status})`); }
  return response.json() as Promise<T>;
}
export function requestPlot(id: string, edit?: WorldEdit) { return plotRequest<SharedWorld>(`/api/plots/${id}`, edit); }
function initialAddress(): PlotAddress {
  try { return addressFromId(new URLSearchParams(window.location.search).get('plot') ?? (CLOUD_MODE ? 'plot-4--1' : 'the-commons')); } catch { return { x: 0, z: 0 }; }
}
export function usePlotWorld() {
  const [address, setAddress] = useState(initialAddress);
  const [viewCenter, setViewCenter] = useState(address);
  const [world, setWorld] = useState<SharedWorld>();
  const [neighborhood, setNeighborhood] = useState<PlotNeighborhood>();
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const acceptedGeneration=useRef(0);
  const neighborhoodCache=useRef(new Map<string,PlotNeighborhood>());
  const prefetchJob=useRef<{key:string;controller:AbortController}|undefined>(undefined);
  const prefetchedAt=useRef(new Map<string,number>());
  function remember(next:PlotNeighborhood) {
    const key=`${next.center.x}:${next.center.z}`;
    neighborhoodCache.current.delete(key);neighborhoodCache.current.set(key,next);
    while(neighborhoodCache.current.size>4){const oldest=neighborhoodCache.current.keys().next().value!;neighborhoodCache.current.delete(oldest);prefetchedAt.current.delete(oldest);}
  }
  async function prefetch(nextId:string) {
    const next=addressFromId(nextId),key=`${next.x}:${next.z}`;
    if(document.hidden||key===`${viewCenter.x}:${viewCenter.z}`||prefetchJob.current?.key===key||Date.now()-(prefetchedAt.current.get(key)??0)<4000)return;
    prefetchJob.current?.controller.abort();
    const job={key,controller:new AbortController()},generation=acceptedGeneration.current;
    prefetchJob.current=job;
    try {
      const loaded=await plotRequest<PlotNeighborhood>(`/api/plots?x=${next.x}&z=${next.z}&radius=2`,undefined,job.controller.signal);
      if(job.controller.signal.aborted||generation!==acceptedGeneration.current)return;
      remember(loaded);prefetchedAt.current.set(key,Date.now());
      setNeighborhood(current=>current?streamNeighborhood(current,loaded):current);
    } catch { /* Optional look-ahead never changes the connection state. */ }
    finally {if(prefetchJob.current===job)prefetchJob.current=undefined;}
  }
  useEffect(()=>()=>prefetchJob.current?.controller.abort(),[]);
  const latest = useRef<SharedWorld | undefined>(undefined);
  const currentId = useRef(plotId(address));
  const id = plotId(address);
  currentId.current = id;
  function accept(next: SharedWorld) {
    acceptedGeneration.current++;neighborhoodCache.current.clear();prefetchedAt.current.clear();prefetchJob.current?.controller.abort();
    setNeighborhood(current => current && (current.plots.some(p => p.id === next.id) || current.empty.some(p => p.id === next.id)) ? { ...current, plots: [...current.plots.filter(p => p.id !== next.id), next], empty: current.empty.filter(p => p.id !== next.id) } : current);
    if (next.id === currentId.current && (!latest.current || latest.current.id !== next.id || (next.cloud || next.revision >= latest.current.revision))) { latest.current = next; setWorld(next); }
  }
  function navigate(nextId: string, recenter = true) {
    const next = addressFromId(nextId);
    if (recenter) setViewCenter(next);
    const center=recenter?next:viewCenter;
    const cached=neighborhoodCache.current.get(`${center.x}:${center.z}`);
    const selected=cached?.plots.find(plot=>plot.id===nextId);
    currentId.current = nextId;latest.current = selected;setWorld(selected);setConnected(false);setAddress(next);
    if(cached)setNeighborhood(current=>streamNeighborhood(cached,current));
    const url = new URL(window.location.href);url.searchParams.set('plot', nextId);window.history.replaceState(null, '', url);
  }
  useEffect(() => {
    const controller=new AbortController();
    let cancelled = false;let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if(document.hidden){timer=setTimeout(poll,5000);return;}
      try {
        const generation=acceptedGeneration.current;
        const key=`${viewCenter.x}:${viewCenter.z}`;
        const cached=Date.now()-(prefetchedAt.current.get(key)??0)<4000?neighborhoodCache.current.get(key):undefined;
        const next = cached ?? await plotRequest<PlotNeighborhood>(`/api/plots?x=${viewCenter.x}&z=${viewCenter.z}&radius=2`,undefined,controller.signal);
        if (!cancelled && currentId.current === id && generation===acceptedGeneration.current) {
          // Keep a more recent accepted edit when an older poll completes afterward.
          if (latest.current?.id === id && !latest.current.cloud) next.plots = next.plots.map(p => p.id === id && latest.current!.revision >= p.revision ? latest.current! : p);
          remember(next);
          const selected = next.plots.find(p => p.id === id);
          latest.current = selected;setWorld(selected);setNeighborhood(previous => {const merged=streamNeighborhood(next,previous);return JSON.stringify(previous)===JSON.stringify(merged)?previous:merged;});setConnected(true);setConnectionError('');
        }
      } catch (error) { if (!cancelled) { setConnected(false);setConnectionError(error instanceof Error ? error.message : 'Unable to connect to the plots.'); } }
      if (!cancelled) timer = setTimeout(poll, 5000);
    }
    void poll();return () => { cancelled = true;controller.abort();clearTimeout(timer); };
  }, [viewCenter.x, viewCenter.z, id]);
  return { address, id, world, neighborhood, connected, connectionError, latest, accept, navigate, prefetch };
}
