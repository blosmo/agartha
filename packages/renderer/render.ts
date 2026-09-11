import {parseRoomEnvironment} from '../protocol/src/roomEnvironment';
import {bakeModels} from './bakeModels';
import { loadMaterialTextures } from './pbr';
import type { SharedMesh, SharedShader } from '../protocol/src/sharedLibrary';
import { readFile, writeFile } from 'node:fs/promises';
import { init } from 'vgpu/node';
import { PNG } from 'pngjs';
import { renderScene, type RenderObject } from './scene';
import {parsePreviewView} from '../protocol/src/previewView.js';
import {previewObjectsForView} from '../protocol/src/previewFocus.js';

export async function renderWorldPng(objects:readonly RenderObject[],width=960,height=640,shaders:readonly SharedShader[]=[],meshes:readonly SharedMesh[]=[],modelFiles:Readonly<Record<string,string>>={},seconds=0,focusId?:string,view:unknown='isometric',environment?:unknown){
  if(!Number.isFinite(seconds)||seconds<0||seconds>120)throw new Error('Preview time must be 0–120 seconds.');
  const previewView=parsePreviewView(view),roomEnvironment=parseRoomEnvironment(environment);
  const selection=previewObjectsForView(objects,focusId,previewView),focusObjects=selection.focusObjects;
  objects=selection.objects;
  const selectedMeshes=new Set(objects.flatMap(object=>object.meshId?[object.meshId]:[]));
  meshes=meshes.filter(mesh=>selectedMeshes.has(mesh.id));
  const baked=await bakeModels(objects,modelFiles,seconds);objects=baked.objects;meshes=[...meshes,...baked.meshes];
  const shader=await readFile(new URL('./world.wgsl',import.meta.url),'utf8');
  const gpu=await init({requiredLimits:{maxStorageBuffersInVertexStage:1}});
  const errors:string[]=[];
  gpu.onError(error=>errors.push(String(error)));
  try {
    const materials=await loadMaterialTextures(gpu,objects.flatMap(object=>object.materialId?[object.materialId]:[]),baked.materials);
    const pbrShader=await readFile(new URL('./pbr.wgsl',import.meta.url),'utf8');
    const {output,drawCalls,objectCount}=renderScene(gpu,objects,shader,width,height,shaders,materials,pbrShader,meshes,baked.materials,seconds,focusObjects,previewView,roomEnvironment);
    const pixels=await output.read();
    await gpu.settled();
    if(errors.length)throw new Error(`vgpu render failed: ${errors.join('; ')}`);
    const png=new PNG({width,height});png.data.set(pixels);
    return {png:PNG.sync.write(png),drawCalls,objectCount};
  } finally {gpu.dispose();}
}

// This module is the isolated worker entry point; inputs are scene JSON, never executable shaders.
const [input,output]=process.argv.slice(2);
if(input&&output){
  const snapshot=JSON.parse(await readFile(input,'utf8')) as {objects:RenderObject[];shaders?:SharedShader[];meshes?:SharedMesh[];modelFiles?:Record<string,string>;previewTime?:number;focusId?:string;view?:unknown;environment?:unknown};
  if(!Array.isArray(snapshot.objects))throw new Error('Expected a snapshot with objects.');
  const rendered=await renderWorldPng(snapshot.objects,960,640,snapshot.shaders??[],snapshot.meshes??[],snapshot.modelFiles??{},snapshot.previewTime??0,snapshot.focusId,snapshot.view,snapshot.environment);
  await writeFile(output,rendered.png);
  process.stdout.write(JSON.stringify({renderer:'vgpu',objects:rendered.objectCount,drawCalls:rendered.drawCalls,output})+'\n');
}
