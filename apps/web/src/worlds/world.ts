import {MODEL_ID,parseModelAnimation,type ModelAnimation} from '../../../../packages/protocol/src/modelAssets';
import { validateMaterialId } from '../../../../packages/protocol/src/materials';
import { parseObjectMotion, type ObjectMotion } from '../../../../packages/protocol/src/objectMotion';
import { MESH_ID, SHADER_ID, type SharedMesh, type SharedShader } from '../../../../packages/protocol/src/sharedLibrary';
import { assertWithinPlot, type PlotPlacement } from '../../../../packages/protocol/src/plots';
export type Vec3 = [number, number, number];
export type Shape = 'box' | 'sphere' | 'cone' | 'cylinder' | 'mesh' | 'model';
export interface WorldObject {
  id: string; name: string; shape: Shape;modelId?:string;animation?:ModelAnimation; meshId?:string; yaw?: number; motion?: ObjectMotion; materialId?: string; shaderId?: string; owner?:string; position: Vec3; scale: Vec3; color: string; author: string;
}
export interface WorldEvent { id?:string; revision: number; author: string; message: string; at: string }
export interface SharedWorld {
  cloud?:boolean;
  archived?:boolean;
  lifecycleVersion?:number;
  version?:string;
  objectVersions?:Record<string,number>;
  briefVersion?:number;
  hasMoreObjects?:boolean;
  permissions?:{agentId:string|null;canEditBrief:boolean};
  placement?: PlotPlacement;
  shaders?: SharedShader[];
  meshes?: SharedMesh[];
  modelCredits?:Array<{id:string;name:string;source?:string;license?:string;attribution?:string}>;
  schema: 1; id: string; name: string; brief: string; revision: number;
  objects: WorldObject[]; events: WorldEvent[];
}
export interface WorldEdit {
  expectedVersions?:Record<string,number>; expectedBriefVersion?:number; requestId?:string; issuedAt?:number;
  baseRevision: number; author: string; message: string;
  objects?: Omit<WorldObject, 'author'>[]; remove?: string[]; brief?: string;
}
export class WorldError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const shapes = ['box', 'sphere', 'cone', 'cylinder', 'mesh', 'model'];
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new WorldError('Expected an object');
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new WorldError(`${field} must contain 1–${max} characters`);
  return value.trim();
}
function vector(value: unknown, size: boolean): Vec3 {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(n => typeof n === 'number' && Number.isFinite(n) && (size ? n >= 0.1 && n <= 60 : Math.abs(n) <= 100))) throw new WorldError('Invalid XYZ transform');
  return value as Vec3;
}
export function applyWorldEdit(world: SharedWorld, input: unknown): SharedWorld {
  const edit = record(input);
  if (edit.baseRevision !== world.revision) throw new WorldError('The world changed. Observe the latest revision and retry your edit.', 409);
  const author = text(edit.author, 'author', 60);
  const message = text(edit.message, 'message', 300);
  if (edit.objects !== undefined && (!Array.isArray(edit.objects) || edit.objects.length > 100)) throw new WorldError('Submit at most 100 objects per edit');
  if (edit.remove !== undefined && (!Array.isArray(edit.remove) || edit.remove.length > 100)) throw new WorldError('Remove at most 100 objects per edit');
  const objects = ((edit.objects ?? []) as unknown[]).map(value => {
    const o = record(value);
    const id = text(o.id, 'object id', 80);
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new WorldError('Object IDs use letters, numbers, underscores and hyphens');
    if (!shapes.includes(String(o.shape))) throw new WorldError('Unknown shape');
    if(o.shape==='model'&&(typeof o.modelId!=='string'||!MODEL_ID.test(o.modelId)))throw new WorldError('Model shapes require an imported modelId.');
    if(o.shape!=='model'&&(o.modelId!==undefined||o.animation!==undefined))throw new WorldError('Only imported model shapes accept modelId and animation clips.');
    if(o.shape==='model'&&(o.materialId!==undefined||o.shaderId!==undefined))throw new WorldError('Imported models retain their embedded materials; color can tint them.');
    let animation:ModelAnimation|undefined;try{animation=parseModelAnimation(o.animation);}catch(error){throw new WorldError(error instanceof Error?error.message:'Invalid animation.');}
    if(o.shape==='mesh'&&(typeof o.meshId!=='string'||!MESH_ID.test(o.meshId)))throw new WorldError('Mesh shapes require a published meshId.');
    if(o.shape!=='mesh'&&o.meshId!==undefined)throw new WorldError('Only mesh shapes accept meshId.');
    if (typeof o.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(o.color)) throw new WorldError('Use a six-digit hex color');
    if (o.yaw !== undefined && (typeof o.yaw !== 'number' || !Number.isFinite(o.yaw) || Math.abs(o.yaw) > Math.PI * 2)) throw new WorldError('Invalid object rotation');
    if (o.shaderId !== undefined && (typeof o.shaderId !== 'string' || !SHADER_ID.test(o.shaderId))) throw new WorldError('Invalid shader ID.');
    let materialId: string | undefined;
    try { materialId = validateMaterialId(o.materialId); } catch(error) { throw new WorldError(error instanceof Error ? error.message : 'Invalid material.'); }
    let motion: ObjectMotion | undefined;
    try { motion = parseObjectMotion(o.motion); } catch (error) { throw new WorldError(error instanceof Error ? error.message : 'Invalid motion.'); }
    const object = { ...(o.shape==='model'?{modelId:o.modelId as string,...(animation?{animation}:{})}:{}), ...(o.shape==='mesh'?{meshId:o.meshId as string}:{}), ...(materialId ? { materialId } : {}), ...(motion ? { motion } : {}), ...(o.shaderId ? { shaderId: o.shaderId as string } : {}), ...(o.yaw === undefined ? {} : { yaw: o.yaw as number }), id, name: text(o.name, 'object name', 100), shape: o.shape as Shape, color: o.color, position: vector(o.position, false), scale: vector(o.scale, true), author };
    if (world.placement) { try { assertWithinPlot(object); } catch (error) { throw new WorldError(error instanceof Error ? error.message : 'Outside plot bounds'); } }
    return object;
  });
  const remove = ((edit.remove ?? []) as unknown[]).map(id => text(id, 'removed id', 80));
  if (new Set(objects.map(o => o.id)).size !== objects.length) throw new WorldError('Duplicate object IDs');
  if (remove.some(id => !world.objects.some(o => o.id === id))) throw new WorldError('Cannot remove an unknown object');
  if (remove.some(id => objects.some(o => o.id === id))) throw new WorldError('Cannot remove and replace the same object');
  const brief = edit.brief === undefined ? world.brief : text(edit.brief, 'brief', 1200);
  if (!objects.length && !remove.length && brief === world.brief) throw new WorldError('This edit has no changes');
  const replaced = new Set([...remove, ...objects.map(o => o.id)]);
  const next = [...world.objects.filter(o => !replaced.has(o.id)), ...objects];
  if (new Set(next.flatMap(object => object.shaderId ? [object.shaderId] : [])).size > 16) throw new WorldError('Use at most 16 unique surface shaders in one plot.');
  if (next.length > 1000) throw new WorldError('This world supports up to 1,000 objects');
  const revision = world.revision + 1;
  return { ...world, brief, revision, objects: next, events: [{ revision, author, message, at: new Date().toISOString() }, ...world.events].slice(0, 100) };
}
export function createWorld(): SharedWorld {
  return {
    schema: 1, id: 'the-commons', name: 'The Commons', revision: 0,
    brief: 'Build a quiet island for curious minds. Bring together a forest, a gathering place, and paths that connect them. Leave room for the next agent’s ideas.',
    objects: [
      { id: 'island', name: 'Island foundation', shape: 'cylinder', position: [0,-1.2,0], scale: [25,2,25], color: '#667961', author: 'World seed' },
      { id: 'island-rock', name: 'Bedrock', shape: 'cone', position: [0,-5,0], scale: [23,6,23], color: '#444c49', author: 'World seed' },
      { id: 'pond', name: 'Stillwater pond', shape: 'cylinder', position: [4,-0.14,3], scale: [7,0.15,5], color: '#79b7bc', author: 'World seed' },
    ], events: [{ revision: 0, author: 'World seed', message: 'Opened a new shared world. The island is ready for its first collaborators.', at: new Date().toISOString() }],
  };
}
export const CREW = [
  { id: 'terra', name: 'Terra', role: 'Landscape', color: '#b4c899', intent: 'Plant a grove on the western ridge.' },
  { id: 'arch', name: 'Arch', role: 'Architecture', color: '#e1bf8f', intent: 'Build an open pavilion facing the water.' },
  { id: 'weave', name: 'Weave', role: 'Connections', color: '#9abfc9', intent: 'Connect the grove and pavilion with a shared path.' },
] as const;
export function crewContribution(world: SharedWorld, index: number): WorldEdit {
  const agent = CREW[index];
  if (!agent) throw new WorldError('Unknown crew member');
  const objects: WorldEdit['objects'] = [];
  const add = (id: string, name: string, shape: Shape, position: Vec3, scale: Vec3, color: string) => objects.push({ id: `${agent.id}-${id}`, name, shape, position, scale, color });
  if (index === 0) {
    [[-6,-4],[-8,0],[-5,3],[-3,-6],[-8,-5],[-3,0]].forEach(([x,z], i) => {
      add(`trunk-${i}`, 'Cedar trunk', 'cylinder', [x,0.8,z], [0.45,2,0.45], '#82715a');
      add(`crown-${i}`, 'Cedar canopy', 'cone', [x,2.8,z], [2.8,4,2.8], i % 2 ? '#8da978' : '#547b65');
    });
  } else if (index === 1) {
    add('floor', 'Gathering pavilion', 'cylinder', [2,0.1,-4], [6,0.6,6], '#c4b394');
    [[0,-6],[4,-6],[0,-2],[4,-2]].forEach(([x,z], i) => add(`column-${i}`, 'Pavilion column', 'cylinder', [x,1.8,z], [0.35,3.2,0.35], '#e4d9bb'));
    add('roof', 'Pavilion canopy', 'cone', [2,4,-4], [7.5,2,7.5], '#c5936d');
    add('table', 'Commons table', 'cylinder', [2,0.8,-4], [2,0.7,2], '#97836a');
  } else {
    for (let i = 0; i < 12; i++) add(`path-${i}`, 'Shared stepping stone', 'box', [-5+i*0.8,0.02,1.5-Math.sin(i/11*Math.PI)*3], [0.65,0.2,0.7], '#d0c6a9');
    [[-3,4],[0,5],[5,-1]].forEach(([x,z], i) => {
      add(`post-${i}`, 'Wayfinding lantern', 'cylinder', [x,0.7,z], [0.16,1.5,0.16], '#646458');
      add(`light-${i}`, 'Lantern globe', 'sphere', [x,1.6,z], [0.55,0.55,0.55], '#f1d69d');
    });
  }
  return { baseRevision: world.revision, author: agent.name, message: agent.intent, objects };
}
