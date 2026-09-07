import {createHash} from 'node:crypto';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {inspectGlb,type GlbInspection} from '../../packages/protocol/src/geometry/inspectGlb';
import {WorldError} from './src/worlds/world';
import {MODEL_ID} from '../../packages/protocol/src/modelAssets';
export {MODEL_ID};
export type ModelEntry={id:string;name:string;author:string;description:string;createdAt:string;inspection:GlbInspection;contentUrl:string;source?:string;license?:string;attribution?:string};
export class ModelStore {
 private queue:Promise<unknown>=Promise.resolve();
 private pending=new Map<string,Promise<ModelEntry>>();
 constructor(private directory:string){}
 private path(id:string,extension:string){if(!MODEL_ID.test(id))throw new WorldError('Invalid model ID.');return join(this.directory,`${id}.${extension}`);}
 async get(id:string):Promise<ModelEntry>{try{return JSON.parse(await readFile(this.path(id,'json'),'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')throw new WorldError('Model not found.',404);throw error;}}
 async content(id:string){await this.get(id);return readFile(this.path(id,'glb'));}
 async publish(bytes:Uint8Array,metadata:{name:string;author:string;description?:string;source?:string;license?:string;attribution?:string}){
  const {name,author,description=''}=metadata;
  if(typeof name!=='string'||!name.trim()||name.length>80||typeof author!=='string'||!author.trim()||author.length>60||typeof description!=='string'||description.length>500)throw new WorldError('Provide a model name, author and optional short description.');
  for(const [field,limit]of [['source',2000],['license',80],['attribution',500]] as const){const value=metadata[field];if(value!==undefined&&(typeof value!=='string'||value.length>limit))throw new WorldError(`Invalid model ${field}.`);}
  let inspection:GlbInspection;try{inspection=inspectGlb(bytes);}catch(error){throw new WorldError(error instanceof Error?error.message:'Invalid GLB.');}
  const id=`model-${createHash('sha256').update(bytes).digest('hex')}`,active=this.pending.get(id);if(active)return active;
  const save=this.queue.catch(()=>{}).then(async()=>{
   try{return await this.get(id);}catch(error){if(!(error instanceof WorldError)||error.status!==404)throw error;}
   await mkdir(this.directory,{recursive:true});
   const files=await readdir(this.directory);if(files.filter(path=>path.endsWith('.json')).length>=128)throw new WorldError('Local model library limit reached.',429);
   try{await writeFile(this.path(id,'glb'),bytes,{flag:'wx'});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
   const entry:ModelEntry={id,name:name.trim(),author:author.trim(),description,inspection,createdAt:new Date().toISOString(),contentUrl:`/api/models/${id}/file`,...(metadata.source?{source:metadata.source}:{}),...(metadata.license?{license:metadata.license}:{}),...(metadata.attribution?{attribution:metadata.attribution}:{})};
   try{await writeFile(this.path(id,'json'),JSON.stringify(entry),{flag:'wx'});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;return this.get(id);}
   return entry;
  });
  this.queue=save;
  this.pending.set(id,save);try{return await save;}finally{this.pending.delete(id);}
 }
 async list(cursor?:string){
  if(cursor&&!MODEL_ID.test(cursor))throw new WorldError('Invalid model cursor.');
  await mkdir(this.directory,{recursive:true});
  const ids=(await readdir(this.directory)).filter(file=>file.endsWith('.json')).map(file=>file.slice(0,-5)).filter(id=>MODEL_ID.test(id)&&(!cursor||id>cursor)).sort();
  return {entries:await Promise.all(ids.slice(0,25).map(id=>this.get(id))),cursor:ids.length>25?ids[24]:null};
 }
}
