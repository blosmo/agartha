import {expect,it} from 'vitest';
import {normalizeMesh} from './mesh';
import {importObj} from './obj';
it('normalizes authored geometry and computes usable normals',()=>{const mesh=normalizeMesh({positions:[0,0,0,4,0,0,0,2,0],indices:[0,1,2]});expect(mesh.bounds).toEqual([4,2,0]);expect(mesh.positions).toEqual([-.5,-.5,0,.5,-.5,0,-.5,.5,0]);expect(mesh.normals).toEqual([0,0,1,0,0,1,0,0,1]);});
it('imports OBJ negative indices without fetching material references',()=>{const mesh=importObj('mtllib remote.mtl\nv 0 0 0\nv 2 0 0\nv 0 2 0\nf -3 -2 -1');expect(mesh.indices).toEqual([0,1,2]);});
it('rejects invalid topology instead of silently rendering corrupt models',()=>{expect(()=>normalizeMesh({positions:[0,0,0,1,0,0,2,0,0],indices:[0,1,2]})).toThrow('degenerate');expect(()=>normalizeMesh({positions:[0,0,0,1,0,0,0,1,0],indices:[0,1,4]})).toThrow('outside');expect(()=>importObj('v 0 0 0\nf 1 2 3 4')).toThrow('triangulated');});
it('preserves UV seams by indexing complete OBJ vertex tuples',()=>{const mesh=importObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nf 1/1 2/2 3/3');expect(mesh.uvs).toEqual([0,0,1,0,0,1]);});
it('caps storage cost even when numeric JSON is compact',()=>{const positions:number[]=[],indices:number[]=[];for(let i=0;i<5000;i++){positions.push(i*3,0,0,i*3+1,0,0,i*3,1,0);indices.push(i*3,i*3+1,i*3+2);}expect(()=>normalizeMesh({positions,indices})).toThrow('storage budget');});
it('retains secondary UVs and expands RGB vertex colors to RGBA',()=>{const mesh=normalizeMesh({positions:[0,0,0,1,0,0,0,1,0],indices:[0,1,2],uvs1:[0,0,1,0,0,1],colors:[1,0,0,0,1,0,0,0,1]});expect(mesh.uvs1).toEqual([0,0,1,0,0,1]);expect(mesh.colors).toEqual([1,0,0,1,0,1,0,1,0,0,1,1]);});
