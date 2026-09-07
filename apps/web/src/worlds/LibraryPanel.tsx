import React, { useEffect, useState } from 'react';
import type { LibraryEntry, LibraryObject, SharedShader } from '../../../../packages/protocol/src/sharedLibrary';
import { compileSurface, SURFACE_EXAMPLES } from '../../../../packages/protocol/src/surfaceShaders';
import type { SharedWorld, WorldObject } from './world';
import { plotRequest } from './usePlotWorld';
type Summary = {id:string;kind:'asset'|'shader'|'mesh';name:string;description:string;author:string;objectCount?:number;bounds?:number[];expression?:string};
export function LibraryPanel({world,selected,canEditSelected=true,initialKind='asset',onBuilt,onProposal,onShaderPreview,onApplyShader,animateSurfaces,onAnimate}: {
  world:SharedWorld;selected?:WorldObject;canEditSelected?:boolean;initialKind?:'asset'|'shader';onBuilt:(world:SharedWorld)=>void;onProposal:(objects:LibraryObject[]|undefined)=>void;onShaderPreview:(shader:SharedShader|undefined)=>void;onApplyShader:(id:string)=>Promise<boolean>;animateSurfaces:boolean;onAnimate:(value:boolean)=>void;
}) {
  const [kind,setKind]=useState(initialKind),[entries,setEntries]=useState<Summary[]>([]),[cursor,setCursor]=useState<string|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [creating,setCreating]=useState(false),[name,setName]=useState(''),[description,setDescription]=useState(''),[expression,setExpression]=useState<string>(SURFACE_EXAMPLES[0].expression);
  const [chosen,setChosen]=useState<Summary>(),[x,setX]=useState(0),[y,setY]=useState(-.2),[z,setZ]=useState(0),[scale,setScale]=useState(1),[heading,setHeading]=useState(0);
  const [prepared,setPrepared]=useState<{objects:LibraryObject[];baseRevision:number;requestId:string;parameters:{x:number;y:number;z:number;scale:number;heading:number};assetId:string}>();
  useEffect(()=>{setKind(initialKind);},[initialKind]);
  useEffect(()=>()=>{onProposal(undefined);onShaderPreview(undefined);},[onProposal,onShaderPreview]);
  useEffect(()=>{
    let cancelled=false;setEntries([]);setCursor(null);setError('');setChosen(undefined);setPrepared(undefined);onProposal(undefined);onShaderPreview(undefined);setCreating(false);
    void plotRequest<{entries:Summary[];cursor:string|null}>(`/api/library?kind=${kind}`).then(result=>{if(!cancelled){setEntries(result.entries);setCursor(result.cursor);}}).catch(err=>{if(!cancelled)setError(err instanceof Error?err.message:'Unable to load the library.');});
    return()=>{cancelled=true;};
  },[kind,onProposal,onShaderPreview]);
  function clearProposal(){setPrepared(undefined);onProposal(undefined);}
  async function publish(){
    setError('');setBusy(true);
    try {
      const objects=selected?[selected]:world.objects;
      const definition=kind==='shader'?{kind,name,description,expression}:{kind,name,description,objects};
      const entry=await plotRequest<LibraryEntry>('/api/library',{plotId:world.id,author:'Human curator',definition});
      setEntries(current=>[{...entry,objectCount:entry.kind==='asset'?entry.objects.length:undefined},...current.filter(e=>e.id!==entry.id)]);
      setCreating(false);onShaderPreview(undefined);
    } catch(err){setError(err instanceof Error?err.message:'Unable to publish.');}finally{setBusy(false);}
  }
  async function prepare(){
    if(!chosen)return;setBusy(true);setError('');
    try {
      const requestId=`asset-${crypto.randomUUID()}`,parameters={x,y,z,scale,heading};
      const result=await plotRequest<{objects:LibraryObject[];baseRevision:number}>(`/api/plots/${world.id}/assets`,{assetId:chosen.id,parameters,requestId,preview:true});
      setPrepared({...result,requestId,parameters,assetId:chosen.id});onProposal(result.objects);
    }catch(err){setError(err instanceof Error?err.message:'Unable to prepare asset.');}finally{setBusy(false);}
  }
  async function place(){
    if(!prepared)return;setBusy(true);setError('');
    try {const next=await plotRequest<SharedWorld>(`/api/plots/${world.id}/assets`,{...prepared,objects:undefined,author:'Human curator',preview:false});onBuilt(next);clearProposal();setChosen(undefined);}
    catch(err){setError(err instanceof Error?err.message:'Unable to place asset.');clearProposal();}finally{setBusy(false);}
  }
  function previewShader(){
    try {const program=compileSurface(expression);setError('');onShaderPreview({id:`shader-${'0'.repeat(64)}`,kind:'shader',name:name||'Draft surface',description,expression:program.expression,usesTime:program.usesTime});}
    catch(err){setError(err instanceof Error?err.message:'Invalid surface expression.');}
  }
  return <section className="shared-library" aria-label="Shared asset and shader library">
    <div className="section-heading"><h2>Made to be shared.</h2><button disabled={busy} onClick={()=>{setCreating(value=>!value);setName(kind==='asset'?(selected?.name??world.name):'New surface');setDescription('');setError('');}}>Publish {kind}</button></div>
    <div className="library-switch"><button aria-pressed={kind==='asset'} disabled={busy} onClick={()=>setKind('asset')}>Assets</button><button aria-pressed={kind==='shader'} disabled={busy} onClick={()=>setKind('shader')}>Shaders</button></div>
    <p className="library-hint">Reusable across plots. Published versions stay unchanged.</p>
    {kind==='shader'&&<label className="library-animation"><input type="checkbox" checked={animateSurfaces} onChange={e=>onAnimate(e.target.checked)}/> Animate surfaces <small>Respects reduced motion</small></label>}
    {error&&<p className="builder-error" role="alert">{error}</p>}
    {creating&&<form className="library-publish" onSubmit={e=>{e.preventDefault();void publish();}}>
      <label>Name<input disabled={busy} value={name} onChange={e=>setName(e.target.value)} required maxLength={80}/></label>
      <label>Description<input disabled={busy} value={description} onChange={e=>setDescription(e.target.value)} maxLength={300}/></label>
      {kind==='asset'?<p>{selected?`Save the selected object: ${selected.name}.`:`Save this plot’s ${world.objects.length} objects as an assembly.`} Assets support up to 100 parts.</p>:<>
        <label>Surface expression<textarea disabled={busy} value={expression} onChange={e=>{setExpression(e.target.value);onShaderPreview(undefined);}} maxLength={1200} spellCheck={false} required/></label>
        <p>Return an RGB color using <code>color</code>, <code>position</code>, <code>normal</code>, <code>time</code>, math and <code>noise()</code>.</p>
        <div className="shader-examples">{SURFACE_EXAMPLES.map(example=><button type="button" disabled={busy} key={example.name} onClick={()=>{setName(example.name);setExpression(example.expression);onShaderPreview(undefined);}}>{example.name}</button>)}</div>
        <button type="button" disabled={!selected||!canEditSelected||busy} onClick={previewShader}>Preview on selected object</button>
        {!selected&&<p>Select an object in the plot to preview this surface.</p>}
      </>}
      <div className="builder-actions"><button type="button" disabled={busy} onClick={()=>{setCreating(false);onShaderPreview(undefined);}}>Cancel</button><button className="builder-primary" type="submit" disabled={busy}>{busy?'Publishing…':'Publish to library'}</button></div>
    </form>}
    <div className="library-entries">{entries.map(entry=><article key={entry.id}>
      <div><h3>{entry.name}</h3><p>{entry.description|| (entry.kind==='asset'?`${entry.objectCount} reusable parts`:'Procedural surface shader')}</p><small>By {entry.author}{entry.kind==='asset'?` · ${entry.objectCount} parts`:''}</small></div>
      {entry.kind==='asset'?<button disabled={busy} onClick={()=>{setChosen(entry);clearProposal();setError('');}}>Use asset</button>:<button disabled={!selected||!canEditSelected||busy} onClick={async()=>{setBusy(true);onShaderPreview(undefined);try{await onApplyShader(entry.id);}finally{setBusy(false);}}}>Apply to selected</button>}
    </article>)}</div>
    {cursor&&<button disabled={busy} onClick={async()=>{setBusy(true);try{const next=await plotRequest<{entries:Summary[];cursor:string|null}>(`/api/library?kind=${kind}&cursor=${cursor}`);setEntries(current=>[...current,...next.entries.filter(entry=>!current.some(e=>e.id===entry.id))]);setCursor(next.cursor);}catch(err){setError(err instanceof Error?err.message:'Unable to load more.');}finally{setBusy(false);}}}>Load more</button>}
    {chosen&&<section className="library-placement" aria-label="Asset placement"><h3>Place {chosen.name}</h3><fieldset className="builder-fields" disabled={busy}>
      <label>Position X<input type="number" value={x} min={-15} max={15} onChange={e=>{setX(Number(e.target.value));clearProposal();}}/></label><label>Position Z<input type="number" value={z} min={-15} max={15} onChange={e=>{setZ(Number(e.target.value));clearProposal();}}/></label>
      <label>Elevation<input type="number" value={y} min={-4} max={30} step={.1} onChange={e=>{setY(Number(e.target.value));clearProposal();}}/></label>
      <label>Scale<input type="number" value={scale} min={.1} max={4} step={.1} onChange={e=>{setScale(Number(e.target.value));clearProposal();}}/></label><label>Facing (°)<input type="number" value={heading} min={0} max={360} step={15} onChange={e=>{setHeading(Number(e.target.value));clearProposal();}}/></label>
    </fieldset><p>Placed pieces remain individually editable.</p>{prepared?<div className="builder-actions"><button onClick={clearProposal} disabled={busy}>Discard</button><button className="builder-primary" onClick={()=>void place()} disabled={busy}>{busy?'Placing…':'Place in this plot'}</button></div>:<button className="builder-primary" onClick={()=>void prepare()} disabled={busy}>{busy?'Preparing…':'Prepare placement'}</button>}</section>}
  </section>;
}
