import {expect,it} from 'vitest';
import {modelGeometry} from './modeling';
import {normalizeLibraryDefinition} from '../sharedLibrary';
it('models a smooth lathed vessel with separate cap normals and UV seams',()=>{const mesh=modelGeometry({kind:'lathe',profile:[[1,0],[2,1],[.5,3]],segments:12,capEnd:false});expect(mesh.bounds).toEqual([4,3,4]);expect(mesh.uvs?.length).toBe(mesh.positions.length/3*2);expect(mesh.indices.length/3).toBe(60);expect(mesh.normals.every(Number.isFinite)).toBe(true);});
it('extrudes a concave outline with closed top, bottom and side faces',()=>{const mesh=modelGeometry({kind:'extrude',outline:[[0,0],[3,0],[3,1],[1,1],[1,3],[0,3]],depth:2});expect(mesh.bounds).toEqual([3,2,3]);expect(mesh.indices.length/3).toBe(20);});
it('rejects self-intersecting outlines and reversed profile heights',()=>{expect(()=>modelGeometry({kind:'extrude',outline:[[0,0],[3,3],[0,3],[3,0]]})).toThrow();expect(()=>modelGeometry({kind:'lathe',profile:[[1,2],[2,1]]})).toThrow('increasing');});
it('publishes modeled geometry through the normal library definition',()=>{const entry=normalizeLibraryDefinition({kind:'mesh',name:'Profile bowl',recipe:{kind:'lathe',profile:[[1,0],[2,1]],segments:8}});expect(entry.kind).toBe('mesh');});
