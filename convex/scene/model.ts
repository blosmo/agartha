import {MODEL_ID,parseModelAnimation} from '../../packages/protocol/src/modelAssets';
import { validateMaterialId } from '../../packages/protocol/src/materials';
import { parseObjectMotion, type ObjectMotion } from '../../packages/protocol/src/objectMotion';
import { MESH_ID, SHADER_ID } from '../../packages/protocol/src/sharedLibrary';
import { ConvexError, v } from 'convex/values';

export const objectValue = v.object({
  id: v.string(), name: v.string(), shape: v.union(v.literal('box'),v.literal('sphere'),v.literal('cone'),v.literal('cylinder'),v.literal('mesh'),v.literal('model')),
  modelId:v.optional(v.string()),animation:v.optional(v.object({clip:v.string(),speed:v.number(),paused:v.boolean()})),
  meshId:v.optional(v.string()),
  materialId: v.optional(v.string()),
  motion: v.optional(v.union(v.object({kind:v.literal('float'),speed:v.number(),phase:v.number(),amplitude:v.number()}),v.object({kind:v.literal('spin'),speed:v.number(),phase:v.number()}))),
  position: v.array(v.number()), scale: v.array(v.number()), color: v.string(), yaw: v.optional(v.number()), shaderId:v.optional(v.string()),
});
export const changeValue = v.object({ id: v.string(), expectedVersion: v.number(), object: v.optional(objectValue) });
export type SceneObject = { id: string; name: string; shape: 'box'|'sphere'|'cone'|'cylinder'|'mesh'|'model';modelId?:string;animation?:{clip:string;speed:number;paused:boolean};meshId?:string; position: number[]; scale: number[]; color: string; yaw?: number; motion?: ObjectMotion; materialId?:string; shaderId?:string };
export const MAX_BATCH = 20;
export const AGENT_OBJECT_QUOTA = 1000;
export const REQUESTS_PER_MINUTE = 12;
export function fail(code: string, message: string): never { throw new ConvexError({ code, message }); }
export function identifier(value: string) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(value)) fail('invalid', 'IDs use 1–80 letters, digits, underscores or hyphens.');
}
export function label(value: string, max: number) {
  if (!value.trim() || value.length > max) fail('invalid', `Text must contain 1–${max} characters.`);
}
export function regionOf(position: number[]) { return `${Math.floor((position[0]+16)/32)}:${Math.floor((position[2]+16)/32)}`; }
export function validatedAnimation(value:unknown){try{return parseModelAnimation(value);}catch(error){fail('invalid',error instanceof Error?error.message:'Invalid model animation.');}}
export function validatedMotion(value: unknown) {
  try { return parseObjectMotion(value); } catch (error) { fail('invalid', error instanceof Error ? error.message : 'Invalid motion.'); }
}
export function validateObject(object: SceneObject) {
  if(object.shape==='model'&&(!object.modelId||!MODEL_ID.test(object.modelId)))fail('invalid','Imported models require a modelId.');
  if(object.shape!=='model'&&(object.modelId!==undefined||object.animation!==undefined))fail('invalid','Only model objects accept modelId and animation.');
  if(object.shape==='model'&&(object.materialId!==undefined||object.shaderId!==undefined))fail('invalid','Imported models retain embedded materials.');
  validatedAnimation(object.animation);
  if(object.shape==='mesh'&&(!object.meshId||!MESH_ID.test(object.meshId)))fail('invalid','Mesh shapes require a published meshId.');
  if(object.shape!=='mesh'&&object.meshId!==undefined)fail('invalid','Only mesh shapes accept meshId.');
  validatedMotion(object.motion);
  try { validateMaterialId(object.materialId); } catch(error) { fail('invalid', error instanceof Error ? error.message : 'Invalid material.'); }
  identifier(object.id); label(object.name,100);
  if(object.shaderId!==undefined&&!SHADER_ID.test(object.shaderId))fail('invalid','Invalid shader reference.');
  if (object.yaw !== undefined && (!Number.isFinite(object.yaw) || Math.abs(object.yaw) > Math.PI * 2)) fail('invalid','Invalid yaw rotation.');
  if (!/^#[0-9a-f]{6}$/i.test(object.color)) fail('invalid','Use a six-digit hex color.');
  if (object.position.length !== 3 || !object.position.every(n=>Number.isFinite(n)&&Math.abs(n)<=1_000_000)) fail('invalid','Invalid XYZ position.');
  if (object.scale.length !== 3 || !object.scale.every(n=>Number.isFinite(n)&&n>=0.1&&n<=60)) fail('invalid','Invalid XYZ scale.');
}
export async function digest(secret: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret))), n=>n.toString(16).padStart(2,'0')).join('');
}
export function credential(secret: string) {
  if (!/^[a-f0-9]{64}$/.test(secret)) fail('invalid','Generate a credential using 32 cryptographically random bytes encoded as lowercase hex.');
}
