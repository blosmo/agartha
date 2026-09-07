import { CLOUD_MODE, ensureCloudSession } from './cloudMode';
import { useEffect, useRef, useState } from 'react';
import { addressFromId, plotId, type PlotAddress } from '../../../../packages/protocol/src/plots';
import type { SharedWorld, WorldEdit } from './world';
import type { PlotNeighborhood } from './plotTypes';
export async function plotRequest<T>(path: string, body?: unknown): Promise<T> {
  if(body!==undefined||path.endsWith('/preview'))await ensureCloudSession();
  if(CLOUD_MODE && body && typeof body==='object') { const value=body as Record<string,unknown>;body={...value,requestId:value.requestId??crypto.randomUUID(),issuedAt:value.issuedAt??Date.now()}; }
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(CLOUD_MODE?25000:10000) });
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
  const latest = useRef<SharedWorld | undefined>(undefined);
  const currentId = useRef(plotId(address));
  const id = plotId(address);
  currentId.current = id;
  function accept(next: SharedWorld) {
    acceptedGeneration.current++;
    setNeighborhood(current => current && (current.plots.some(p => p.id === next.id) || current.empty.some(p => p.id === next.id)) ? { ...current, plots: [...current.plots.filter(p => p.id !== next.id), next], empty: current.empty.filter(p => p.id !== next.id) } : current);
    if (next.id === currentId.current && (!latest.current || latest.current.id !== next.id || (next.cloud || next.revision >= latest.current.revision))) { latest.current = next; setWorld(next); }
  }
  function navigate(nextId: string, recenter = true) {
    const next = addressFromId(nextId);
    if (recenter) setViewCenter(next);
    currentId.current = nextId;latest.current = undefined;setWorld(undefined);setConnected(false);setAddress(next);
    const url = new URL(window.location.href);url.searchParams.set('plot', nextId);window.history.replaceState(null, '', url);
  }
  useEffect(() => {
    let cancelled = false;let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const generation=acceptedGeneration.current;
        const next = await plotRequest<PlotNeighborhood>(`/api/plots?x=${viewCenter.x}&z=${viewCenter.z}`);
        if (!cancelled && currentId.current === id && generation===acceptedGeneration.current) {
          // Keep a more recent accepted edit when an older poll completes afterward.
          if (latest.current?.id === id && !latest.current.cloud) next.plots = next.plots.map(p => p.id === id && latest.current!.revision >= p.revision ? latest.current! : p);
          const selected = next.plots.find(p => p.id === id);
          latest.current = selected;setWorld(selected);setNeighborhood(current => current && current.center.x === next.center.x && current.center.z === next.center.z && current.plots.length === next.plots.length && next.plots.every(p => current.plots.some(old => old.id === p.id && (p.cloud ? old.version === p.version : old.revision === p.revision))) && current.empty.length === next.empty.length && next.empty.every(p => current.empty.some(old => old.id === p.id)) ? current : next);setConnected(true);setConnectionError('');
        }
      } catch (error) { if (!cancelled) { setConnected(false);setConnectionError(error instanceof Error ? error.message : 'Unable to connect to the plots.'); } }
      if (!cancelled) timer = setTimeout(poll, 2000);
    }
    void poll();return () => { cancelled = true;clearTimeout(timer); };
  }, [viewCenter.x, viewCenter.z, id]);
  return { address, id, world, neighborhood, connected, connectionError, latest, accept, navigate };
}
