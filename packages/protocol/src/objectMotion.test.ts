import { expect, it } from 'vitest';
import { motionPose, parseObjectMotion } from './objectMotion';
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
