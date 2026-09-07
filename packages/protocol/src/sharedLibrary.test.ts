import { expect,it } from 'vitest';
import { instantiateAsset,normalizeLibraryDefinition } from './sharedLibrary';
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
