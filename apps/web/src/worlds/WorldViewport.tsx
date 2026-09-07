import {ModelLayer} from './ModelLayer';
import React, { useEffect, useRef, useState } from 'react';
import { ArrowCounterClockwise, CornersOut, Minus, Plus } from '@phosphor-icons/react';
import * as THREE from 'three';
import { bindTrackpadPan } from './trackpadControls';
import { PbrTextures } from './pbrMaterial';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {useMeshLibrary} from './useMeshLibrary';
import {meshGeometry} from './meshGeometry';
import { surfaceMaterial } from './surfaceMaterial';
import { roomShell } from '../../../../packages/protocol/src/roomShell';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { addressFromId, PLOT_SIZE, plotId, type PlotAddress } from '../../../../packages/protocol/src/plots';
import type { SharedShader } from '../../../../packages/protocol/src/sharedLibrary';
import type { BuildObject } from '../../../../packages/protocol/src/worldbuilding';
import { motionPose, type ObjectMotion } from '../../../../packages/protocol/src/objectMotion';
import type { ObjectHighlight } from './activity';
import type { SharedWorld, WorldObject } from './world';

type MovingInstance = { mesh: THREE.InstancedMesh; index: number; position: THREE.Vector3; scale: THREE.Vector3; yaw: number; motion: ObjectMotion };
type Runtime = { models:ModelLayer; meshGeometries:Map<string,THREE.BufferGeometry>; textures: PbrTextures; moving: MovingInstance[]; movingOutlines: Array<{ outline: THREE.LineSegments; y: number; yaw: number; motion: ObjectMotion }>; scene: THREE.Scene; group: THREE.Group; terrain: THREE.Group; camera: THREE.OrthographicCamera; controls: OrbitControls; aspect: number; time: {value:number}; };
const NO_HIGHLIGHTS: ObjectHighlight[] = [];
type Label = { id:string; name:string; x:number; y:number; empty:boolean };
export function WorldViewport({ plots, empty, activePlotId, selected, proposal, draftShader, animateSurfaces, onSelect, onVisit, onExplore, focusRequest, highlights = NO_HIGHLIGHTS }: {
  highlights?: ObjectHighlight[]; plots: SharedWorld[]; empty: Array<PlotAddress & {id:string}>; activePlotId:string; selected?:string; proposal?:BuildObject[]; draftShader?:SharedShader; animateSurfaces?:boolean; onSelect:(id:string|undefined)=>void; onVisit:(id:string)=>void; onExplore?:(id:string)=>void; focusRequest?:{id:string;serial:number};
}) {
  const meshLibrary=useMeshLibrary([...plots.flatMap(plot=>plot.objects),...(proposal??[])].flatMap(object=>object.meshId?[object.meshId]:[]));
  const animateRef=useRef(animateSurfaces);animateRef.current=animateSurfaces;
  const host = useRef<HTMLDivElement>(null), runtime = useRef<Runtime | null>(null);
  const anchor=useRef(addressFromId(activePlotId));
  const callbacks = useRef({onSelect,onVisit,onExplore,activePlotId,plots,empty});callbacks.current = {onSelect,onVisit,onExplore,activePlotId,plots,empty};
  const [modelError,setModelError]=useState('');
  const [materialError,setMaterialError] = useState(false);
  const [error,setError] = useState(false), [zoom,setZoom] = useState(100), [focused,setFocused] = useState(true), [labels,setLabels] = useState<Label[]>([]);
  const focusRef = useRef(focused);focusRef.current = focused;
  function updateLabels() {
    const rt = runtime.current;if (!rt) return;
    rt.camera.updateMatrixWorld();
    const all = [...callbacks.current.plots.map(p => ({...p.placement!,id:p.id,name:p.name,empty:false})),...callbacks.current.empty.map(p => ({...p,name:'Open ground',empty:true}))];
    setLabels(all.map(p => { const origin = anchor.current;const v = new THREE.Vector3((p.x-origin.x)*PLOT_SIZE,0,(p.z-origin.z)*PLOT_SIZE+12).project(rt.camera);return {id:p.id,name:p.name,x:(v.x+1)*50,y:(1-v.y)*50,empty:p.empty}; }));
  }
  function fitCamera() {
    const rt=runtime.current;if(!rt)return;
    // Render relative to the selected plot, keeping distant grid addresses numerically stable.
    const half=(focusRef.current?24:72)/Math.min(1,rt.aspect);
    rt.camera.left=-half*rt.aspect;rt.camera.right=half*rt.aspect;rt.camera.top=half;rt.camera.bottom=-half;
    const address=addressFromId(callbacks.current.activePlotId),x=(address.x-anchor.current.x)*32,z=(address.z-anchor.current.z)*32;
    rt.camera.zoom=1;rt.camera.position.set(x+100,100,z+100);rt.controls.target.set(x,0,z);rt.camera.updateProjectionMatrix();rt.controls.update();setZoom(100);updateLabels();
  }
  function changeCamera(action:'in'|'out'|'reset') {
    const rt=runtime.current;if(!rt)return;
    if(action==='reset'){fitCamera();return;}
    rt.camera.zoom=Math.max(.5,Math.min(6,rt.camera.zoom*(action==='in'?1.25:.8)));rt.camera.updateProjectionMatrix();rt.controls.update();setZoom(Math.round(rt.camera.zoom*100));updateLabels();
  }
  useEffect(()=>{
    const element=host.current!;let renderer:THREE.WebGLRenderer;
    try {renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});}catch{setError(true);return;}
    renderer.localClippingEnabled=true;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));renderer.setClearColor('#111c23');renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute('aria-label','Isometric plot grid. Arrow keys pan, + and - zoom, 0 resets. Plot buttons and neighboring-plot controls provide keyboard navigation.');renderer.domElement.tabIndex=0;element.appendChild(renderer.domElement);
    const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-80,80,60,-60,.1,2000),controls=new OrbitControls(camera,renderer.domElement);
    controls.enableRotate=false;controls.minZoom=.5;controls.maxZoom=6;controls.listenToKeyEvents(renderer.domElement);
    controls.touches.ONE=THREE.TOUCH.PAN;controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;
    controls.mouseButtons.LEFT=THREE.MOUSE.PAN;
    const unbindTrackpadPan=bindTrackpadPan(renderer.domElement,controls);
    const motion=window.matchMedia('(prefers-reduced-motion: reduce)'),updateMotion=()=>{controls.enableDamping=!motion.matches;};updateMotion();motion.addEventListener('change',updateMotion);
    const environmentScene=new RoomEnvironment(), environmentGenerator=new THREE.PMREMGenerator(renderer);
    const environment=environmentGenerator.fromScene(environmentScene,.04);scene.environment=environment.texture;scene.environmentIntensity=.3;
    environmentScene.dispose();environmentGenerator.dispose();
    const textures=new PbrTextures(()=>setMaterialError(true));
    scene.add(new THREE.HemisphereLight('#f3eee1','#647b7c',1.2));
    const sun=new THREE.DirectionalLight('#ffe7c5',2);sun.position.set(-30,70,30);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-70,right:70,top:70,bottom:-70,far:250});sun.shadow.bias=-.001;scene.add(sun);scene.add(sun.target);
    const group=new THREE.Group(),terrain=new THREE.Group(),models=new ModelLayer(setModelError);scene.add(group,terrain,models.group);runtime.current={models,meshGeometries:new Map(),textures,scene,group,terrain,camera,controls,aspect:1,time:{value:0},moving:[],movingOutlines:[]};
    let wanderTimer:ReturnType<typeof setTimeout>;
    let cameraPlotId=callbacks.current.activePlotId;
    const update=()=>{setZoom(Math.round(camera.zoom*100));updateLabels();clearTimeout(wanderTimer);wanderTimer=setTimeout(()=>{const x=Math.round(controls.target.x/32)+anchor.current.x,z=Math.round(controls.target.z/32)+anchor.current.z;if(Math.abs(x)<=10000&&Math.abs(z)<=10000){const id=plotId({x,z});if(id!==cameraPlotId){cameraPlotId=id;callbacks.current.onExplore?.(id);}}},150);};controls.addEventListener('change',update);
    const keyDown=(event:KeyboardEvent)=>{if(event.ctrlKey||event.metaKey||event.altKey)return;const action=event.key==='+'||event.key==='='?'in':event.key==='-'?'out':event.key==='0'?'reset':undefined;if(action){event.preventDefault();changeCamera(action);}};
    renderer.domElement.addEventListener('keydown',keyDown);
    const resize=new ResizeObserver(()=>{const {width,height}=element.getBoundingClientRect();renderer.setSize(width,height);if(runtime.current){runtime.current.aspect=width/Math.max(1,height);fitCamera();}});resize.observe(element);
    let down={x:0,y:0}, gesture=false;const pointers=new Set<number>();
    const pointerDown=(event:PointerEvent)=>{if(pointers.size===0){down={x:event.clientX,y:event.clientY};gesture=false;}pointers.add(event.pointerId);if(pointers.size>1)gesture=true;};
    const pointerMove=(event:PointerEvent)=>{if(pointers.has(event.pointerId)&&Math.hypot(event.clientX-down.x,event.clientY-down.y)>5)gesture=true;};
    const pointerCancel=(event:PointerEvent)=>{pointers.delete(event.pointerId);gesture=true;};
    const pointerUp=(event:PointerEvent)=>{
      pointers.delete(event.pointerId);
      if(gesture||Math.hypot(event.clientX-down.x,event.clientY-down.y)>5)return;
      const rect=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
      const hits=ray.intersectObjects([...group.children,...terrain.children,...models.group.children],true);
      const hit=hits.find(h=>h.object.userData.references||h.object.userData.plotId);
      if(!hit){callbacks.current.onSelect(undefined);return;}
      const reference=hit.object.userData.references?.[hit.instanceId ?? 0] as {plotId:string;id:string}|undefined;
      const id=reference?.plotId??hit.object.userData.plotId;
      callbacks.current.onVisit(id);
    };
    renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointerup',pointerUp);renderer.domElement.addEventListener('pointermove',pointerMove);renderer.domElement.addEventListener('pointercancel',pointerCancel);
    const transform = new THREE.Matrix4(), rotation = new THREE.Quaternion(), position = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    let lastFrame = performance.now(),metricsAt=lastFrame,frameTotal=0,frameCount=0;
    renderer.setAnimationLoop(now => {
      frameTotal+=now-lastFrame;frameCount++;
      const delta = Math.min((now-lastFrame)/1000, .1); lastFrame = now;
      controls.update();
      const rt = runtime.current;
      if (rt) {
        if (animateRef.current && !motion.matches && !document.hidden) rt.time.value += delta;
        rt.models.update(delta,rt.time.value,Boolean(animateRef.current&&!motion.matches&&!document.hidden));
        for (const item of rt.moving) {
          const pose = motionPose(item.motion, rt.time.value, item.yaw);
          position.copy(item.position); position.y += pose.lift;
          rotation.setFromAxisAngle(up, pose.yaw);
          transform.compose(position, rotation, item.scale);
          item.mesh.setMatrixAt(item.index, transform);
          item.mesh.instanceMatrix.needsUpdate = true;
        }
        for (const item of rt.movingOutlines) {
          const pose = motionPose(item.motion, rt.time.value, item.yaw);
          item.outline.position.y = item.y + pose.lift; item.outline.rotation.y = pose.yaw;
        }
      }
      renderer.render(scene,camera);
      if(now-metricsAt>=500){const metrics=models.metrics;Object.assign(renderer.domElement.dataset,{frameMs:(frameTotal/frameCount).toFixed(2),drawCalls:String(renderer.info.render.calls),triangles:String(renderer.info.render.triangles),modelCount:String(metrics.models),modelTemplates:String(metrics.templates),modelSourceBytes:String(metrics.sourceBytes),modelTexturePixels:String(metrics.texturePixels),gpuGeometries:String(renderer.info.memory.geometries),gpuTextures:String(renderer.info.memory.textures),modelAnimationTime:metrics.animationTime.toFixed(3)});metricsAt=now;frameTotal=0;frameCount=0;}
    });
    return()=>{clearTimeout(wanderTimer);renderer.setAnimationLoop(null);resize.disconnect();motion.removeEventListener('change',updateMotion);unbindTrackpadPan();controls.dispose();models.dispose();scene.remove(models.group);scene.traverse(disposeObject);sun.shadow.dispose();textures.dispose();for(const geometry of runtime.current?.meshGeometries.values()??[])geometry.dispose();environment.dispose();renderer.dispose();renderer.domElement.remove();runtime.current=null;};
  },[]);
  useEffect(()=>{fitCamera();},[focused]);
  useEffect(()=>{if(focusRequest)fitCamera();},[focusRequest]);
  useEffect(()=>{
    const rt=runtime.current;if(!rt)return;
    rt.moving = []; rt.movingOutlines = [];
    rt.group.traverse(disposeObject);rt.group.clear();rt.terrain.traverse(disposeObject);rt.terrain.clear();
    const all=[...plots.map(world=>({id:world.id,address:world.placement??addressFromId(world.id),empty:false})),...empty.map(address=>({id:address.id,address,empty:true}))];
    const visibleMeshIds=new Set([...plots.flatMap(plot=>plot.objects),...(proposal??[])].flatMap(object=>object.meshId?[object.meshId]:[]));
    for(const [id,geometry]of rt.meshGeometries)if(!visibleMeshIds.has(id)){geometry.dispose();rt.meshGeometries.delete(id);}
    for(const [id,data]of meshLibrary.geometry)if(visibleMeshIds.has(id)&&!rt.meshGeometries.has(id))rt.meshGeometries.set(id,meshGeometry(data));
    const origin=anchor.current;
    const activeAddress=plots.find(world=>world.id===activePlotId)?.placement??addressFromId(activePlotId);
    void rt.models.set([
      ...(proposal??[]).filter(object=>object.shape==='model').map(object=>({object:{...object,author:'Prepared build'},plotId:activePlotId,offsetX:(activeAddress.x-origin.x)*32,offsetZ:(activeAddress.z-origin.z)*32,ghost:true})),
      ...[...plots].sort((a,b)=>Number(b.id===activePlotId)-Number(a.id===activePlotId)).flatMap(world=>world.objects.filter(object=>object.shape==='model').map(object=>({object,plotId:world.id,offsetX:((world.placement?.x??addressFromId(world.id).x)-origin.x)*32,offsetZ:((world.placement?.z??addressFromId(world.id).z)-origin.z)*32}))),
    ]);
    for(const plot of all) addPlotTerrain(rt.terrain,plot.id,{x:plot.address.x-origin.x,z:plot.address.z-origin.z},plot.id===activePlotId,plot.empty,plot.address);
    const shaders=new Map(plots.flatMap(world=>(world.shaders??[]).map(shader=>[shader.id,shader] as const)));
    if(draftShader)shaders.set(draftShader.id,draftShader);
    const batches=new Map<string,Array<{object:WorldObject;world:SharedWorld}>>();
    for(const world of plots)for(const storedObject of world.objects){if(storedObject.shape==='model')continue;const object=world.id===activePlotId&&storedObject.id===selected&&draftShader?{...storedObject,shaderId:draftShader.id}:storedObject;const key=`${object.shape}:${object.meshId??''}:${object.shaderId??''}:${object.materialId??''}`;const batch=batches.get(key)??[];batch.push({object,world});batches.set(key,batch);}
    for(const items of batches.values()){
      const shape=items[0].object.shape;
      if(shape==='mesh'&&!rt.meshGeometries.has(items[0].object.meshId!))continue;
      const geometry=shape==='mesh'?rt.meshGeometries.get(items[0].object.meshId!)!:shape==='box'?new THREE.BoxGeometry(1,1,1):shape==='sphere'?new THREE.SphereGeometry(.5,16,12):shape==='cone'?new THREE.ConeGeometry(.5,1,8):new THREE.CylinderGeometry(.5,.5,1,24);
      const mesh=new THREE.InstancedMesh(geometry,surfaceMaterial(shaders.get(items[0].object.shaderId??''),rt.time),items.length),matrix=new THREE.Matrix4();
      if(shape==='mesh'){(mesh.material as THREE.MeshStandardMaterial).flatShading=false;(mesh.material as THREE.MeshStandardMaterial).vertexColors=geometry.hasAttribute('color');}
      rt.textures.apply(mesh.material as THREE.MeshStandardMaterial,items[0].object.materialId);
      mesh.userData.references=items.map(({object,world})=>({id:object.id,plotId:world.id}));
      items.forEach(({object,world},index)=>{const address=world.placement??addressFromId(world.id);matrix.compose(new THREE.Vector3(object.position[0]+(address.x-origin.x)*32,object.position[1],object.position[2]+(address.z-origin.z)*32),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),object.yaw??0),new THREE.Vector3(...object.scale));mesh.setMatrixAt(index,matrix);const color=new THREE.Color(object.color);if(world.id===activePlotId&&object.id===selected)color.lerp(new THREE.Color('#ffffff'),.4);mesh.setColorAt(index,color);
        if (object.motion) rt.moving.push({ mesh, index, motion: object.motion, yaw: object.yaw ?? 0, position: new THREE.Vector3(object.position[0]+(address.x-origin.x)*32,object.position[1],object.position[2]+(address.z-origin.z)*32), scale: new THREE.Vector3(...object.scale) });
      });
      mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();
      if (mesh.boundingSphere) mesh.boundingSphere.radius += Math.max(0, ...items.map(({object}) => object.motion?.kind === 'float' ? object.motion.amplitude : 0));
      if (items.some(({object}) => object.motion)) mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      rt.group.add(mesh);
    }
    for (const highlight of highlights) {
      const world = plots.find(plot => plot.id === highlight.plotId);
      const object = world?.objects.find(item => item.id === highlight.objectId);
      if (!world || !object) continue;
      const address = world.placement ?? addressFromId(world.id);
      const box = new THREE.BoxGeometry(1, 1, 1);
      const edges = new THREE.EdgesGeometry(box); box.dispose();
      const outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: '#ffe4a0' }));
      outline.position.set(object.position[0] + (address.x-origin.x)*32, object.position[1], object.position[2] + (address.z-origin.z)*32);
      outline.scale.set(...object.scale.map(value => value + .12) as [number, number, number]);
      outline.rotation.y = object.yaw ?? 0;
      rt.group.add(outline);
      if (object.motion) rt.movingOutlines.push({ outline, y: object.position[1], yaw: object.yaw ?? 0, motion: object.motion });
    }
    if(proposal){
      const address=addressFromId(activePlotId);
      for(const object of proposal){
        if(object.shape==='model')continue;
        if(object.shape==='mesh'&&!rt.meshGeometries.has(object.meshId!))continue;
        const geometry=object.shape==='mesh'?rt.meshGeometries.get(object.meshId!)!:object.shape==='box'?new THREE.BoxGeometry(1,1,1):object.shape==='sphere'?new THREE.SphereGeometry(.5,16,12):object.shape==='cone'?new THREE.ConeGeometry(.5,1,8):new THREE.CylinderGeometry(.5,.5,1,24);
        const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:'#d6efb5',transparent:true,opacity:.45,depthWrite:false}));
        mesh.position.set(object.position[0]+(address.x-origin.x)*32,object.position[1],object.position[2]+(address.z-origin.z)*32);mesh.scale.set(...object.scale);mesh.rotation.y=object.yaw??0;rt.group.add(mesh);
      }
    }
    updateLabels();
  },[plots,empty,selected,activePlotId,proposal,draftShader,highlights,meshLibrary.geometry]);
  return <>
    {modelError&&<p className="world-error" role="alert">{modelError}</p>}
    {meshLibrary.error&&<p className="world-error" role="alert">{meshLibrary.error} Reload to retry.</p>}
    {meshLibrary.loading&&<span className="sr-only" role="status">Loading model geometry…</span>}
    {materialError&&<p className="world-error" role="alert">Some material maps could not load. Reload to retry.</p>}
    <div className="world-viewport" ref={host}>{error&&<p className="world-render-error">3D rendering is unavailable. Open Rooms to choose another room.</p>}</div>
    {draftShader && <div className="plot-shader-note" role="status">Draft surface preview · not published</div>}
    {proposal && <div className="plot-proposal-note" role="status">Prepared build · {proposal.length} objects · not saved yet</div>}
    <div className="plot-labels" aria-label="Plots in view">{labels.filter(label=>label.x>0&&label.x<100&&label.y>0&&label.y<90).map(label=><button key={label.id} className="world-plot-label" aria-pressed={label.id===activePlotId} style={{left:`${label.x}%`,top:`${label.y}%`}} onClick={()=>onVisit(label.id)} title={label.name}>{label.name}{label.empty&&<span> +</span>}</button>)}</div>
    <div className="world-view-tools" aria-label="Camera controls"><button aria-label="Reset camera" disabled={error} onClick={()=>changeCamera('reset')}><ArrowCounterClockwise size={17}/></button><button aria-label="Zoom out" disabled={error} onClick={()=>changeCamera('out')}><Minus size={17}/></button><output aria-label="Camera zoom">{zoom}%</output><button aria-label="Zoom in" disabled={error} onClick={()=>changeCamera('in')}><Plus size={17}/></button><button className="plot-focus-button" aria-pressed={focused} disabled={error} onClick={()=>setFocused(value=>!value)}><CornersOut size={16}/>{focused?'Grid view':'Focus plot'}</button></div>
  </>;
}
function addPlotTerrain(group:THREE.Group,id:string,address:PlotAddress,active:boolean,empty:boolean,globalAddress:PlotAddress){
  const parts=roomShell(globalAddress.x,globalAddress.z,empty);
  const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({roughness:1}),parts.length);
  const matrix=new THREE.Matrix4();
  parts.forEach((part,index)=>{matrix.compose(new THREE.Vector3(part.position[0]+address.x*32,part.position[1],part.position[2]+address.z*32),new THREE.Quaternion(),new THREE.Vector3(...part.scale));mesh.setMatrixAt(index,matrix);mesh.setColorAt(index,new THREE.Color(part.color));});
  mesh.userData.plotId=id;mesh.receiveShadow=true;mesh.castShadow=true;mesh.computeBoundingSphere();group.add(mesh);
  if(active){const rim=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(31.6,31.6)),new THREE.LineBasicMaterial({color:'#f1d998',transparent:true,opacity:.7}));rim.rotation.x=-Math.PI/2;rim.position.set(address.x*32,.04,address.z*32);group.add(rim);}
}
function disposeObject(object:THREE.Object3D){
  if(object instanceof THREE.Mesh||object instanceof THREE.LineSegments){if(!object.geometry.userData.sharedMesh)object.geometry.dispose();(Array.isArray(object.material)?object.material:[object.material]).forEach(material=>material.dispose());if(object instanceof THREE.InstancedMesh)object.dispose();}
}
