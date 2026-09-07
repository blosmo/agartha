import { createHash } from 'node:crypto';
import { roomShell } from '../../packages/protocol/src/roomShell.js';
import type { SharedWorld, WorldObject } from './src/worlds/world.js';

export function plotPreviewSnapshot(plots: SharedWorld[], source: SharedWorld,previewTime=0,focusId?:string) {
  const objects: WorldObject[] = [];
  for (const world of plots) {
    const offsetX = ((world.placement?.x ?? 0) - (source.placement?.x ?? 0)) * 32, offsetZ = ((world.placement?.z ?? 0) - (source.placement?.z ?? 0)) * 32;
    for (const object of world.objects) objects.push({ ...object, id:`${world.id}-${object.id}`, position:[object.position[0]+offsetX,object.position[1],object.position[2]+offsetZ] });
    if (!world.placement) continue;
    for(const part of roomShell(world.placement.x,world.placement.z,world.revision<0)) objects.push({...part,id:`${world.id}-shell-${part.id}`,position:[part.position[0]+offsetX,part.position[1],part.position[2]+offsetZ]});
  }
  const versions = plots.map(world => ({id:world.id,revision:world.revision,version:world.version??null})).sort((a,b)=>a.id.localeCompare(b.id));
  const digest = createHash('sha256').update(JSON.stringify({source:source.id,versions,previewTime,focusId,projection:'rooms-v9-native-previews'})).digest('hex');
  const shaders=[...new Map(plots.flatMap(world=>(world.shaders??[]).map(shader=>[shader.id,shader] as const))).values()];
  const meshes=[...new Map(plots.flatMap(world=>(world.meshes??[]).map(mesh=>[mesh.id,mesh] as const))).values()];
  return { snapshot:{...source,shaders,meshes,previewTime,focusId:focusId?`${source.id}-${focusId}`:undefined,id:`preview-${digest}`,placement:undefined,objects}, digest, versions };
}
