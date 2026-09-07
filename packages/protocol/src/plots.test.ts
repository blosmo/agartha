import { describe, expect, it } from 'vitest';
import { addressFromId, assertWithinPlot, neighborAddress, plotId } from './plots';
import { BUILDER_TOOLS, generateBuild } from './worldbuilding';
describe('connected plot contract', () => {
  it('uses stable addresses and discovers cardinal neighbors', () => {
    for (const address of [{x:0,z:0},{x:-2,z:3},{x:1,z:-4}]) expect(addressFromId(plotId(address))).toEqual(address);
    expect(neighborAddress({x:0,z:0},'north')).toEqual({x:0,z:-1});
    expect(() => addressFromId('../world')).toThrow();
    expect(() => addressFromId('plot-01-0')).toThrow();
  });
  it('keeps full object bounds inside a plot', () => {
    expect(() => assertWithinPlot({position:[15,0,0],scale:[2,1,1]})).toThrow('inside');
    expect(() => assertWithinPlot({position:[0,0,0],scale:[2,1,1]})).not.toThrow();
  });
  it.each(BUILDER_TOOLS)('$id creates deterministic, bounded, editable objects', tool => {
    const a=generateBuild({tool:tool.id,seed:9},'test');
    expect(a).toEqual(generateBuild({tool:tool.id,seed:9},'test'));
    expect(a.objects.length).toBeGreaterThan(0);expect(a.objects.length).toBeLessThanOrEqual(20);
    expect(new Set(a.objects.map(o=>o.id)).size).toBe(a.objects.length);
    for(const object of a.objects)expect(()=>assertWithinPlot(object)).not.toThrow();
  });
  it('rejects invalid and out-of-bounds recipes instead of clipping them',()=>{
    expect(()=>generateBuild({tool:'grove',x:15,size:10},'test')).toThrow('inside');
    expect(()=>generateBuild({tool:'unknown'},'test')).toThrow('Unknown');
    expect(()=>generateBuild({tool:'path',seed:1.5},'test')).toThrow('integer');
  });
});
it('keeps gateways clear but allows low stepping stones and rotated builds',()=>{
  expect(()=>assertWithinPlot({position:[14,1,0],scale:[1,2,1]})).toThrow('gateway');
  expect(()=>assertWithinPlot({position:[14,0,0],scale:[1,.2,1]})).not.toThrow();
  expect(()=>assertWithinPlot({position:[14,1,8],scale:[1,1,6],yaw:Math.PI/4})).toThrow('inside');
  const rotated=generateBuild({tool:'path',heading:90,y:2},'rotate');
  expect(rotated.objects[0].yaw).toBeCloseTo(Math.PI/2);
  expect(rotated.objects[0].position[1]).toBeCloseTo(1.95);
});

import {roomLocation,localToWorld,worldToLocal} from './plots';
it('round-trips durable room-local coordinates and defines shared-edge ownership',()=>{
 for(const cell of [{x:-10000,z:10000},{x:-2,z:-3},{x:0,z:0}]){
  expect(worldToLocal(localToWorld(cell,[-15.75,4,15.75]))).toEqual({roomId:plotId(cell),cell,position:[-15.75,4,15.75]});
  expect(roomLocation(cell).roomId).toBe(plotId(cell));
 }
 expect(worldToLocal([-16,0,-16]).cell).toEqual({x:0,z:0});
 expect(worldToLocal([16,0,16]).cell).toEqual({x:1,z:1});
 expect(worldToLocal([-16.01,0,0]).cell).toEqual({x:-1,z:0});
 expect(()=>worldToLocal([Infinity,0,0])).toThrow();
});
