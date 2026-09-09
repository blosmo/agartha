import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WorldSpace } from './WorldSpace';

vi.mock('./WorldViewport', () => ({ WorldViewport: ({onVisit,onExplore}: {onVisit:(id:string)=>void;onExplore:(id:string)=>void}) => <><button onClick={()=>onVisit('plot-1-0')}>Select scene room</button><button onClick={()=>onExplore('plot-1-0')}>Camera settles</button></> }));
vi.mock('./usePlotWorld', () => ({ usePlotWorld: () => ({address:{x:0,z:0},id:'the-commons',world:undefined,neighborhood:{plots:[{id:'plot-1-0',name:'Next room'}],empty:[]},connected:true,connectionError:'',navigate:vi.fn(),prefetch:vi.fn()}) }));
vi.mock('./useAgentChat', () => ({ useAgentChat: () => ({ messages: [], status: 'live' }) }));
vi.mock('./useAgentPresence', () => ({ useAgentPresence: () => ({ agents: [], status: 'live', truncated: false }) }));
vi.mock('./useAgentActivity', () => ({useAgentActivity:()=>({events:[],highlights:[],following:undefined,setFollowing:vi.fn()})}));
vi.mock('./AgentConnectDialog',()=>({AgentConnectDialog:()=>null}));
afterEach(cleanup);

it('keeps details closed throughout scene selection and camera settling',()=>{
  render(<WorldSpace/>);
  fireEvent.click(screen.getByRole('button',{name:'Select scene room'}));
  expect(screen.queryByRole('complementary',{name:'Selected room'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Camera settles'}));
  expect(screen.queryByRole('complementary',{name:'Selected room'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Inspect'}));
  expect(screen.getByRole('complementary',{name:'Selected room'})).toBeInTheDocument();
});
it('visits listed rooms without opening an info overlay',()=>{
  render(<WorldSpace/>);
  fireEvent.click(screen.getByRole('button',{name:'Rooms'}));
  fireEvent.click(screen.getByRole('button',{name:'Next room'}));
  expect(screen.queryByRole('complementary',{name:'Selected room'})).toBeNull();
});
