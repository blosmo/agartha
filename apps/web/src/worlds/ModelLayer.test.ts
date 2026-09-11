import * as glbInspector from '../../../../packages/protocol/src/geometry/inspectGlb';
import {afterEach,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {ModelLayer} from './ModelLayer';
import {glbFixture} from '../../../../packages/protocol/src/geometry/glbFixture';
import type {WorldObject} from './world';
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
const object:WorldObject={id:'model',name:'Model',shape:'model',modelId:`model-${'a'.repeat(64)}`,position:[0,1,0],scale:[2,2,2],color:'#ffffff',author:'Builder',animation:{clip:'Float',speed:1,paused:false}};
const placement=(value=object)=>({object:value,plotId:'the-commons',offsetX:0,offsetZ:0});
it('shares one loaded model across instances and pauses without resetting animation time',async()=>{
 const bytes=glbFixture(),fetchMock=vi.fn(async()=>({ok:true,arrayBuffer:async()=>bytes.buffer}));vi.stubGlobal('fetch',fetchMock);
 const layer=new ModelLayer(vi.fn());
 try{
  await layer.set([placement(),placement({...object,id:'copy'})]);expect(fetchMock).toHaveBeenCalledTimes(1);expect(layer.metrics.models).toBe(2);expect(layer.metrics.templates).toBe(1);
  const meshes:THREE.Mesh[]=[];layer.group.traverse(node=>{if(node instanceof THREE.Mesh)meshes.push(node);});expect(meshes[0].geometry).toBe(meshes[1].geometry);expect(meshes[0].material).not.toBe(meshes[1].material);
  layer.update(.5,.5,true);expect(layer.metrics.animationTime).toBeCloseTo(1);
  await layer.set([placement({...object,animation:{...object.animation!,paused:true}})]);layer.update(1,1.5,true);expect(layer.metrics.animationTime).toBeCloseTo(.5);
  await layer.set([placement()]);layer.update(.25,1.75,true);expect(layer.metrics.animationTime).toBeCloseTo(.75);
  layer.update(1,2.75,false);expect(layer.metrics.animationTime).toBeCloseTo(.75);
 }finally{layer.dispose();}
 expect(layer.group.children).toHaveLength(0);
});
it('cancels obsolete downloads when the view changes and does not resurrect removed instances',async()=>{
 let signal:AbortSignal|undefined;
 vi.stubGlobal('fetch',vi.fn((_url,options)=>new Promise((_resolve,reject)=>{signal=options.signal;signal!.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')));})));const layer=new ModelLayer(vi.fn());
 const loading=layer.set([placement()]);await layer.set([]);expect(signal?.aborted).toBe(true);await loading;
 expect(layer.metrics.models).toBe(0);expect(layer.metrics.templates).toBe(0);layer.dispose();
});
it('keeps admitted models visible when an oversized view is requested',async()=>{
 const bytes=glbFixture();vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>bytes.buffer})));const status=vi.fn(),layer=new ModelLayer(status);
 try{await layer.set(Array.from({length:33},(_,i)=>placement({...object,id:`copy-${i}`})));expect(layer.metrics.models).toBe(32);expect(layer.metrics.templates).toBe(1);expect(status).toHaveBeenLastCalledWith(expect.stringContaining('hidden'));}finally{layer.dispose();}
});
it('renders model ghosts separately with source alpha masking and selectable saved instances',async()=>{
 const bytes=glbFixture(json=>{json.materials[0].alphaMode='MASK';json.materials[0].alphaCutoff=.3;});vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>bytes.buffer})));const layer=new ModelLayer(vi.fn());
 try{await layer.set([placement(),{...placement(),ghost:true}]);const meshes:THREE.Mesh[]=[];layer.group.traverse(node=>{if(node instanceof THREE.Mesh)meshes.push(node);});expect(meshes).toHaveLength(2);
 expect(meshes[0].userData.references).toEqual([{plotId:'the-commons',id:'model'}]);expect(meshes[1].userData.references).toBeUndefined();const ghost=meshes[1].material as THREE.Material;expect(ghost.transparent).toBe(true);expect(ghost.opacity).toBeCloseTo(.45);expect(ghost.alphaTest).toBeCloseTo(.3);expect(ghost.depthWrite).toBe(false);
 }finally{layer.dispose();}
});
it('limits repeated expensive models by draw cost while retaining admitted instances',async()=>{
 const bytes=glbFixture(json=>{json.nodes=Array.from({length:64},()=>({mesh:0}));json.scenes[0].nodes=json.nodes.map((_:unknown,i:number)=>i);});vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>bytes.buffer})));const layer=new ModelLayer(vi.fn());
 try{await layer.set(Array.from({length:4},(_,i)=>placement({...object,id:`expensive-${i}`})));expect(layer.metrics.models).toBe(3);expect(layer.metrics.templates).toBe(1);}finally{layer.dispose();}
});

