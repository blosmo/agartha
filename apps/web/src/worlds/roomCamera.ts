import * as THREE from 'three';

export function overviewFraming(focused: boolean, aspect: number) {
  const half = focused ? 24 / Math.min(1, aspect) : Math.max(80, 120 / aspect);
  return { half, distance: Math.max(100, half * 1.25) };
}

export function rotateCamera(camera: THREE.OrthographicCamera, target: THREE.Vector3, radians: number) {
  const offset = camera.position.clone().sub(target);
  offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), radians);
  camera.position.copy(target).add(offset);
  camera.lookAt(target);
  camera.updateMatrixWorld();
}

/** An eye-level walkthrough, bounded to the selected room. */
export class RoomCamera {
  readonly camera = new THREE.PerspectiveCamera(70, 1, .05, 180);
  active = false;
  yaw = 0;
  pitch = 0;
  readonly keys = new Set<string>();
  movement = { x: 0, y: 0 };
  private center = new THREE.Vector3();

  enter(x: number, z: number, aspect: number) {
    this.center.set(x, 0, z);
    this.camera.position.set(x, 1.8, z + 10);
    this.yaw = 0;
    this.pitch = 0;
    this.active = true;
    this.clearInput();
    this.resize(aspect);
    this.look(0, 0);
  }
  exit() { this.active = false; this.clearInput(); }
  clearInput() { this.keys.clear(); this.movement = { x: 0, y: 0 }; }
  resize(aspect: number) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }
  look(dx: number, dy: number) {
    this.yaw -= dx * .004;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * .004, -Math.PI * .45, Math.PI * .45);
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
  }
  step(seconds: number) {
    if (!this.active) return;
    const key = (a: string, b: string) => Number(this.keys.has(a) || this.keys.has(b));
    const x = this.movement.x + key('d', 'ArrowRight') - key('a', 'ArrowLeft');
    const y = this.movement.y + key('s', 'ArrowDown') - key('w', 'ArrowUp');
    const length = Math.max(1, Math.hypot(x, y));
    const distance = Math.min(Math.max(seconds, 0), .05) * 4;
    this.camera.position.x = THREE.MathUtils.clamp(this.camera.position.x + (x * Math.cos(this.yaw) + y * Math.sin(this.yaw)) / length * distance, this.center.x - 14.5, this.center.x + 14.5);
    this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z + (y * Math.cos(this.yaw) - x * Math.sin(this.yaw)) / length * distance, this.center.z - 14.5, this.center.z + 14.5);
  }
}
