import {expect,it} from 'vitest';
import {modelGeometry} from './modeling';
import {transformModeledMesh} from './modelTransform';
import type {MeshGeometry} from './mesh';
const box=()=>modelGeometry({kind:'extrude',outline:[[0,0],[4,0],[4,2],[0,2]],depth:1});
function expectNormalsMatchFaces(mesh:MeshGeometry){
 const point=(id:number)=>mesh.positions.slice(id*3,id*3+3).map((n,a)=>n*mesh.bounds[a]);
 for(let i=0;i<mesh.indices.length;i+=3){
  const ids=mesh.indices.slice(i,i+3),[a,b,c]=ids.map(point),u=b.map((n,j)=>n-a[j]),v=c.map((n,j)=>n-a[j]);
  const face=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...face);
  for(const id of ids){const n=mesh.normals.slice(id*3,id*3+3).map((n,j)=>n/mesh.bounds[j]),nl=Math.hypot(...n);expect(n.reduce((sum,n,j)=>sum+n*face[j],0)/(length*nl)).toBeCloseTo(1,8);}
 }
}
it('keeps an absent transform exactly compatible with existing geometry',()=>{const mesh=box();expect(transformModeledMesh(mesh,undefined)).toBe(mesh);});
it('rotates source dimensions around X rather than stretching the normalized cube',()=>{
 const mesh=transformModeledMesh(box(),{rotation:[90,0,0]});[4,2,1].forEach((n,i)=>expect(mesh.bounds[i]).toBeCloseTo(n,8));expectNormalsMatchFaces(mesh);
});
it('applies source scaling before ordered XYZ rotations and transforms normals correctly',()=>{
 const source=box(),before=JSON.stringify(source),mesh=transformModeledMesh(source,{scale:[2,3,.5],rotation:[90,0,90]});
 [1,8,3].forEach((n,i)=>expect(mesh.bounds[i]).toBeCloseTo(n,8));expectNormalsMatchFaces(mesh);expect(mesh.uvs).toEqual(source.uvs);expect(JSON.stringify(source)).toBe(before);
 const slanted=modelGeometry({kind:'extrude',outline:[[0,0],[4,0],[3,2],[0,1]],depth:1});
 const oblique=transformModeledMesh(slanted,{scale:[2,.5,3],rotation:[37,21,-18]});expectNormalsMatchFaces(oblique);
});
it('rejects malformed transforms instead of silently producing invalid geometry',()=>{
 for(const transform of [null,[],{scale:[1,0,1]},{scale:[-1,1,1]},{scale:[1,Infinity,1]},{rotation:[1,2]},{rotation:[0,NaN,0]},{rotation:[0,361,0]},{rotate:[0,1,0]}])expect(()=>transformModeledMesh(box(),transform)).toThrow();
});
it('supports construction transforms through the public recipe entry point',()=>{
 const mesh=modelGeometry({kind:'extrude',outline:[[0,0],[4,0],[4,2],[0,2]],depth:1,transform:{rotation:[90,0,0]}});[4,2,1].forEach((n,i)=>expect(mesh.bounds[i]).toBeCloseTo(n,8));
});
