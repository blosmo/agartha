import { describe, expect, it } from 'vitest';
import { OrthographicCamera, Vector3, Raycaster, Vector2, Plane } from 'three';
import { RoomCamera, rotateCamera, overviewFraming } from './roomCamera';

describe('room camera', () => {
  it('rotates about a panned target and returns after four quarter turns without changing zoom', () => {
    const camera = new OrthographicCamera(); const target = new Vector3(40, 0, -30);
    camera.position.set(140, 100, 70); camera.zoom = 2;
    const start = camera.position.clone();
    rotateCamera(camera, target, Math.PI / 2);
    expect(camera.position.distanceTo(new Vector3(140, 100, -130))).toBeLessThan(.00001);
    for (let i = 0; i < 3; i++) rotateCamera(camera, target, Math.PI / 2);
    expect(camera.position.distanceTo(start)).toBeLessThan(.00001); expect(camera.zoom).toBe(2);
  });
  it('moves relative to heading and normalizes diagonal movement', () => {
    const room = new RoomCamera(); room.enter(0, 0, 1); room.keys.add('w'); room.step(.05);
    expect(room.camera.position.z).toBeCloseTo(9.8);
    room.enter(0, 0, 1); room.keys.add('w'); room.keys.add('d'); room.step(.05);
    expect(room.camera.position.distanceTo(new Vector3(0, 1.8, 10))).toBeCloseTo(.2);
    room.enter(0, 0, 1); room.yaw = Math.PI / 2; room.keys.add('w'); room.step(.05);
    expect(room.camera.position.x).toBeCloseTo(-.2);
  });
  it('limits pitch, movement time and room bounds; clears held input on exit', () => {
    const room = new RoomCamera(); room.enter(32, -32, 2); room.look(0, 100000);
    expect(Math.abs(room.pitch)).toBeLessThan(Math.PI / 2);
    room.keys.add('s'); room.step(100); expect(room.camera.position.z).toBeCloseTo(-21.8);
    for (let i = 0; i < 100; i++) room.step(.05);
    expect(room.camera.position.z).toBe(-17.5);
    room.exit(); expect(room.keys.size).toBe(0); const previous = room.camera.position.clone(); room.step(1);
    expect(room.camera.position.equals(previous)).toBe(true);
  });
});

it('keeps every corner of a wide portrait overview in front of the ground plane',()=>{
 for(const aspect of [1280/720,390/844,320/740]){
  const {half,distance}=overviewFraming(false,aspect);
  const camera=new OrthographicCamera(-half*aspect,half*aspect,half,-half,.1,2000);
  camera.position.set(distance,distance,distance);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  for(const x of [-1,1])for(const y of [-1,1]){
   const ray=new Raycaster();ray.setFromCamera(new Vector2(x,y),camera);
   expect(ray.ray.origin.y).toBeGreaterThan(0);
   expect(ray.ray.intersectPlane(new Plane(new Vector3(0,1,0),0),new Vector3())).not.toBeNull();
  }
 }
});
