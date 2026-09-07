import type {ModelEntry} from './modelStore';
import {sceneCost,assertRoomRenderBudget} from '../../packages/protocol/src/geometry/sceneBudget';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ENTRY_ID, normalizeLibraryDefinition, type LibraryDefinition, type LibraryEntry, type SharedShader, type SharedMesh } from '../../packages/protocol/src/sharedLibrary';
import { SURFACE_EXAMPLES } from '../../packages/protocol/src/surfaceShaders';
import { generateBuild } from '../../packages/protocol/src/worldbuilding';
import { WorldError, type SharedWorld } from './src/worlds/world';

export class LibraryStore {
  private boot?:Promise<void>;
  private cache=new Map<string,LibraryEntry>();
  constructor(private directory:string,private modelInfo?:(id:string)=>Promise<ModelEntry>){}
  private ready(){this.boot??=this.seed().catch(error=>{this.boot=undefined;throw error;});return this.boot;}
  private async write(definition:LibraryDefinition,author:string):Promise<LibraryEntry>{
    await mkdir(this.directory,{recursive:true});
    const id=`${definition.kind}-${createHash('sha256').update(JSON.stringify(definition)).digest('hex')}`;
    const entry={...definition,id,author,createdAt:new Date().toISOString()} as LibraryEntry;
    try{await writeFile(join(this.directory,`${id}.json`),JSON.stringify(entry),{flag:'wx'});this.cache.set(id,entry);return entry;}
    catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;return this.read(id);}
  }
  private async seed(){
    for(const example of SURFACE_EXAMPLES)await this.write(normalizeLibraryDefinition({kind:'shader',name:example.name,expression:example.expression,description:'A reusable procedural surface.'}),'Library seed');
    for(const [tool,name,palette] of [['pavilion','Gathering pavilion','moonlight'],['grove','Woodland grove','woodland'],['landmark','Meeting beacon','sandstone']] as const){
      const build=generateBuild({tool,palette,size:4,seed:5},'library-seed');
      await this.write(normalizeLibraryDefinition({kind:'asset',name,description:'Reusable building blocks for a shared world.',objects:build.objects}),'Library seed');
    }
  }
  private async read(id:string):Promise<LibraryEntry>{
    if(!ENTRY_ID.test(id))throw new WorldError('Invalid library ID.');
    const cached=this.cache.get(id);if(cached)return cached;
    try{const entry=JSON.parse(await readFile(join(this.directory,`${id}.json`),'utf8')) as LibraryEntry;if(entry.id!==id)throw new Error('Invalid library file');this.cache.set(id,entry);return entry;}
    catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')throw new WorldError('Library entry not found.',404);throw error;}
  }
  async get(id:string){await this.ready();return this.read(id);}
  async validateReferences(objects:readonly {shaderId?:string;meshId?:string;modelId?:string}[]){
    if(objects.some(object=>!object||typeof object!=='object'))throw new WorldError('Invalid object shader reference.');
    for(const id of new Set(objects.flatMap(object=>object.modelId?[object.modelId]:[]))){if(!this.modelInfo)throw new WorldError('Model storage is unavailable.');await this.modelInfo(id);}
    for(const id of new Set(objects.flatMap(object=>object.meshId?[object.meshId]:[]))){const mesh=await this.get(id);if(mesh.kind!=='mesh')throw new WorldError('Geometry must reference a mesh.');}
    for(const id of new Set(objects.flatMap(object=>object.shaderId?[object.shaderId]:[]))){const shader=await this.get(id);if(shader.kind!=='shader')throw new WorldError('A surface must reference a shader.');}
  }
  async validateScene(next:SharedWorld,previous?:SharedWorld){
    const ids=[...new Set([...next.objects,...(previous?.objects??[])].flatMap(object=>object.meshId?[object.meshId]:[]))];
    const geometry=new Map<string,{triangles:number;draws?:number}>();
    for(const id of new Set([...next.objects,...(previous?.objects??[])].flatMap(object=>object.modelId?[object.modelId]:[]))){if(!this.modelInfo)throw new WorldError('Model storage is unavailable.');const model=await this.modelInfo(id);geometry.set(id,{triangles:model.inspection.triangles,draws:model.inspection.draws});for(const object of next.objects.filter(o=>o.modelId===id))if(object.animation&&!model.inspection.animations.some(clip=>clip.name===object.animation!.clip))throw new WorldError('Choose an animation clip present in the imported model.');}
    for(const id of ids){const mesh=await this.get(id);if(mesh.kind!=='mesh')throw new WorldError('Invalid mesh reference.');geometry.set(id,{triangles:mesh.geometry.indices.length/3});}
    try{assertRoomRenderBudget(sceneCost(next.objects,geometry),previous?sceneCost(previous.objects,geometry):undefined);}catch(error){throw new WorldError(error instanceof Error?error.message:'Room rendering budget exceeded.');}
  }
  async publish(input:unknown,author:string){
    if(typeof author!=='string'||!author.trim()||author.length>60)throw new WorldError('Provide a publisher name.');
    let definition;try{definition=normalizeLibraryDefinition(input);}catch(error){throw new WorldError(error instanceof Error?error.message:'Invalid library definition.');}
    await this.ready();if(definition.kind==='asset')await this.validateReferences(definition.objects);
    return this.write(definition,author.trim());
  }
  async list(kind?:string,cursor?:string){
    await this.ready();if(kind&&kind!=='asset'&&kind!=='shader'&&kind!=='mesh')throw new WorldError('Choose assets, shaders or meshes.');
    if(cursor&&!ENTRY_ID.test(cursor))throw new WorldError('Invalid library cursor.');
    const ids=(await readdir(this.directory)).filter(name=>name.endsWith('.json')).map(name=>name.slice(0,-5)).filter(id=>ENTRY_ID.test(id)&&(!kind||id.startsWith(`${kind}-`))&&(!cursor||id>cursor)).sort();
    const entries=await Promise.all(ids.slice(0,50).map(id=>this.read(id)));
    return {entries:entries.map(entry=>entry.kind==='asset'?{...entry,objects:undefined,objectCount:entry.objects.length}:entry.kind==='mesh'?{...entry,geometry:undefined,vertexCount:entry.geometry.positions.length/3,triangleCount:entry.geometry.indices.length/3,bounds:entry.geometry.bounds}:entry),cursor:ids.length>50?ids[49]:null};
  }
  async enrich(world:SharedWorld,includeMeshes=false):Promise<SharedWorld>{
    const ids=[...new Set(world.objects.flatMap(object=>object.shaderId?[object.shaderId]:[]))];
    const shaders=await Promise.all(ids.map(async id=>{const entry=await this.get(id);if(entry.kind!=='shader')throw new WorldError('Invalid shader reference.');return entry as SharedShader;}));
    const meshes=includeMeshes?await Promise.all([...new Set(world.objects.flatMap(object=>object.meshId?[object.meshId]:[]))].map(async id=>{const entry=await this.get(id);if(entry.kind!=='mesh')throw new WorldError('Invalid mesh reference.');return entry as SharedMesh;})):undefined;
    const modelCredits=this.modelInfo?await Promise.all([...new Set(world.objects.flatMap(object=>object.modelId?[object.modelId]:[]))].map(async id=>{const model=await this.modelInfo!(id);return {id,name:model.name,source:model.source,license:model.license,attribution:model.attribution};})):[];
    return {...world,shaders,...(meshes?{meshes}:{}),...(modelCredits.length?{modelCredits}:{})};
  }
}
