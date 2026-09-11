import {MODEL_ID,parseModelAnimation} from './modelAssets';
import {modelGeometry} from './geometry/modeling';
import {normalizeMesh,type MeshGeometry} from './geometry/mesh';
import {importObj} from './geometry/obj';
import { validateMaterialId } from './materials';
import { motionExtents, parseObjectMotion } from './objectMotion';
import { assertWithinPlot } from './plots';
import { compileSurface } from './surfaceShaders';
import type { BuildObject } from './worldbuilding';
export type LibraryObject = BuildObject & {shaderId?:string};
export type AssetDefinition = {kind:'asset';name:string;description:string;objects:LibraryObject[];bounds:[number,number,number]};
export type ShaderDefinition = {kind:'shader';name:string;description:string;expression:string;usesTime:boolean};
export type MeshDefinition = {kind:'mesh';name:string;description:string;geometry:MeshGeometry};
export type SharedMesh = MeshDefinition & {id:string};
export type LibraryDefinition = AssetDefinition | ShaderDefinition | MeshDefinition;
export type LibraryEntry = LibraryDefinition & {id:string;author:string;createdAt:string};
export type SharedShader = ShaderDefinition & {id:string};
export const SHADER_ID=/^shader-[a-f0-9]{64}$/;
export const MESH_ID=/^mesh-[a-f0-9]{64}$/;
export const ENTRY_ID=/^(asset|shader|mesh)-[a-f0-9]{64}$/;
function text(value:unknown,label:string,max:number,optional=false){if(optional&&(value===undefined||value===''))return '';if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error(`${label} must have 1–${max} characters.`);return value.trim();}
function record(value:unknown){if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Expected a library definition.');return value as Record<string,unknown>;}
function vector(value:unknown,scale=false):[number,number,number]{if(!Array.isArray(value)||value.length!==3||!value.every(n=>typeof n==='number'&&Number.isFinite(n)&&(scale?n>=.1&&n<=60:Math.abs(n)<=128)))throw new Error('Invalid asset transform.');return [...value] as [number,number,number];}
export function normalizeLibraryDefinition(input:unknown):LibraryDefinition {
  const value=record(input),name=text(value.name,'Name',80),description=text(value.description,'Description',300,true);
  if(value.kind==='mesh')return {kind:'mesh',name,description,geometry:value.obj!==undefined?importObj(value.obj as string):value.recipe!==undefined?modelGeometry(value.recipe):normalizeMesh(value.geometry)};
  if(value.kind==='shader'){const program=compileSurface(value.expression as string);return {kind:'shader',name,description,expression:program.expression,usesTime:program.usesTime};}
  if(value.kind!=='asset'||!Array.isArray(value.objects)||value.objects.length<1||value.objects.length>100)throw new Error('An asset needs 1–100 parts.');
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  const objects=value.objects.map((raw,index)=>{
    const object=record(raw),shape=object.shape as BuildObject['shape'];
    if(!['box','sphere','cone','cylinder','mesh','model'].includes(shape)||typeof object.color!=='string'||!/^#[0-9a-f]{6}$/i.test(object.color))throw new Error('Invalid asset geometry or color.');
    if(shape==='model'&&(typeof object.modelId!=='string'||!MODEL_ID.test(object.modelId)))throw new Error('Model shapes require an imported modelId.');
    if(shape!=='model'&&(object.modelId!==undefined||object.animation!==undefined))throw new Error('Only models accept modelId and animation.');
    const animation=parseModelAnimation(object.animation);
    if(shape==='model'&&(object.materialId!==undefined||object.shaderId!==undefined))throw new Error('Imported models retain embedded materials.');
    if(shape==='mesh'&&(typeof object.meshId!=='string'||!MESH_ID.test(object.meshId)))throw new Error('Mesh objects require a published meshId.');
    if(shape!=='mesh'&&object.meshId!==undefined)throw new Error('Only mesh shapes can reference a meshId.');
    const position=vector(object.position),scale=vector(object.scale,true),yaw=object.yaw??0;
    if(typeof yaw!=='number'||!Number.isFinite(yaw)||Math.abs(yaw)>Math.PI*2)throw new Error('Invalid asset rotation.');
    if(object.shaderId!==undefined&&(typeof object.shaderId!=='string'||!SHADER_ID.test(object.shaderId)))throw new Error('Invalid shader reference.');
    const materialId = validateMaterialId(object.materialId);
    const motion = parseObjectMotion(object.motion), extents = motionExtents(scale, yaw, motion);
    for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis],position[axis]-extents[axis]);max[axis]=Math.max(max[axis],position[axis]+extents[axis]);}
    return {id:`part-${index}`,name:text(object.name,'Part name',100),shape,...(shape==='model'?{modelId:object.modelId as string,...(animation?{animation}:{})}:{}),...(shape==='mesh'?{meshId:object.meshId as string}:{}),position,scale,color:object.color,yaw,...(materialId?{materialId}:{}),...(motion?{motion}:{}),...(object.shaderId?{shaderId:object.shaderId as string}:{})};
  });
  const bounds=max.map((n,i)=>n-min[i]) as [number,number,number];if(bounds.some(n=>n>128))throw new Error('Keep reusable assets within 128 units per axis.');
  const pivot=[(min[0]+max[0])/2,min[1],(min[2]+max[2])/2];
  return {kind:'asset',name,description,bounds,objects:objects.map(object=>({...object,position:object.position.map((n,i)=>n-pivot[i]) as [number,number,number]}))};
}
export function instantiateAsset(asset:AssetDefinition,input:unknown,prefix:string):LibraryObject[]{
  const value=record(input);
  if(typeof prefix!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(prefix))throw new Error('Use a unique asset placement ID.');
  const number=(key:string,fallback:number,min:number,max:number)=>{const n=value[key]??fallback;if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw new Error(`${key} must be between ${min} and ${max}.`);return n;};
  const x=number('x',0,-15,15),y=number('y',-.2,-4,30),z=number('z',0,-15,15),size=number('scale',1,.1,4),angle=number('heading',0,0,360)*Math.PI/180;
  return asset.objects.map((part,index)=>{
    const [px,py,pz]=part.position.map(n=>n*size),scale=part.scale.map(n=>n*size) as [number,number,number];
    if(scale.some(n=>n<.1||n>60))throw new Error('This scale makes an asset part too small or too large.');
    const parsedMotion = parseObjectMotion(part.motion);
    const motion = parsedMotion?.kind === 'float'
      ? {...parsedMotion, amplitude: parsedMotion.amplitude * size}
      : parsedMotion?.kind === 'path'
        ? {...parsedMotion, points: parsedMotion.points.map(([mx,my,mz]) => [size * (Math.cos(angle) * mx + Math.sin(angle) * mz), size * my, size * (-Math.sin(angle) * mx + Math.cos(angle) * mz)] as [number,number,number])}
        : parsedMotion;
    const object={...part,...(motion?{motion}:{}),id:`${prefix}-${index}`,position:[x+Math.cos(angle)*px+Math.sin(angle)*pz,y+py,z-Math.sin(angle)*px+Math.cos(angle)*pz] as [number,number,number],scale,yaw:((part.yaw??0)+(motion?.kind==='path'&&motion.orient?0:angle))%(Math.PI*2)};
    assertWithinPlot(object);return object;
  });
}
