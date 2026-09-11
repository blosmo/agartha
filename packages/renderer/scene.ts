import type {RoomEnvironment} from '../protocol/src/roomEnvironment';
import {previewLighting} from './previewLighting';
import {IDENTITY_UV,materialSamplerOptions,type RenderMaterial} from './renderMaterials';
import type {ModelAnimation} from '../protocol/src/modelAssets';
import { materialDefinition, validateMaterialId } from '../protocol/src/materials';
import type { MaterialTextures } from './pbr';
/// <reference types="@webgpu/types" />
import { motionExtents, motionPose, parseObjectMotion, type ObjectMotion } from '../protocol/src/objectMotion';
import { compileSurface } from '../protocol/src/surfaceShaders';
import { MESH_ID, SHADER_ID, type SharedMesh, type SharedShader } from '../protocol/src/sharedLibrary';
import {previewViewDirection,type PreviewView} from '../protocol/src/previewView.js';
import { box, cone, cylinder, sphere, orthographicCamera } from 'vgpu/scene';
import { draw, frame, geometry, sampler, storage, target, type Gpu } from 'vgpu';

export type RenderObject = { id:string; name:string; shape:'box'|'sphere'|'cone'|'cylinder'|'mesh'|'model';modelId?:string;animation?:ModelAnimation;clipBox?:boolean;meshId?:string; position:readonly number[]; scale:readonly number[]; color:string; yaw?:number;motion?:ObjectMotion;materialId?:string;shaderId?:string };
export type RenderBatch = { shape:RenderObject['shape'];clipBox?:boolean; meshId?:string; materialId?:string; shaderId?:string; count:number; data:Float32Array<ArrayBuffer> };

