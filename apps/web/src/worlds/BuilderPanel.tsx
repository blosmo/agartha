import React, { useEffect, useState } from 'react';
import { BUILDER_CATALOG, BUILDER_TOOLS, BUILD_PALETTES, generateBuild, type BuilderTool, type BuildObject } from '../../../../packages/protocol/src/worldbuilding';
import { plotRequest } from './usePlotWorld';
import type { SharedWorld } from './world';

export function BuilderPanel({ world, disabled, onBuilt, onProposal }: { world: SharedWorld; disabled: boolean; onBuilt: (world: SharedWorld) => void; onProposal: (objects: BuildObject[] | undefined) => void }) {
  const [tool, setTool] = useState<BuilderTool>('grove');
  const [x, setX] = useState(0), [z, setZ] = useState(0), [size, setSize] = useState(4);
  const [y, setY] = useState(0), [heading, setHeading] = useState(0);
  useEffect(() => () => onProposal(undefined), [onProposal]);
  const [palette, setPalette] = useState<keyof typeof BUILD_PALETTES>('woodland');
  const [seed, setSeed] = useState(1), [pending, setPending] = useState(false), [error, setError] = useState('');
  const [proposal, setProposal] = useState<ReturnType<typeof generateBuild> & { requestId: string; baseRevision: number }>();
  const parameters = { tool, x, y, z, heading, size, palette, seed };
  function changed() { setProposal(undefined);onProposal(undefined);setError(''); }
  async function preview() {
    setError('');setPending(true);
    try {
      const requestId = `build-${crypto.randomUUID()}`;
      const response = await plotRequest<ReturnType<typeof generateBuild> & { baseRevision:number }>(`/api/plots/${world.id}/tools`, { parameters, requestId, preview:true });
      setProposal({ ...response, requestId });onProposal(response.objects);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to prepare the build.'); }
    finally { setPending(false); }
  }
  async function build() {
    if (!proposal) return;
    setPending(true);setError('');
    try {
      const next = await plotRequest<SharedWorld>(`/api/plots/${world.id}/tools`, { parameters:proposal.parameters, requestId:proposal.requestId, baseRevision:proposal.baseRevision, author:'Human curator' });
      onBuilt(next);setProposal(undefined);onProposal(undefined);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to build.');setProposal(undefined);onProposal(undefined); }
    finally { setPending(false); }
  }
  return <section className="plot-builder" aria-label="World-building tools">
    <div className="section-heading"><h2>Make a place.</h2><span>5 tools</span></div>
    <div className="builder-tool-list">{BUILDER_TOOLS.map(item => <button key={item.id} aria-pressed={tool === item.id} onClick={() => { setTool(item.id);changed(); }} disabled={pending}><span>{item.name}</span><small>{item.description}</small></button>)}</div>
    <fieldset className="builder-fields" disabled={pending}>
      <label>Position X<input type="number" value={x} min={-15} max={15} step={1} onChange={e => { setX(Number(e.target.value));changed(); }}/></label>
      <label>Position Z<input type="number" value={z} min={-15} max={15} step={1} onChange={e => { setZ(Number(e.target.value));changed(); }}/></label>
      <label>Elevation<input type="number" value={y} min={-4} max={30} step={0.25} onChange={e => { setY(Number(e.target.value));changed(); }}/></label>
      <label>Facing (°)<input type="number" value={heading} min={0} max={360} step={15} onChange={e => { setHeading(Number(e.target.value));changed(); }}/></label>
      <label>Size<input type="number" value={size} min={2} max={10} step={1} onChange={e => { setSize(Number(e.target.value));changed(); }}/></label>
      <label>Variation<input type="number" value={seed} min={0} max={2147483647} step={1} onChange={e => { setSeed(Number(e.target.value));changed(); }}/></label>
      <label className="builder-palette">Palette<select value={palette} onChange={e => { setPalette(e.target.value as keyof typeof BUILD_PALETTES);changed(); }}>{Object.keys(BUILD_PALETTES).map(key => <option key={key} value={key}>{key[0].toUpperCase()+key.slice(1)}</option>)}</select></label>
    </fieldset>
    <p className="builder-help">Each tool creates editable pieces. Gateways stay open.</p>
    {error && <p className="builder-error" role="alert">{error}</p>}
    <div role="status" className="builder-proposal">{proposal ? `${proposal.objectCount} objects ready for ${world.name}.` : ''}</div>
    {proposal ? <div className="builder-actions"><button disabled={pending} onClick={changed}>Discard</button><button className="builder-primary" disabled={disabled || pending} onClick={() => void build()}>{pending ? 'Building…' : 'Build in this plot'}</button></div> : <button className="builder-primary" disabled={disabled || pending} onClick={() => void preview()}>{pending ? 'Preparing…' : 'Prepare build'}</button>}
    <details><summary>For agents</summary><p>The same tools are available at <code>/api/plots/{world.id}/tools</code>. Raw object edits remain available for custom builds.</p><p>{BUILDER_CATALOG.behavior}</p></details>
  </section>;
}
