import * as THREE from 'three';
import type {MeshGeometry} from '../../../../packages/protocol/src/geometry/mesh';
export function meshGeometry(data:MeshGeometry){
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(data.normals,3));
  geometry.setIndex(data.indices);
  const uv=data.uvs??data.positions.flatMap((_,i)=>i%3===0?[data.positions[i]+.5,.5+data.positions[i+1]]:[]);
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  if(data.uvs1)geometry.setAttribute('uv1',new THREE.Float32BufferAttribute(data.uvs1,2));
  if(data.colors)geometry.setAttribute('color',new THREE.Float32BufferAttribute(data.colors,4));
  geometry.userData.sharedMesh=true;geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
