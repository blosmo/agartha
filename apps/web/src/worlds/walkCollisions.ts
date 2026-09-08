import * as THREE from 'three';

/** Short body sweeps against rendered geometry, including instanced and imported meshes. */
export class WalkCollisions {
  private ray = new THREE.Raycaster();
  private direction = new THREE.Vector3();
  private origin = new THREE.Vector3();
  private hits: THREE.Intersection[] = [];
  constructor(private roots: THREE.Object3D[]) {}

  blocks = (from: THREE.Vector3, to: THREE.Vector3) => {
    this.direction.subVectors(to, from); this.direction.y = 0;
    const distance = this.direction.length();
    if (!distance) return false;
    this.direction.divideScalar(distance);
    this.ray.near = 0; this.ray.far = distance + .28;
    for (const root of this.roots) root.updateWorldMatrix(true, true);
    for (const height of [.35, .95, 1.65]) for (const offset of [-.22, 0, .22]) {
      this.origin.set(from.x - this.direction.z * offset, height, from.z + this.direction.x * offset);
      this.ray.set(this.origin, this.direction); this.hits.length = 0;
      this.ray.intersectObjects(this.roots, true, this.hits);
      if (this.hits.some(hit => hit.object instanceof THREE.Mesh && hit.object.visible && !(Array.isArray(hit.object.material) ? hit.object.material : [hit.object.material]).every(material => material.transparent && material.opacity < .5))) return true;
    }
    return false;
  };
}
