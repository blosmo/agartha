import { expect,it } from 'vitest';
import * as THREE from 'three';
import { WalkCollisions } from './walkCollisions';
import { RoomCamera } from './roomCamera';
const box=(x:number,z:number,width=1)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,3,.2),new THREE.MeshBasicMaterial());mesh.position.set(x,1.5,z);return mesh;};
it('blocks thin walls and lets diagonal motion slide along them',()=>{
 const wall=box(0,8,100),collision=new WalkCollisions([wall]);
 const camera=new RoomCamera();camera.enter(0,0,1);camera.keys.add('w');camera.keys.add('d');
 for(let i=0;i<30;i++)camera.step(.05,collision.blocks);
 expect(camera.camera.position.z).toBeGreaterThan(8.35);
 expect(camera.camera.position.x).toBeGreaterThan(3);
});
it('preserves a doorway between solid mesh sections and ignores floors',()=>{
 const floor=box(0,0,40);floor.rotation.x=Math.PI/2;floor.position.y=-.2;
 const collision=new WalkCollisions([box(-4,0,5),box(4,0,5),floor]);
 expect(collision.blocks(new THREE.Vector3(0,1.8,.4),new THREE.Vector3(0,1.8,.2))).toBe(false);
 expect(collision.blocks(new THREE.Vector3(4,1.8,.4),new THREE.Vector3(4,1.8,.2))).toBe(true);
});
it('collides with transformed imported mesh groups and instanced objects',()=>{
 const group=new THREE.Group();group.add(box(0,0,3));group.position.x=32;
 const instance=new THREE.InstancedMesh(new THREE.BoxGeometry(3,3,.2),new THREE.MeshBasicMaterial(),1);
 instance.setMatrixAt(0,new THREE.Matrix4().makeTranslation(-32,1.5,0));
 const collision=new WalkCollisions([group,instance]);
 for(const x of [-32,32])expect(collision.blocks(new THREE.Vector3(x,1.8,.4),new THREE.Vector3(x,1.8,.2))).toBe(true);
});
