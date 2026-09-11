import {downloadModel} from './modelDownload';
import {inspectGlb,type GlbInspection} from '../../../../packages/protocol/src/geometry/inspectGlb';
import {fitsModelResources,fitsModelWork,modelWork} from './modelViewBudget';
import {modelBounds} from '../../../../packages/renderer/modelBounds';
import * as THREE from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {MODEL_ID} from '../../../../packages/protocol/src/modelAssets';
import {motionPose} from '../../../../packages/protocol/src/objectMotion';
import type {WorldObject} from './world';
type Placement={object:WorldObject;plotId:string;offsetX:number;offsetY?:number;offsetZ:number;ghost?:boolean};
type Template={gltf:GLTF;bounds:THREE.Box3;cost:GlbInspection};
type Instance={root:THREE.Group;mixer:THREE.AnimationMixer;materials:THREE.Material[];skeletons:THREE.Skeleton[];placement:Placement;clip?:string;planes:THREE.Plane[]};
function disposeTemplate(template:Template){const geometry=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();template.gltf.scene.traverse(node=>{if(node instanceof THREE.Mesh){geometry.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material]){materials.add(material);for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);}}if(node instanceof THREE.SkinnedMesh)node.skeleton.dispose();});geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>{t.dispose();const image=t.source.data;if(typeof ImageBitmap!=='undefined'&&image instanceof ImageBitmap)image.close();});}
export class ModelLayer {
 readonly group=new THREE.Group();
 private templates=new Map<string,Template>();private pending=new Map<string,{promise:Promise<Template>;controller:AbortController}>();private desired=new Set<string>();private reservations=new Map<string,GlbInspection>();private instances=new Map<string,Instance>();private generation=0;private disposed=false;
 constructor(private status:(message:string)=>void){}
 private load(id:string){
  const cached=this.templates.get(id);if(cached)return Promise.resolve(cached);const pending=this.pending.get(id);if(pending)return pending.promise;
  const controller=new AbortController();
  const promise=(async()=>{
   if(!MODEL_ID.test(id))throw new Error('Invalid model reference.');
   const bytes=await downloadModel(id,AbortSignal.any([controller.signal,AbortSignal.timeout(20000)]));
   if(controller.signal.aborted||this.disposed||!this.desired.has(id))throw new Error('Model is no longer visible.');
   const cost=inspectGlb(new Uint8Array(bytes));
   const fits=()=>fitsModelResources([...this.templates.values()].map(template=>template.cost).concat([...this.reservations.values()]),cost);
   // A newly active room takes priority over cached models from neighboring rooms.
   const priority=[...this.desired],rank=priority.indexOf(id);
   for(const candidate of priority.slice(rank+1).reverse()){
    if(fits())break;
    const template=this.templates.get(candidate);if(!template)continue;
    for(const [key,instance]of this.instances)if(instance.placement.object.modelId===candidate)this.remove(key);
    disposeTemplate(template);this.templates.delete(candidate);
   }
   if(!fits())throw new Error('Visible model resource budget exceeded.');
   this.reservations.set(id,cost);
   const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{if(!url.startsWith('blob:')&&!url.startsWith('data:'))throw new Error('Model references an external resource.');return url;});
   const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
   const gltf=await new GLTFLoader(manager).parseAsync(bytes,'');
   const template={gltf,bounds:modelBounds(gltf),cost};
   if(this.disposed||controller.signal.aborted||!this.desired.has(id)){disposeTemplate(template);throw new Error('Model is no longer visible.');}
   this.templates.set(id,template);return template;
  })();
  this.pending.set(id,{promise,controller});void promise.finally(()=>{if(this.pending.get(id)?.promise===promise){this.pending.delete(id);this.reservations.delete(id);}}).catch(()=>{});return promise;
 }
 private remove(key:string){const instance=this.instances.get(key);if(!instance)return;instance.mixer.stopAllAction();instance.mixer.uncacheRoot(instance.mixer.getRoot());instance.materials.forEach(m=>m.dispose());instance.skeletons.forEach(s=>s.dispose());this.group.remove(instance.root);this.instances.delete(key);}
 async set(placements:Placement[]){
  if(this.disposed)return;
  const generation=++this.generation,admitted:Placement[]=[],ids:string[]=[];
  for(const placement of placements){const id=placement.object.modelId!;if(admitted.length>=32||!ids.includes(id)&&ids.length>=16)continue;if(!ids.includes(id))ids.push(id);admitted.push(placement);}
  const limited=admitted.length<placements.length;placements=admitted;this.desired=new Set(ids);
  for(const [id,pending]of this.pending)if(!this.desired.has(id)){pending.controller.abort();this.pending.delete(id);this.reservations.delete(id);}
  const keys=new Set(placements.map(p=>`${p.ghost?'ghost:':''}${p.plotId}:${p.object.id}`));for(const key of this.instances.keys())if(!keys.has(key)||!this.desired.has(this.instances.get(key)!.placement.object.modelId!))this.remove(key);
  for(const [id,template]of this.templates)if(!this.desired.has(id)){disposeTemplate(template);this.templates.delete(id);}
  let failed=false;
  // Decode one new asset at a time to bound transient parser and image memory.
  let workLimited=false;
  // Paint each completed room before waiting for the next download or decode.
  workLimited=this.renderPlacements(placements);
  for(const id of ids){
   try{await this.load(id);}catch{failed=true;}
   if(this.disposed||generation!==this.generation)return;
   workLimited=this.renderPlacements(placements)||workLimited;
  }
  this.status(limited||workLimited?'Some imported models are hidden to keep this view responsive.':failed?'Some imported models could not load.':'');
 }
 private renderPlacements(placements:Placement[]){
  const work={triangles:0,draws:0,animatedTriangles:0};
  let workLimited=false;const usedIds=new Set<string>();
  for(const placement of placements){
   const key=`${placement.ghost?'ghost:':''}${placement.plotId}:${placement.object.id}`,template=this.templates.get(placement.object.modelId!);
   let instance=this.instances.get(key);
   if(instance&&(instance.placement.object.modelId!==placement.object.modelId||instance.placement.object.color!==placement.object.color)){this.remove(key);instance=undefined;}
   if(!template)continue;
   const next=modelWork(template.cost,!!placement.object.animation&&!placement.object.animation.paused);
   if(!fitsModelWork(work,next)){this.remove(key);workLimited=true;continue;}
   work.triangles+=next.triangles;work.draws+=next.draws;work.animatedTriangles+=next.animatedTriangles;usedIds.add(placement.object.modelId!);
   if(!instance){
    const content=clone(template.gltf.scene),root=new THREE.Group(),materials:THREE.Material[]=[],skeletons:THREE.Skeleton[]=[];
    const center=template.bounds.getCenter(new THREE.Vector3()),size=template.bounds.getSize(new THREE.Vector3());
    const fit=new THREE.Group();fit.scale.set(1/Math.max(size.x,.001),1/Math.max(size.y,.001),1/Math.max(size.z,.001));const centered=new THREE.Group();centered.position.copy(center).negate();centered.add(content);fit.add(centered);root.add(fit);
    const planes=[new THREE.Plane(new THREE.Vector3(1,0,0),.5),new THREE.Plane(new THREE.Vector3(-1,0,0),.5),new THREE.Plane(new THREE.Vector3(0,1,0),.5),new THREE.Plane(new THREE.Vector3(0,-1,0),.5),new THREE.Plane(new THREE.Vector3(0,0,1),.5),new THREE.Plane(new THREE.Vector3(0,0,-1),.5)];
    const copies=new Map<THREE.Material,THREE.Material>();
    content.traverse(node=>{if(node instanceof THREE.Light||node instanceof THREE.Camera)node.visible=false;if(node instanceof THREE.Mesh){node.castShadow=!placement.ghost;node.receiveShadow=true;if(!placement.ghost){node.userData.plotId=placement.plotId;node.userData.references=[{plotId:placement.plotId,id:placement.object.id}];}const copy=(original:THREE.Material)=>{let material=copies.get(original);if(!material){material=original.clone();material.clippingPlanes=planes;material.clipShadows=true;if(placement.ghost){material.transparent=true;material.opacity*=.45;material.depthWrite=false;}if('color'in material)(material.color as THREE.Color).multiply(new THREE.Color(placement.object.color));copies.set(original,material);materials.push(material);}return material;};node.material=Array.isArray(node.material)?node.material.map(copy):copy(node.material);}if(node instanceof THREE.SkinnedMesh)skeletons.push(node.skeleton);});
    const mixer=new THREE.AnimationMixer(content),animation=placement.object.animation;
    if(animation){const clip=template.gltf.animations.find(clip=>clip.name===animation.clip);if(clip){mixer.clipAction(clip).play();mixer.update(0);}}
    instance={root,mixer,materials,skeletons,placement,clip:animation?.clip,planes};this.instances.set(key,instance);this.group.add(root);
   }
   if(instance.clip!==placement.object.animation?.clip){instance.mixer.stopAllAction();const clip=template.gltf.animations.find(clip=>clip.name===placement.object.animation?.clip);if(clip){instance.mixer.clipAction(clip).reset().play();instance.mixer.update(0);}instance.clip=placement.object.animation?.clip;}
   instance.placement=placement;
  }

  for(const [id,template]of this.templates)if(!usedIds.has(id)){disposeTemplate(template);this.templates.delete(id);}
  return workLimited;
 }
 get metrics(){return {models:this.instances.size,templates:this.templates.size,sourceBytes:[...this.templates.values()].reduce((sum,template)=>sum+template.cost.bytes,0),texturePixels:[...this.templates.values()].reduce((sum,template)=>sum+template.cost.texturePixels,0),animationTime:[...this.instances.values()].reduce((sum,instance)=>sum+instance.mixer.time,0)};}
 update(delta:number,time:number,animate:boolean){
  for(const instance of this.instances.values()){
   const {object,offsetX,offsetY=0,offsetZ}=instance.placement,pose=motionPose(object.motion,time,object.yaw);
   const offset=pose.offset??[0,pose.lift,0];
   instance.root.position.set(object.position[0]+offsetX+offset[0],object.position[1]+offsetY+offset[1],object.position[2]+offsetZ+offset[2]);instance.root.scale.set(...object.scale);instance.root.rotation.y=pose.yaw;instance.root.updateMatrixWorld(true);
   // Allow 1 mm in world space so exact-fit faces do not flicker at the clip boundary.
   // Geometry size and placement validation stay unchanged; shadows use the same planes.
   instance.planes.forEach((plane,i)=>{plane.normal.set(i===0?1:i===1?-1:0,i===2?1:i===3?-1:0,i===4?1:i===5?-1:0);plane.constant=.5;plane.applyMatrix4(instance.root.matrixWorld);plane.constant+=.001;});
   if(animate&&object.animation&&!object.animation.paused)instance.mixer.update(delta*(object.animation?.speed??1));
  }
 }
 dispose(){this.disposed=true;this.generation++;this.desired.clear();for(const pending of this.pending.values())pending.controller.abort();this.pending.clear();this.reservations.clear();for(const key of this.instances.keys())this.remove(key);for(const template of this.templates.values())disposeTemplate(template);this.templates.clear();}
}
