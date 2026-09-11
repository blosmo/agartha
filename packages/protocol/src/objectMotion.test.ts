import { expect, it } from 'vitest';
import { motionExtents, motionPose, parseObjectMotion } from './objectMotion';
import { assertWithinPlot } from './plots';
import { instantiateAsset, normalizeLibraryDefinition } from './sharedLibrary';

it('evaluates float and spin without changing authored transforms', () => {
  expect(motionPose(parseObjectMotion({kind:'float',amplitude:1,speed:1}), Math.PI/2, .4)).toEqual({lift:1,yaw:.4});
  expect(motionPose(parseObjectMotion({kind:'spin',speed:1}), 2, .4)).toEqual({lift:0,yaw:2.4});
});
it('rejects unbounded motion', () => {
  for (const value of [{kind:'fly'}, {kind:'float',amplitude:50}, {kind:'spin',speed:Infinity}, {kind:'spin',phase:-1}]) expect(() => parseObjectMotion(value)).toThrow();
});
it('keeps the full spin and float cycle within room bounds and gateways', () => {
  const object = {position:[11,5,6],scale:[1,2,12]};
  expect(() => assertWithinPlot(object)).not.toThrow();
  expect(() => assertWithinPlot({...object,motion:parseObjectMotion({kind:'spin'})})).toThrow();
  expect(() => assertWithinPlot({position:[0,39,0],scale:[1,1,1],motion:parseObjectMotion({kind:'float',amplitude:2})})).toThrow();
  expect(() => assertWithinPlot({position:[14,3.7,0],scale:[1,1,1],motion:parseObjectMotion({kind:'float',amplitude:1})})).toThrow('gateway');
});
it('retains motion in shared assets and scales floating distance during placement', () => {
  const asset = normalizeLibraryDefinition({kind:'asset',name:'Floating stone',objects:[{name:'Stone',shape:'sphere',position:[0,2,0],scale:[1,1,1],color:'#ffffff',motion:{kind:'float',amplitude:.5}}]});
  if (asset.kind !== 'asset') throw new Error('Expected asset');
  expect(instantiateAsset(asset,{scale:2},'placed')[0].motion).toEqual({kind:'float',speed:.6,amplitude:1,phase:0});
});

it('moves along constant-distance loop paths and closes the seam', () => {
  const motion = parseObjectMotion({kind:'path',points:[[0,0,0],[2,0,0],[2,0,2]],speed:1});
  expect(motion).toMatchObject({kind:'path',mode:'loop',orient:true});
  expect(motionPose(motion, 0)).toMatchObject({offset:[0,0,0],yaw:Math.PI / 2});
  expect(motionPose(motion, 2.5)).toMatchObject({offset:[2,0,.5],yaw:0});
  expect(motionPose(motion, 4 + Math.sqrt(8))).toMatchObject({offset:[0,0,0]});
});

it('reverses pingpong heading and rejects malformed paths', () => {
  const motion = parseObjectMotion({kind:'path',points:[[0,0,0],[2,0,0]],mode:'pingpong',speed:1});
  expect(motionPose(motion, 3)).toMatchObject({offset:[1,0,0],yaw:-Math.PI / 2});
  const multi = parseObjectMotion({kind:'path',points:[[0,0,0],[10,0,0],[10,0,10]],mode:'pingpong',speed:1});
  expect(motionPose(multi, 25)).toMatchObject({offset:[10,0,5],yaw:-Math.PI});
  const halfCycle = parseObjectMotion({kind:'path',points:[[0,0,0],[10,0,0]],mode:'pingpong',phase:Math.PI});
  expect(motionPose(halfCycle, 0)).toMatchObject({offset:[10,0,0]});
  expect(() => parseObjectMotion({kind:'path',points:[[0,0,0],[0,0,0]]})).toThrow('non-zero');
  expect(() => parseObjectMotion({kind:'path',points:[[25,0,0],[0,0,0]]})).toThrow('bounded');
  expect(() => parseObjectMotion({kind:'path',points:[[0,0,0],[1,0,0]],orient:'yes'})).toThrow('boolean');
});

it('uses conservative swept extents for oriented path models', () => {
  const motion = parseObjectMotion({kind:'path',points:[[-4,-1,2],[3,2,-1]]});
  const [x,y,z] = motionExtents([2,2,6],0,motion);
  expect(x).toBeCloseTo(4 + Math.hypot(2,6) / 2);
  expect(y).toBe(3);
  expect(z).toBeCloseTo(2 + Math.hypot(2,6) / 2);
});


it('enforces room edges, gateway corridors and height for complete path envelopes', () => {
  for (const orient of [false, true]) {
    const path = (points: number[][]) => parseObjectMotion({kind:'path',points,orient});
    const object = {position:[0,5,0],scale:[1,1,1]};
    for (const [x,z] of [[16,0],[-16,0],[0,16],[0,-16]]) {
      expect(() => assertWithinPlot({...object,motion:path([[0,0,0],[x,0,z]])})).toThrow();
    }
    expect(() => assertWithinPlot({...object,motion:path([[-14,0,-14],[14,0,14]])})).not.toThrow();
    expect(() => assertWithinPlot({position:[0,1,0],scale:[1,1,1],motion:path([[0,0,0],[14,0,0]])})).toThrow('gateway');
    expect(() => assertWithinPlot({position:[0,39,0],scale:[1,1,1],motion:path([[0,0,0],[1,2,0]])})).toThrow();
    expect(() => assertWithinPlot({position:[0,37,0],scale:[1,1,1],motion:path([[0,0,0],[1,2,0]])})).not.toThrow();
  }
});
