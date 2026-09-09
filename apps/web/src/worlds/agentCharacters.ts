import * as THREE from 'three';
import { addressFromId, PLOT_SIZE, type PlotAddress } from '../../../../packages/protocol/src/plots';
import type { AgentPresence } from '../../../../packages/protocol/src/agentPresence';

const COLORS = ['#a9c7a2', '#e8b8a5', '#b9bce2', '#e8cf8e', '#93c6cb', '#d9add0'];
export function agentColor(id: string) {
  let hash = 0;
  for (const char of id) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return COLORS[(hash >>> 0) % COLORS.length];
}
type Character = { group: THREE.Group; body: THREE.Group; target: THREE.Vector3; yaw: number; label?: HTMLElement };
/** Characters represent reported positions; only actual position updates produce walking. */
export class AgentCharacters {
  readonly group = new THREE.Group();
  private actors = new Map<string, Character>();
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private sphere = this.geometry(new THREE.SphereGeometry(1, 16, 12));
  private capsule = this.geometry(new THREE.CapsuleGeometry(.42, .55, 4, 12));
  private colors = new Map(COLORS.map(color => [color, this.material(color)]));
  private eyes = this.material('#26383d');
  private face = this.material('#fff8e7');
  private geometry<T extends THREE.BufferGeometry>(geometry: T): T { this.geometries.push(geometry); return geometry; }
  private material(color: string) { const material = new THREE.MeshStandardMaterial({ color, roughness: .8 }); this.materials.push(material); return material; }
  sync(agents: AgentPresence[], anchor: PlotAddress, labels: Map<string, HTMLElement>) {
    const ids = new Set(agents.map(agent => agent.agentId));
    for (const [id, actor] of this.actors) if (!ids.has(id)) { this.group.remove(actor.group); this.actors.delete(id); }
    for (const agent of agents) {
      const address = addressFromId(agent.plotId);
      const target = new THREE.Vector3((address.x - anchor.x) * PLOT_SIZE + agent.position[0], 0, (address.z - anchor.z) * PLOT_SIZE + agent.position[1]);
      let actor = this.actors.get(agent.agentId);
      if (!actor) {
        const group = new THREE.Group(), body = new THREE.Group(), color = this.colors.get(agentColor(agent.agentId))!;
        const part = (geometry: THREE.BufferGeometry, material: THREE.Material, position: number[], scale: number[]) => {
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.set(position[0], position[1], position[2]); mesh.scale.set(scale[0], scale[1], scale[2]); mesh.castShadow = true; body.add(mesh);
          return mesh;
        };
        part(this.capsule, color, [0, .95, 0], [1, 1, .85]);
        part(this.sphere, color, [0, 1.85, 0], [.59, .53, .48]);
        part(this.sphere, this.face, [0, 1.84, .34], [.46, .34, .17]);
        for (const side of [-1, 1]) {
          part(this.sphere, this.eyes, [side * .17, 1.9, .49], [.055, .08, .04]);
          part(this.sphere, color, [side * .53, .94, .02], [.16, .32, .18]);
          part(this.sphere, this.eyes, [side * .24, .18, .09], [.21, .17, .3]);
        }
        part(this.sphere, color, [0, 2.48, 0], [.13, .13, .13]);
        group.add(body); group.position.copy(target); group.rotation.y = agent.yaw; this.group.add(group);
        actor = { group, body, target, yaw: agent.yaw }; this.actors.set(agent.agentId, actor);
      }
      // Room changes teleport; interpolation never invents a trip through other rooms.
      if (actor.target.distanceTo(target) > 28) actor.group.position.copy(target);
      actor.target.copy(target); actor.yaw = agent.yaw; actor.label = labels.get(agent.agentId);
    }
  }
  update(delta: number, camera: THREE.Camera, reducedMotion: boolean, time: number) {
    camera.updateMatrixWorld();
    for (const actor of this.actors.values()) {
      const moving = actor.group.position.distanceTo(actor.target) > .03;
      actor.group.position.lerp(actor.target, reducedMotion ? 1 : 1 - Math.exp(-delta * 9));
      const angle = Math.atan2(Math.sin(actor.yaw - actor.group.rotation.y), Math.cos(actor.yaw - actor.group.rotation.y));
      actor.group.rotation.y += angle * (reducedMotion ? 1 : 1 - Math.exp(-delta * 9));
      actor.body.position.y = reducedMotion ? 0 : moving ? Math.abs(Math.sin(time * 12)) * .12 : Math.sin(time * 2) * .025;
      if (actor.label) {
        const point = actor.group.position.clone().add(new THREE.Vector3(0, 2.85, 0)).project(camera);
        const visible = point.z >= -1 && point.z <= 1 && Math.abs(point.x) < .98 && Math.abs(point.y) < .95;
        actor.label.hidden = !visible;
        if (visible) { actor.label.style.left = `${(point.x + 1) * 50}%`; actor.label.style.top = `${(1 - point.y) * 50}%`; }
      }
    }
  }
  dispose() { this.group.clear(); this.actors.clear(); this.geometries.forEach(g => g.dispose()); this.materials.forEach(m => m.dispose()); }
}
