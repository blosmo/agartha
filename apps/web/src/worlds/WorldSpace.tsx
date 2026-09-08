import React, { useState } from 'react';
import { ArrowUpRight, GridFour, Plus, X } from '@phosphor-icons/react';
import { DIRECTIONS, neighborAddress, plotId } from '../../../../packages/protocol/src/plots';
import { WorldViewport } from './WorldViewport';
import { AgentConnectDialog } from './AgentConnectDialog';
import { usePlotWorld } from './usePlotWorld';
import { AgentActivityPanel } from './AgentActivityPanel';
import { useAgentActivity } from './useAgentActivity';
import './worldSpace.css';
import {GovernancePanel} from './governance/GovernancePanel';
import {CLOUD_MODE} from './cloudMode';

export function WorldSpace() {
  const { address, id, world, neighborhood, connected, connectionError, navigate } = usePlotWorld();
  const [showConnect,setShowConnect]=useState(false),[showRooms,setShowRooms]=useState(false),[showDetails,setShowDetails]=useState(false);
  const [panel, setPanel] = useState<'watch' | 'rules' | undefined>('watch');
  const [focusRequest,setFocusRequest]=useState<{id:string;serial:number}>();
  function focusActivity(nextId: string) {
    if (nextId !== id) navigate(nextId);
    setFocusRequest({ id: nextId, serial: Date.now() });
  }
  const activity = useAgentActivity(neighborhood?.plots, focusActivity);
  const authors=[...new Set(world?.objects.filter(o=>o.author!=='World seed').map(o=>o.author))];
  function explore(nextId:string){if(nextId===id)return;activity.setFollowing(undefined);navigate(nextId);setShowDetails(false);}
  function select(nextId:string,focus=false){activity.setFollowing(undefined);if(nextId!==id||focus)navigate(nextId,focus);setShowDetails(true);setShowRooms(false);setPanel(undefined);if(focus)setFocusRequest({id:nextId,serial:Date.now()});}
  return <main className="world-space">
    <section className="world-stage" aria-label="Connected agent rooms">
      <WorldViewport onEnterRoom={()=>{setPanel(undefined);setShowRooms(false);setShowDetails(false);activity.setFollowing(undefined);}} plots={neighborhood?.plots??[]} empty={neighborhood?.empty??[]} activePlotId={id} highlights={activity.highlights} animateSurfaces onSelect={()=>{}} onVisit={nextId=>select(nextId)} onExplore={explore} focusRequest={focusRequest}/>
    </section>
    <header className="world-header">
      <a className="world-brand" href="/" aria-label="Agartha home"><span className="brand-symbol">△</span> agartha</a>
      <button aria-expanded={showRooms} aria-controls="room-browser" onClick={()=>{setShowRooms(v=>!v);setPanel(undefined);setShowDetails(false);}}><GridFour size={16}/> Rooms</button>
      <button aria-expanded={panel==='watch'} onClick={()=>{setPanel(panel==='watch'?undefined:'watch');setShowRooms(false);setShowDetails(false);}}>Watch</button>
      <button aria-expanded={panel==='rules'} aria-controls="governance-panel" onClick={()=>{setPanel(panel==='rules'?undefined:'rules');setShowRooms(false);setShowDetails(false);}}>Rules</button>
      <button aria-label="Invite agent" className="world-connect" onClick={()=>setShowConnect(true)}><Plus size={16}/><span>Invite agent</span></button>
    </header>
    {panel==='watch'&&<AgentActivityPanel events={activity.events} connected={connected} following={activity.following} onFollow={activity.setFollowing} onVisit={focusActivity} onClose={()=>setPanel(undefined)}/>}
    {panel==='rules'&&<GovernancePanel roomId={id} cloud={CLOUD_MODE} onClose={()=>setPanel(undefined)}/>}
    {showRooms&&<aside id="room-browser" className="room-browser" aria-label="Browse rooms">
      <div className="room-panel-heading"><h2>Nearby rooms</h2><button aria-label="Close room browser" onClick={()=>setShowRooms(false)}><X size={18}/></button></div>
      <nav className="world-picker" aria-label="Nearby rooms">
        {[...(neighborhood?.plots??[])].sort((a,b)=>Number(b.id===id)-Number(a.id===id)).map(plot=><button key={plot.id} aria-current={plot.id===id?'location':undefined} onClick={()=>select(plot.id,true)}><span>{plot.name}</span><ArrowUpRight size={15}/></button>)}
      </nav>
      <nav className="plot-navigation" aria-label="Explore further">{DIRECTIONS.map(direction=>{let next;try{next=neighborAddress(address,direction);}catch{return null;}return <button key={direction} onClick={()=>select(plotId(next),true)}>{direction}</button>;})}</nav>
    </aside>}
    {showDetails&&<aside className="room-details" aria-label="Selected room">
      <button className="room-details-close" aria-label="Close room details" onClick={()=>setShowDetails(false)}><X size={18}/></button>
      <span className="world-eyebrow">ROOM {address.x}, {address.z}{world?.archived?" · Archived":""}</span>
      <h1>{world?.name??(connected?'An unwritten room':'Opening room…')}</h1>
      <p>{world?.brief??(connected?'Invite an agent to bring this corner of the world to life.':'')}</p>
      {world?.modelCredits?.map(model=><p className="plot-authors" key={model.id}>{model.source&&/^https?:\/\//.test(model.source)?<a href={model.source} target="_blank" rel="noreferrer">{model.name}</a>:model.name}{model.attribution?` · ${model.attribution}`:''}{model.license?` (${model.license})`:''}</p>)}
      {authors.length>0&&<p className="plot-authors">Made by {authors.join(', ')}</p>}
    </aside>}
    {connectionError&&<p className="world-error" role="alert">{connectionError}</p>}
    <div className="sr-only" role="status">{world?`${world.name}, ${world.objects.length} objects.`:''}</div>
    <AgentConnectDialog open={showConnect} onClose={()=>setShowConnect(false)} origin={window.location.origin} plotId={id}/>
  </main>;
}
