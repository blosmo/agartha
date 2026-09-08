import { expect,it } from 'vitest';
import { neighborhoodCells } from '../../../../packages/protocol/src/neighborhood';
import { plotId } from '../../../../packages/protocol/src/plots';
import { streamNeighborhood } from './streamNeighborhood';
import type { PlotNeighborhood } from './plotTypes';
import { createWorld } from './world';
const neighborhood=(x:number,z=0):PlotNeighborhood=>({center:{x,z},plotSize:32,plots:[],empty:neighborhoodCells({x,z},2).map(p=>({...p,id:plotId(p)}))});
it('retains nearby cells while bounding continuous travel to a seven by seven window',()=>{
 let current=neighborhood(0);
 for(let x=1;x<100;x++){
  current=streamNeighborhood(neighborhood(x),current);
  current=streamNeighborhood(current,neighborhood(x+1));
  expect(current.empty.length).toBe(35);
  expect(new Set(current.empty.map(p=>p.id)).size).toBe(current.empty.length);
  expect(current.empty.every(p=>Math.abs(p.x-x)<=3&&Math.abs(p.z)<=3)).toBe(true);
 }
});
it('never restores deleted or hidden rooms inside the authoritative query',()=>{
 const old=neighborhood(0);old.plots=[{...createWorld(),id:'plot-1-0'}];
 const fresh=neighborhood(1);fresh.empty=fresh.empty.filter(p=>p.id!=='plot-1-0');
 expect(streamNeighborhood(fresh,old).plots).toEqual([]);
});
