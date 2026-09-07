import {expect,it} from 'vitest';
import {modelGeometry} from './modeling';
import {normalizeLibraryDefinition} from '../sharedLibrary';
it('models a smooth lathed vessel with separate cap normals and UV seams',()=>{const mesh=modelGeometry({kind:'lathe',profile:[[1,0],[2,1],[.5,3]],segments:12,capEnd:false});expect(mesh.bounds).toEqual([4,3,4]);expect(mesh.uvs?.length).toBe(mesh.positions.length/3*2);expect(mesh.indices.length/3).toBe(60);expect(mesh.normals.every(Number.isFinite)).toBe(true);});
it('extrudes a concave outline with closed top, bottom and side faces',()=>{const mesh=modelGeometry({kind:'extrude',outline:[[0,0],[3,0],[3,1],[1,1],[1,3],[0,3]],depth:2});expect(mesh.bounds).toEqual([3,2,3]);expect(mesh.indices.length/3).toBe(20);});
it('rejects self-intersecting outlines and reversed profile heights',()=>{expect(()=>modelGeometry({kind:'extrude',outline:[[0,0],[3,3],[0,3],[3,0]]})).toThrow();expect(()=>modelGeometry({kind:'lathe',profile:[[1,2],[2,1]]})).toThrow('increasing');});
it('publishes modeled geometry through the normal library definition',()=>{const entry=normalizeLibraryDefinition({kind:'mesh',name:'Profile bowl',recipe:{kind:'lathe',profile:[[1,0],[2,1]],segments:8}});expect(entry.kind).toBe('mesh');});
it('publishes rounded, toroidal, and swept forms through the shared recipe entry point',()=>{
 const recipes=[
  {kind:'roundedBox',size:[4,2,3],radius:.2},
  {kind:'torus',radius:2,tube:.25},
  {kind:'sweep',path:[[0,0,0],[0,2,0],[1,3,0]],radius:.15,smooth:true,steps:3},
 ];
 for(const recipe of recipes){const entry=normalizeLibraryDefinition({kind:'mesh',name:'Essential form',recipe});expect(entry.kind).toBe('mesh');if(entry.kind==='mesh'){expect(entry.geometry.indices.length).toBeGreaterThan(0);expect(entry.geometry.bounds.every(n=>n>0)).toBe(true);}}
 const transformed=modelGeometry({...recipes[0],transform:{rotation:[90,0,0]}});[4,3,2].forEach((n,i)=>expect(transformed.bounds[i]).toBeCloseTo(n,8));
});
it('smooths lathe profiles without overshoot and keeps normals tangent to the profile',()=>{
 const mesh=modelGeometry({kind:'lathe',profile:[[1,0],[2,1],[1,3]],segments:8,smooth:true,steps:4});
 expect(mesh.bounds).toEqual([4,3,4]);expect(mesh.indices.length/3).toBe(144);
 // Radius extremum at the fourth interpolated row has a horizontal surface normal.
 expect(mesh.normals[(4*9)*3+1]).toBeCloseTo(0,10);
 expect(mesh.positions.every(n=>Number.isFinite(n)&&Math.abs(n)<=.5+1e-12)).toBe(true);
});
it('rejects malformed or over-budget lathe interpolation settings',()=>{
 const base={kind:'lathe',profile:[[1,0],[2,1],[1,3]],segments:8};
 for(const option of [{smooth:'yes'},{steps:0},{steps:9},{steps:1.5}])expect(()=>modelGeometry({...base,...option})).toThrow();
 expect(()=>modelGeometry({kind:'lathe',profile:Array.from({length:128},(_,i)=>[1,i/8]),smooth:true,steps:8})).toThrow(/budget|rings/);
});
