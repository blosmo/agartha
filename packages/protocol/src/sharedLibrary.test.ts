import { expect,it } from 'vitest';
import { instantiateAsset,normalizeLibraryDefinition } from './sharedLibrary';
import { motionPose } from './objectMotion';
it('normalizes reusable parts and produces independent placements',()=>{
  const source={kind:'asset',name:'Bench',objects:[{id:'old',name:'Seat',shape:'box',position:[5,2,8],scale:[2,1,1],color:'#aabbcc'}]};
  const asset=normalizeLibraryDefinition(source);if(asset.kind!=='asset')throw new Error();
  expect(asset.objects[0].position).toEqual([0,.5,0]);expect(asset.bounds).toEqual([2,1,1]);
  const placed=instantiateAsset(asset,{x:4,z:5,heading:90},'new');expect(placed[0].id).toBe('new-0');expect(placed[0].yaw).toBeCloseTo(Math.PI/2);expect(source.objects[0].position).toEqual([5,2,8]);
});
it('rejects oversized, malformed, or escaping assemblies',()=>{
  expect(()=>normalizeLibraryDefinition({kind:'asset',name:'Bad',objects:[]})).toThrow();
  const asset=normalizeLibraryDefinition({kind:'asset',name:'Box',objects:[{name:'Box',shape:'box',position:[0,0,0],scale:[8,1,8],color:'#aabbcc'}]});if(asset.kind!=='asset')throw new Error();
  expect(()=>instantiateAsset(asset,{x:14},'new')).toThrow('inside');
  expect(()=>normalizeLibraryDefinition({kind:'shader',name:'Bad',expression:'color; loop {}'})).toThrow();
});

it('rotates and scales path waypoints while preserving world speed', () => {
  const asset = normalizeLibraryDefinition({kind:'asset',name:'Moving pod',objects:[{name:'Pod',shape:'box',position:[0,0,0],scale:[1,1,1],color:'#aabbcc',motion:{kind:'path',points:[[0,0,0],[1,0,0]],speed:.5}}]});
  if(asset.kind!=='asset') throw new Error();
  const [placed] = instantiateAsset(asset,{scale:2,heading:90},'pod');
  expect(placed.motion).toMatchObject({kind:'path',speed:.5});
  const points = placed.motion?.kind==='path' ? placed.motion.points : [];
  expect(points[0]).toEqual([0,0,0]);
  expect(points[1][0]).toBeCloseTo(0);
  expect(points[1][1]).toBe(0);
  expect(points[1][2]).toBeCloseTo(-2);
  expect(placed.yaw).toBe(0);
  expect(placed.position).toEqual([0,.8,0]);
  expect(motionPose(placed.motion,0,placed.yaw).yaw).toBeCloseTo(Math.PI);
});