/** Pack by primitive so 10,000 objects still need at most four draw calls. */
export function packScene(objects:readonly RenderObject[],seconds=0,definitions:ReadonlyMap<string,RenderMaterial>=new Map()):RenderBatch[] {
  if(objects.length>10000)throw new Error('Render at most 10,000 objects in one regional preview.');
  const groups=new Map<string,{shape:RenderObject['shape'];clipBox?:boolean;meshId?:string;materialId?:string;shaderId?:string;values:number[]}>();
  if(new Set(objects.flatMap(object=>object.shaderId?[object.shaderId]:[])).size>64)throw new Error('Render at most 64 surface shaders per preview; inspect a single plot instead.');
  for(const object of objects){
    if(object.shape==='model')throw new Error('Native GLB models need the animated-model preview renderer.');
    if(!['box','sphere','cone','cylinder','mesh'].includes(object.shape)||!/^#[0-9a-f]{6}$/i.test(object.color))throw new Error('Invalid render object.');
    if(object.position.length!==3||!object.position.every(n=>Number.isFinite(n)&&Math.abs(n)<=1_000_000)||object.scale.length!==3||!object.scale.every(n=>Number.isFinite(n)&&n>=.1&&n<=60))throw new Error('Invalid render transform.');
    if(object.yaw!==undefined&&(!Number.isFinite(object.yaw)||Math.abs(object.yaw)>Math.PI*2))throw new Error('Invalid render rotation.');
    if(object.shaderId!==undefined&&(typeof object.shaderId!=='string'||!SHADER_ID.test(object.shaderId)))throw new Error('Invalid surface shader reference.');
    if(object.shape==='mesh'&&(!object.meshId||!MESH_ID.test(object.meshId)))throw new Error('Invalid mesh reference.');
    if(!object.materialId||!definitions.has(object.materialId))validateMaterialId(object.materialId);
    const key=`${object.shape}:${object.meshId??''}:${object.shaderId??''}:${object.materialId??''}:${Boolean(object.clipBox)}`;
    const values=groups.get(key)?.values??[];
    const pose = motionPose(parseObjectMotion(object.motion), seconds, object.yaw);
    const offset=pose.offset??[0,pose.lift,0];
    values.push(object.position[0]+offset[0], object.position[1]+offset[1], object.position[2]+offset[2], pose.yaw,...object.scale,0,...[1,3,5].map(i=>parseInt(object.color.slice(i,i+2),16)/255),1);
    groups.set(key,{shape:object.shape,clipBox:object.clipBox,meshId:object.meshId,shaderId:object.shaderId,materialId:object.materialId,values});
  }
  return [...groups.values()].map(({shape,clipBox,meshId,shaderId,materialId,values})=>({shape,clipBox,meshId,shaderId,materialId,count:values.length/12,data:new Float32Array(values)}));
}
export function sceneCamera(objects:readonly RenderObject[],aspect:number,minimumRadius=5,view:PreviewView='isometric'){
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const o of objects){const extents=motionExtents(o.scale,o.yaw,parseObjectMotion(o.motion));for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis],o.position[axis]-extents[axis]);max[axis]=Math.max(max[axis],o.position[axis]+extents[axis]);}}
  const center=objects.length?min.map((v,i)=>(v+max[i])/2):[0,0,0];
  const radius=objects.length?Math.max(minimumRadius,...max.map((v,i)=>(v-min[i])/2)):10;
  const distance=radius*4/Math.min(1,aspect);
  if(view!=='isometric'){
    const [horizontalAxis,verticalAxis,depthAxis,up]=view==='front'?[0,1,2,[0,1,0]]:view==='side'?[2,1,0,[0,1,0]]:[0,2,1,[0,0,-1]];
    const horizontal=objects.length?(max[horizontalAxis]-min[horizontalAxis])/2:10;
    const vertical=objects.length?(max[verticalAxis]-min[verticalAxis])/2:10;
    const half=Math.max(minimumRadius,vertical,horizontal/aspect)*1.4;
    const position=[...center];position[depthAxis]+=distance;
    return orthographicCamera({left:-half*aspect,right:half*aspect,top:half,bottom:-half,near:.1,far:Math.max(200,distance*4),position:position as [number,number,number],target:center as [number,number,number],up:up as [number,number,number]});
  }
  const half=radius*1.4/Math.min(1,aspect);
  return orthographicCamera({left:-half*aspect,right:half*aspect,top:half,bottom:-half,near:.1,far:Math.max(200,distance*4),position:[center[0]+distance,center[1]+distance,center[2]+distance],target:[center[0],center[1],center[2]]});
}
export function orderSceneObjects(objects:readonly RenderObject[],definitions:ReadonlyMap<string,RenderMaterial>,view:PreviewView):RenderObject[] {
  const direction=previewViewDirection(view);
  const depth=(object:RenderObject)=>view==='isometric'
    ? object.position.reduce((sum,value)=>sum+value,0)
    : object.position.reduce((sum,value,axis)=>sum+value*direction[axis],0);
  return [...objects].sort((a,b)=>{
    const transparentA=Boolean(definitions.get(a.materialId??'')?.transparent);
    const transparentB=Boolean(definitions.get(b.materialId??'')?.transparent);
    if(transparentA!==transparentB)return Number(transparentA)-Number(transparentB);
    return transparentA?depth(a)-depth(b):0;
  });
}
export function sceneCameraUniform(camera:ReturnType<typeof sceneCamera>,seconds:number,view:PreviewView){
  return {viewProjection:camera.viewProjection,time:seconds,viewDirection:previewViewDirection(view)};
}
/** Device-owned resources are released together through gpu.dispose() by the caller. */
export function renderScene(gpu:Gpu,objects:readonly RenderObject[],shader:string,width=960,height=640,shaders:readonly SharedShader[]=[],materials:ReadonlyMap<string,MaterialTextures>=new Map(),pbrShader='',meshes:readonly SharedMesh[]=[],definitions:ReadonlyMap<string,RenderMaterial>=new Map(),seconds=0,focusObjects?:readonly RenderObject[],view:PreviewView='isometric',environment?:RoomEnvironment){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<64||height<64||width>1920||height>1080)throw new Error('Preview size must be 64–1920 × 64–1080.');
  const ordered=orderSceneObjects(objects,definitions,view);
  const batches=packScene(ordered,seconds,definitions);
  const programs=new Map(shaders.map(definition=>[definition.id,compileSurface(definition.expression).wgsl]));
  const camera=sceneCamera(focusObjects??objects,width/height,focusObjects?.length ? 0.25 : 5,view);
  const output=target(gpu,{size:[width,height],depth:true});
  const primitives={box:()=>box({size:1}),sphere:()=>sphere({radius:.5}),cone:()=>cone({radius:.5,height:1,radialSegments:8,shading:'flat'}),cylinder:()=>cylinder({radius:.5,height:1,radialSegments:32})};
  const meshGeometries=new Map(meshes.map(mesh=>{const g=mesh.geometry;return [mesh.id,geometry(gpu,{buffers:[{data:new Float32Array(g.positions),attributes:{position:'float32x3'}},{data:new Float32Array(g.normals),attributes:{normal:'float32x3'}},{data:new Float32Array(g.uvs??g.positions.flatMap((_,i)=>i%3===0?[g.positions[i]+.5,g.positions[i+1]+.5]:[])),attributes:{uv:'float32x2'}},{data:new Float32Array(g.uvs1??g.uvs??g.positions.flatMap((_,i)=>i%3===0?[g.positions[i]+.5,g.positions[i+1]+.5]:[])),attributes:{uv1:'float32x2'}},{data:g.colors?new Float32Array(g.colors):new Float32Array(g.positions.length/3*4).fill(1),attributes:{vertexColor:'float32x4'}}],indices:new Uint32Array(g.indices)})] as const;}));
  const draws=batches.map(batch=>{
    if(batch.shape==='model')throw new Error('Native GLB previews are unavailable.');
    const instances=storage(gpu,batch.data.byteLength,'read');
    instances.write(batch.data);
    const program=batch.shaderId?programs.get(batch.shaderId):compileSurface('color').wgsl;
    if(!program)throw new Error('A referenced surface shader is unavailable.');
    let source=shader.replace(/\/\/ AGARTHA_SURFACE_SHADER_START[\s\S]*?\/\/ AGARTHA_SURFACE_SHADER_END/,program);
    const definition:RenderMaterial|undefined=definitions.get(batch.materialId??'')??materialDefinition(batch.materialId);
    const materialTextures=batch.materialId?materials.get(batch.materialId):undefined;
    if(definition&&!materialTextures)throw new Error('PBR maps are unavailable for this preview.');
    if(definition)source=source.replace('// AGARTHA_PBR',pbrShader).replace(/@fragment fn fs_main[\s\S]*$/, '@fragment fn fs_main(input:VertexOut,@builtin(front_facing) front:bool)->@location(0) vec4f{return pbrShade(input,front);}');
    if(batch.shape==='mesh')source=source.replace('// MESH_UV_INPUT', '@location(2) uv:vec2f, @location(3) uv1:vec2f, @location(4) vertexColor:vec4f,').replace('result.uv = position.xy + vec2f(0.5);','result.uv = uv;').replace('result.uv1 = result.uv;','result.uv1 = uv1;').replace('result.color = item.color.xyz;','result.color = item.color.xyz * vertexColor.rgb;').replace('result.alpha = 1.0;','result.alpha = vertexColor.a;');
    if(batch.clipBox)source=source.replace('return pbrShade(input,front);','let shaded=pbrShade(input,front);if(any(abs(input.surfacePosition)>vec3f(0.5))){discard;}return shaded;');
    const drawGeometry=batch.shape==='mesh'?meshGeometries.get(batch.meshId!):geometry(gpu,primitives[batch.shape]());
    if(!drawGeometry)throw new Error('A referenced mesh is unavailable.');
    const tint=definition?[1,3,5].map(i=>Math.pow(parseInt(definition.color.slice(i,i+2),16)/255,2.2)):[];
    return draw(gpu,{label:`agartha-${batch.shape}`,shader:source,geometry:drawGeometry,instances:batch.count,cull:definition?.doubleSided?'none':'back',...(definition?.transparent?{blend:'alpha' as const,depth:{write:false}}:{}),set:{camera:sceneCameraUniform(camera,seconds,view),lighting:previewLighting(camera.position,environment),instances,...(definition&&materialTextures?{albedoMap:materialTextures.albedo,normalMap:materialTextures.normal,armMap:materialTextures.arm,aoMap:materialTextures.ao,emissiveMap:materialTextures.emissive,albedoSampler:sampler(gpu,materialSamplerOptions(definition.placements?.albedo)),normalSampler:sampler(gpu,materialSamplerOptions(definition.placements?.normal)),armSampler:sampler(gpu,materialSamplerOptions(definition.placements?.arm)),aoSampler:sampler(gpu,materialSamplerOptions(definition.placements?.ao)),emissiveSampler:sampler(gpu,materialSamplerOptions(definition.placements?.emissive)),pbr:{opacity:definition.opacity??1,alphaCutoff:definition.alphaCutoff??0,alphaEnabled:definition.transparent||definition.alphaCutoff?1:0,flipY:definition.flipY===false?0:1,unlit:definition.unlit?1:0,normalScale:definition.normalScale??(definition.maps?[.65,.65]:[0,0]),aoIntensity:definition.aoIntensity??.65,emission:definition.emissive??[0,0,0],uvSets:[definition.placements?.albedo.channel??0,definition.placements?.normal.channel??0,definition.placements?.arm.channel??0,definition.placements?.ao.channel??0],emissionUvSet:definition.placements?.emissive.channel??0,albedoUv:definition.placements?.albedo.matrix??IDENTITY_UV,normalUv:definition.placements?.normal.matrix??IDENTITY_UV,armUv:definition.placements?.arm.matrix??IDENTITY_UV,aoUv:definition.placements?.ao.matrix??IDENTITY_UV,emissionUv:definition.placements?.emissive.matrix??IDENTITY_UV,tint:[...tint,1],roughness:definition.roughness,metalness:definition.metalness,shape:['box','sphere','cone','cylinder'].indexOf(batch.shape)}}:{})}});
  });
  frame(gpu,current=>current.pass({target:output,clear:[.067,.11,.137,1],clearDepth:1},pass=>{for(const item of draws)pass.draw(item);}));
  return {output,drawCalls:draws.length,objectCount:objects.length};
}