it('evicts lower-priority cached models when the active room needs the shared budget',async()=>{
 const bytes=glbFixture(),realCost=glbInspector.inspectGlb(bytes);vi.spyOn(glbInspector,'inspectGlb').mockReturnValue({...realCost,bytes:12_000_000});
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>bytes.buffer})));const layer=new ModelLayer(vi.fn());
 const a=placement({...object,id:'a',modelId:`model-${'a'.repeat(64)}`}),b=placement({...object,id:'b',modelId:`model-${'b'.repeat(64)}`}),c=placement({...object,id:'c',modelId:`model-${'c'.repeat(64)}`});
 try{await layer.set([b,c]);expect(layer.metrics.models).toBe(2);await layer.set([a,b,c]);expect(layer.metrics.models).toBe(2);expect(layer.metrics.sourceBytes).toBe(24_000_000);
 const ids:string[]=[];layer.group.traverse(node=>{if(node instanceof THREE.Mesh)ids.push(node.userData.references[0].id);});expect(ids.sort()).toEqual(['a','b']);
 }finally{layer.dispose();}
});

it('shows the active room before a slow neighboring model finishes',async()=>{
 const bytes=glbFixture();let release!:()=>void;
 const slow=new Promise<void>(resolve=>{release=resolve;});
 const second=`model-${'b'.repeat(64)}`;
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{if(url.includes(second))await slow;return {ok:true,arrayBuffer:async()=>bytes.buffer};}));
 const layer=new ModelLayer(vi.fn());
 const loading=layer.set([placement(),placement({...object,id:'neighbor',modelId:second})]);
 try{await vi.waitFor(()=>expect(layer.metrics.models).toBe(1),{timeout:500});}
 finally{release();await loading;layer.dispose();}
});

it('keeps boundary faces inside the clip planes with a bounded world-space tolerance',async()=>{
 const bytes=glbFixture(json=>{delete json.animations;json.scenes[0].extras={agarthaExactBounds:true};});
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>bytes.buffer})));
 const layer=new ModelLayer(vi.fn());
 try{
  for(const yaw of [0,.7,2.1]){
   await layer.set([{...placement({...object,animation:undefined,position:[8,.115,-12],scale:[31.5,.23,31.5],yaw}),offsetX:64,offsetZ:-64}]);
   // Repeat updates to catch an accumulating offset as models move or rotate.
   for(let frame=0;frame<3;frame++)layer.update(.016,frame*.016,false);
   const root=layer.group.children[0];
   let material:THREE.Material|undefined;
   root.traverse(node=>{if(node instanceof THREE.Mesh)material=(Array.isArray(node.material)?node.material[0]:node.material);});
   expect(material!.clipShadows).toBe(true);
   const planes=material!.clippingPlanes!;expect(planes).toHaveLength(6);
   planes.forEach((plane,i)=>{
    const boundary=new THREE.Vector3();boundary.setComponent(Math.floor(i/2),i%2===0?-.5:.5);boundary.applyMatrix4(root.matrixWorld);
    expect(plane.distanceToPoint(boundary)).toBeCloseTo(.001,7);
    expect(plane.distanceToPoint(boundary.clone().addScaledVector(plane.normal,-.002))).toBeLessThan(0);
   });
  }
 }finally{layer.dispose();}
});
