import * as THREE from 'three';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {createHash} from 'node:crypto';
import {inspectGlb} from '../protocol/src/geometry/inspectGlb';
import type {SharedMesh} from '../protocol/src/sharedLibrary';
import type {RenderObject} from './scene';
import {modelBounds} from './modelBounds';
import {installNodeImageDecoder} from './nodeImages';
import {IDENTITY_UV,type Pixels,type RenderMaterial,type TexturePlacement} from './renderMaterials';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
function pixels(texture:THREE.Texture|null|undefined):Pixels|undefined{return texture?.image as Pixels|undefined;}
function placement(texture:THREE.Texture|null|undefined):TexturePlacement {if(!texture)return {channel:0,matrix:IDENTITY_UV};texture.updateMatrix();return {channel:texture.channel,matrix:[...texture.matrix.elements],wrapS:texture.wrapS,wrapT:texture.wrapT,minFilter:texture.minFilter,magFilter:texture.magFilter};}
function materialSpec(id:string,source:THREE.Material):RenderMaterial {
 const material=source as THREE.MeshStandardMaterial;
 return {id,name:source.name||'Imported material',category:'Imported',description:'Embedded GLB material',source:'Imported GLB',license:'Source model license',color:material.color?.getHexString()?`#${material.color.getHexString()}`:'#ffffff',roughness:material.roughness??1,metalness:material.metalness??0,flipY:false,opacity:source.opacity,alphaCutoff:source.alphaTest,transparent:source.transparent,doubleSided:source.side===THREE.DoubleSide,unlit:source instanceof THREE.MeshBasicMaterial,normalScale:material.normalMap?[material.normalScale.x,material.normalScale.y]:[0,0],aoIntensity:material.aoMapIntensity??1,emissive:material.emissive?[material.emissive.r*material.emissiveIntensity,material.emissive.g*material.emissiveIntensity,material.emissive.b*material.emissiveIntensity]:[0,0,0],pixels:{albedo:pixels(material.map),normal:pixels(material.normalMap),arm:pixels(material.roughnessMap??material.metalnessMap),ao:pixels(material.aoMap),emissive:pixels(material.emissiveMap)},placements:{albedo:placement(material.map),normal:placement(material.normalMap),arm:placement(material.roughnessMap??material.metalnessMap),ao:placement(material.aoMap),emissive:placement(material.emissiveMap)}};
}
function bakedGeometry(node:THREE.Mesh,fit:THREE.Matrix4,group:{start:number;count:number},flat:boolean){
 const source=node.geometry,position=source.getAttribute('position'),normal=source.getAttribute('normal'),uv=source.getAttribute('uv'),uv1=source.getAttribute('uv1'),color=source.getAttribute('color');
 const world=new THREE.Matrix4().multiplyMatrices(fit,node.matrixWorld),normalMatrix=new THREE.Matrix3().getNormalMatrix(world);
 const p=new THREE.Vector3(),n=new THREE.Vector3(),baseNormal=new THREE.Vector3(),skinMatrix=new THREE.Matrix4(),temp=new THREE.Matrix4();
 const positions:number[]=[],normals:number[]=[],uvs:number[]=[],uvs1:number[]=[],colors:number[]=[],indices:number[]=[];
 const sourceIndices=Array.from({length:Math.min(group.count,(source.index?.count??position.count)-group.start)},(_,i)=>source.index?source.index.getX(group.start+i):group.start+i);
 const vertices=flat||!normal?sourceIndices:Array.from({length:position.count},(_,i)=>i);
 if(node instanceof THREE.SkinnedMesh)node.skeleton.update();
 for(const index of vertices){
  node.getVertexPosition(index,p).applyMatrix4(world);positions.push(p.x,p.y,p.z);
  if(normal){
   baseNormal.fromBufferAttribute(normal,index);n.copy(baseNormal);
   const targets=source.morphAttributes.normal;
   if(targets&&node.morphTargetInfluences)targets.forEach((target,i)=>{const weight=node.morphTargetInfluences![i]??0;if(weight){const value=new THREE.Vector3().fromBufferAttribute(target,index);if(!source.morphTargetsRelative)value.sub(baseNormal);n.addScaledVector(value,weight);}});
   if(node instanceof THREE.SkinnedMesh){
    const joints=source.getAttribute('skinIndex'),weights=source.getAttribute('skinWeight'),boneMatrices=node.skeleton.boneMatrices;if(!boneMatrices)throw new Error('Skin matrices are unavailable.');skinMatrix.elements.fill(0);
    for(let c=0;c<4;c++){const weight=weights.getComponent(index,c);if(weight){temp.fromArray(boneMatrices,joints.getComponent(index,c)*16);for(let k=0;k<16;k++)skinMatrix.elements[k]+=temp.elements[k]*weight;}}
    skinMatrix.premultiply(node.bindMatrixInverse).multiply(node.bindMatrix);n.transformDirection(skinMatrix);
   }
   n.applyNormalMatrix(normalMatrix);normals.push(n.x,n.y,n.z);
  }
  if(color)colors.push(color.getX(index),color.getY(index),color.getZ(index),color.itemSize>3?color.getW(index):1);
  uvs.push(uv?uv.getX(index):0,uv?uv.getY(index):0);if(uv1)uvs1.push(uv1.getX(index),uv1.getY(index));
 }
 for(const index of flat||!normal?vertices.map((_,i)=>i):sourceIndices)indices.push(index);
 if(world.determinant()<0)for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
 if(flat||!normal){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();normals.length=0;for(const value of geometry.getAttribute('normal').array)normals.push(value);geometry.dispose();}
 return {positions,normals,indices,uvs,...(uv1?{uvs1}:{}),...(color?{colors}:{}),bounds:[1,1,1] as [number,number,number]};
}
/** Bake a deterministic pose, retaining skinned/morph geometry and embedded material maps. */
export async function bakeModels(objects:readonly RenderObject[],files:Readonly<Record<string,string>>,seconds=0){
 installNodeImageDecoder();
 const output:RenderObject[]=[],meshes:SharedMesh[]=[],materials=new Map<string,RenderMaterial>();
 const templates=new Map<string,{gltf:GLTF;bounds:THREE.Box3}>(),poses=new Map<string,Array<{meshId:string;materialId:string}>>();let totalBytes=0;
 try{
  for(const object of objects){
   if(object.shape!=='model'){output.push(object);continue;}
   const id=object.modelId!,encoded=files[id];if(!encoded)throw new Error('A model file is missing from the preview snapshot.');
   let template=templates.get(id);
   if(!template){
    const bytes=Buffer.from(encoded,'base64');totalBytes+=bytes.length;if(totalBytes>32_000_000||`model-${createHash('sha256').update(bytes).digest('hex')}`!==id)throw new Error('Invalid or oversized preview model data.');inspectGlb(bytes);
    const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{if(!url.startsWith('blob:')&&!url.startsWith('data:'))throw new Error('External model resources are not supported.');return url;});
    const gltf=await new GLTFLoader(manager).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');template={gltf,bounds:modelBounds(gltf)};templates.set(id,template);
   }
   const time=object.animation&&!object.animation.paused?seconds*object.animation.speed:0,key=`${id}:${object.animation?.clip??''}:${time}`;
   let parts=poses.get(key);
   if(!parts){
    parts=[];const {gltf,bounds}=template,mixer=new THREE.AnimationMixer(gltf.scene);
    if(object.animation){const clip=gltf.animations.find(clip=>clip.name===object.animation!.clip);if(!clip)throw new Error('Imported animation clip is unavailable.');mixer.clipAction(clip).play();mixer.setTime(time);}
    gltf.scene.updateMatrixWorld(true);const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    const fit=new THREE.Matrix4().makeScale(1/Math.max(size.x,.001),1/Math.max(size.y,.001),1/Math.max(size.z,.001)).multiply(new THREE.Matrix4().makeTranslation(-center.x,-center.y,-center.z));
    let ordinal=0;
    gltf.scene.traverse(node=>{
     if(!(node instanceof THREE.Mesh))return;
     const sourceMaterials=Array.isArray(node.material)?node.material:[node.material],groups=node.geometry.groups.length?node.geometry.groups:[{start:0,count:node.geometry.index?.count??node.geometry.getAttribute('position').count,materialIndex:0}];
     for(const group of groups){const source=sourceMaterials[group.materialIndex??0],suffix=hash(`${key}:${ordinal++}`),meshId=`mesh-${suffix}`,materialId=`imported-${suffix}`;materials.set(materialId,materialSpec(materialId,source));meshes.push({id:meshId,kind:'mesh',name:node.name||'Imported part',description:'Posed GLB geometry',geometry:bakedGeometry(node,fit,group,Boolean((source as THREE.MeshStandardMaterial).flatShading))});parts!.push({meshId,materialId});}
    });
    mixer.stopAllAction();mixer.uncacheRoot(gltf.scene);poses.set(key,parts);
   }
   parts.forEach((part,index)=>{const {modelId,animation,...base}=object;output.push({...base,id:`${object.id}-${index}`,shape:'mesh',clipBox:true,...part});});
  }
  return {objects:output,meshes,materials};
 }finally{
  for(const {gltf}of templates.values()){const geometry=new Set<THREE.BufferGeometry>(),material=new Set<THREE.Material>();gltf.scene.traverse(node=>{if(node instanceof THREE.Mesh){geometry.add(node.geometry);(Array.isArray(node.material)?node.material:[node.material]).forEach(m=>material.add(m));}if(node instanceof THREE.SkinnedMesh)node.skeleton.dispose();});geometry.forEach(g=>g.dispose());material.forEach(m=>m.dispose());}
 }
}
