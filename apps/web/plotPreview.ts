import { createHash } from 'node:crypto';
import { roomShell } from '../../packages/protocol/src/roomShell.js';
import {parsePreviewView} from '../../packages/protocol/src/previewView.js';
import {canonicalPreviewFocus,prefixPreviewFocus,selectPreviewFocus} from '../../packages/protocol/src/previewFocus.js';
import type { SharedWorld, WorldObject } from './src/worlds/world.js';

export function plotPreviewSnapshot(plots: SharedWorld[], source: SharedWorld,previewTime=0,focusId?:string,view:unknown='isometric') {
  const previewView=parsePreviewView(view);
  const previewFocus=canonicalPreviewFocus(focusId);
  const isolated=previewView!=='isometric'&&previewFocus;
  const previewPlots=isolated?plots.filter(world=>world.id===source.id).map(world=>({...world,objects:selectPreviewFocus(world.objects,previewFocus)!})):plots;
  const objects: WorldObject[] = [];
  for (const world of previewPlots) {
    const offsetX = ((world.placement?.x ?? 0) - (source.placement?.x ?? 0)) * 32, offsetZ = ((world.placement?.z ?? 0) - (source.placement?.z ?? 0)) * 32;
    for (const object of world.objects) objects.push({ ...object, id:`${world.id}-${object.id}`, position:[object.position[0]+offsetX,object.position[1],object.position[2]+offsetZ] });
    if (isolated||!world.placement) continue;
    for(const part of roomShell(world.placement.x,world.placement.z,world.revision<0)) objects.push({...part,id:`${world.id}-shell-${part.id}`,position:[part.position[0]+offsetX,part.position[1],part.position[2]+offsetZ]});
  }
  const versions = previewPlots.map(world => ({id:world.id,revision:world.revision,version:world.version??null})).sort((a,b)=>a.id.localeCompare(b.id));
  const shaderIds=new Set(objects.flatMap(object=>object.shaderId?[object.shaderId]:[])),meshIds=new Set(objects.flatMap(object=>object.meshId?[object.meshId]:[]));
  const shaders=[...new Map(previewPlots.flatMap(world=>(world.shaders??[]).filter(shader=>!isolated||shaderIds.has(shader.id)).map(shader=>[shader.id,shader] as const))).values()];
  const meshes=[...new Map(previewPlots.flatMap(world=>(world.meshes??[]).filter(mesh=>!isolated||meshIds.has(mesh.id)).map(mesh=>[mesh.id,mesh] as const))).values()];
  const renderObjects=objects.map(object=>({id:object.id,shape:object.shape,modelId:object.modelId??null,animation:object.animation?{clip:object.animation.clip,speed:object.animation.speed,paused:object.animation.paused}:null,meshId:object.meshId??null,position:object.position,scale:object.scale,color:object.color,yaw:object.yaw??0,motion:object.motion?.kind==='float'?{kind:'float',speed:object.motion.speed,amplitude:object.motion.amplitude,phase:object.motion.phase}:object.motion?{kind:'spin',speed:object.motion.speed,phase:object.motion.phase}:null,materialId:object.materialId??null,shaderId:object.shaderId??null}));
  const digest = createHash('sha256').update(JSON.stringify({source:source.id,versions,previewTime,focus:previewFocus,view:previewView,renderObjects,meshRefs:[...meshIds].sort(),shaderRefs:[...shaderIds].sort(),projection:'rooms-v12-headless-essentials'})).digest('hex');
  return { snapshot:{...source,shaders,meshes,previewTime,focusId:prefixPreviewFocus(previewFocus,`${source.id}-`),view:previewView,id:`preview-${digest}`,placement:undefined,objects}, digest, versions };
}
