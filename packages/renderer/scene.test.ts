import {readFileSync} from 'node:fs';
import { describe,expect,it } from 'vitest';
import { orderSceneObjects,packScene,sceneCamera,sceneCameraUniform,type RenderObject } from './scene';
import {motionExtents} from '../protocol/src/objectMotion';
import {parseObjectMotion} from '../protocol/src/objectMotion';
import {parseRoomEnvironment} from '../protocol/src/roomEnvironment';
import {previewLighting} from './previewLighting';
import { roomShell } from '../protocol/src/roomShell';
const object:RenderObject={id:'box',name:'Box',shape:'box',position:[1,2,3],scale:[2,3,4],color:'#ff8000'};
describe('vgpu scene batching',()=>{
  it('accepts shared room architecture including floor joints and empty cells',()=>{
    for(const empty of [false,true]){const shell=roomShell(4,-1,empty);expect(packScene(shell)[0].count).toBe(shell.length);}
  });
  it('packs transforms and colors into aligned GPU instances',()=>{
    const [batch]=packScene([object]);expect(batch.count).toBe(1);expect([...batch.data.slice(0,8)]).toEqual([1,2,3,0,2,3,4,0]);expect(batch.data[8]).toBe(1);expect(batch.data[9]).toBeCloseTo(128/255);
  });
  it('batches 10,000 objects into four primitive draws',()=>{
    const shapes=['box','sphere','cone','cylinder'] as const;
    const batches=packScene(Array.from({length:10000},(_,i)=>({...object,id:String(i),shape:shapes[i%4]})));
    expect(batches).toHaveLength(4);expect(batches.every(b=>b.count===2500)).toBe(true);
  });
  it('carries yaw into GPU instances and uses an orthographic camera',()=>{
    expect(packScene([{...object,yaw:Math.PI/2}])[0].data[3]).toBeCloseTo(Math.PI/2);
    expect(sceneCamera([object],1).projection[15]).toBe(1);
  });
  it('rejects unbounded work and non-finite input',()=>{
    expect(()=>packScene(Array(10001).fill(object))).toThrow('10,000');
    expect(()=>packScene([{...object,position:[NaN,0,0]}])).toThrow('transform');
  });
});

it('renders the authored motion phase at time zero in deterministic PNG previews',()=>{
  const [batch]=packScene([{...object,motion:{kind:'float',speed:1,amplitude:1,phase:Math.PI/2}}]);
  expect(batch.data[1]).toBeCloseTo(3);
  expect(packScene([{...object,yaw:.2,motion:{kind:'spin',speed:1,phase:.4}}])[0].data[3]).toBeCloseTo(.6);
});

it('moves path previews on all axes and frames the complete motion envelope',()=>{
 const moving={...object,position:[0,1,0],motion:parseObjectMotion({kind:'path',points:[[0,0,0],[4,2,0]],mode:'pingpong',speed:Math.sqrt(20),orient:true})};
 const first=packScene([moving],.5)[0].data,second=packScene([moving],1.5)[0].data;
 expect([...first.slice(0,3)]).toEqual([2,2,0]);
 expect([...second.slice(0,3)]).toEqual([2,2,0]);
 expect(first[3]).toBeCloseTo(Math.PI/2);
 expect(second[3]).toBeCloseTo(-Math.PI/2);
 const bounds=motionExtents(moving.scale,moving.yaw,moving.motion);
 for(const view of ['front','side','top'] as const){
   const camera=sceneCamera([moving],1,.25,view);
   for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){
     const p=moving.position.map((value,axis)=>value+[x,y,z][axis]*bounds[axis]);
     const [px,py]=projected(camera,p);expect(Math.abs(px)).toBeLessThanOrEqual(1);expect(Math.abs(py)).toBeLessThanOrEqual(1);
   }
 }
});

it('provides configured lighting uniforms while preserving the legacy preview path',()=>{
 const plain=previewLighting([100,100,100]);
 const warm=previewLighting([100,100,100],parseRoomEnvironment({preset:'golden-hour',exposure:1.2}));
 expect(plain.configured).toBe(0);
 expect(warm.configured).toBe(1);
 expect(warm.exposure).toBeCloseTo(1.2/.9);
 expect(warm.sunColor[0]).toBeGreaterThan(warm.sunColor[2]);
 expect(warm.sunDirection[2]).toBeGreaterThan(0);
});
it('keeps different PBR materials in separate GPU batches',()=>{const batches=packScene([{...object,materialId:'pbr-dark-wood'},{...object,id:'metal',materialId:'pbr-brass'}]);expect(batches.map(b=>b.materialId)).toEqual(['pbr-dark-wood','pbr-brass']);expect(()=>packScene([{...object,materialId:'invalid'}])).toThrow();});
it('batches repeated custom geometry while keeping distinct meshes separate',()=>{
 const id=`mesh-${'a'.repeat(64)}`,other=`mesh-${'b'.repeat(64)}`;
 const objects=Array.from({length:100},(_,i)=>({...object,id:`copy-${i}`,shape:'mesh' as const,meshId:id}));
 expect(packScene(objects)).toHaveLength(1);expect(packScene(objects)[0].count).toBe(100);
 expect(packScene([...objects,{...objects[0],meshId:other}])).toHaveLength(2);
});
it('evaluates requested preview times and can focus the camera on small objects',()=>{expect(packScene([{...object,motion:{kind:'float',amplitude:1,speed:1,phase:0}}],Math.PI/2)[0].data[1]).toBeCloseTo(3);expect(sceneCamera([object],1,.25).projection[0]).toBeGreaterThan(sceneCamera([object],1).projection[0]);});
it('preserves imported texture wrap and filter choices',async()=>{const {materialSamplerOptions}=await import('./renderMaterials');expect(materialSamplerOptions({channel:0,matrix:[],wrapS:1001,wrapT:1002,minFilter:1003,magFilter:1003})).toMatchObject({addressModeU:'clamp-to-edge',addressModeV:'mirror-repeat',minFilter:'nearest',magFilter:'nearest',lodMaxClamp:0});});

function projected(camera:ReturnType<typeof sceneCamera>,point:readonly number[]){
 const m=camera.viewProjection;
 return [m[0]*point[0]+m[4]*point[1]+m[8]*point[2]+m[12],m[1]*point[0]+m[5]*point[1]+m[9]*point[2]+m[13]];
}

it('uses a distinct fitted orthographic view-projection for every inspection angle',()=>{
 const projectionSample={...object,position:[3,4,-2],scale:[10,4,6]};
 const projections=['isometric','front','side','top'].map(view=>Array.from(sceneCamera([projectionSample],2,.25,view as never).projection));
 expect(new Set(projections.map(matrix=>JSON.stringify(matrix))).size).toBe(4);
 const unequal={...object,position:[3,4,-2],scale:[9,5,2],yaw:Math.PI/6};
 const matrices=['isometric','front','side','top'].map(view=>Array.from(sceneCamera([unequal],1,.25,view as never).viewProjection));
 expect(new Set(matrices.map(matrix=>JSON.stringify(matrix))).size).toBe(4);
 const front=sceneCamera([unequal],1,.25,'front' as never).position;expect(front[0]).toBeCloseTo(3);expect(front[1]).toBeCloseTo(4);expect(front[2]).toBeGreaterThan(-2);
 const side=sceneCamera([unequal],1,.25,'side' as never).position;expect(side[0]).toBeGreaterThan(3);expect(side[1]).toBeCloseTo(4);expect(side[2]).toBeCloseTo(-2);
 const top=sceneCamera([unequal],1,.25,'top' as never).position;expect(top[0]).toBeCloseTo(3);expect(top[1]).toBeGreaterThan(4);expect(top[2]).toBeCloseTo(-2);
});

it('frames rotated unequal bounds in front, side, and top views',()=>{
 const rotated={...object,position:[3,4,-2],scale:[9,5,2],yaw:Math.PI/6};
 const extents=motionExtents(rotated.scale,rotated.yaw);
 const corners=([-1,1] as const).flatMap(x=>([-1,1] as const).flatMap(y=>([-1,1] as const).map(z=>rotated.position.map((value,axis)=>value+[x,y,z][axis]*extents[axis]))));
 for(const view of ['front','side','top'] as const){
   const camera=sceneCamera([rotated],16/9,.25,view as never);
   for(const corner of corners){const [x,y]=projected(camera,corner);expect(Math.abs(x)).toBeLessThanOrEqual(1);expect(Math.abs(y)).toBeLessThanOrEqual(1);}
 }
});

it('fits the union of multiple focused objects',()=>{
 const focused=[{...object,id:'body',position:[-4,1,0],scale:[2,4,2]},{...object,id:'handle',position:[4,2,0],scale:[4,2,1]}];
 for(const view of ['front','top'] as const){
   const camera=sceneCamera(focused,16/9,.25,view);
   for(const item of focused){const extents=motionExtents(item.scale,item.yaw);for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){const point=item.position.map((value,axis)=>value+[x,y,z][axis]*extents[axis]);const [px,py]=projected(camera,point);expect(Math.abs(px)).toBeLessThanOrEqual(1);expect(Math.abs(py)).toBeLessThanOrEqual(1);}}
 }
});

const transparentMaterial={
 id:'glass',name:'Glass',category:'Test',description:'Test glass',color:'#ffffff',roughness:.1,metalness:0,source:'Test',license:'CC0',transparent:true,
};
const transparentDefinitions=new Map([[transparentMaterial.id,transparentMaterial]]);

it('sorts transparent objects back-to-front along the requested view direction',()=>{
 const transparent=(id:string,position:readonly number[]):RenderObject=>({...object,id,position,materialId:transparentMaterial.id});
 const cases=[
   {view:'front' as const,far:transparent('front-far',[10,0,0]),near:transparent('front-near',[0,0,5])},
   {view:'side' as const,far:transparent('side-far',[0,10,0]),near:transparent('side-near',[5,0,0])},
   {view:'top' as const,far:transparent('top-far',[10,0,0]),near:transparent('top-near',[0,5,0])},
 ];
 for(const {view,far,near} of cases){
   expect(orderSceneObjects([far,near],transparentDefinitions,'isometric').map(item=>item.id)).toEqual([near.id,far.id]);
   expect(orderSceneObjects([far,near],transparentDefinitions,view).map(item=>item.id)).toEqual([far.id,near.id]);
 }
});

it('feeds the selected surface-to-camera direction through the camera uniform into PBR shading',()=>{
 const camera=sceneCamera([object],1);
 expect(sceneCameraUniform(camera,1.25,'front')).toMatchObject({time:1.25,viewDirection:[0,0,1]});
 expect(sceneCameraUniform(camera,1.25,'side')).toMatchObject({time:1.25,viewDirection:[1,0,0]});
 expect(sceneCameraUniform(camera,1.25,'top')).toMatchObject({time:1.25,viewDirection:[0,1,0]});
 expect(sceneCameraUniform(camera,1.25,'isometric').viewDirection).toEqual([
   1/Math.sqrt(3),1/Math.sqrt(3),1/Math.sqrt(3),
 ]);
 const worldShader=readFileSync(new URL('./world.wgsl',import.meta.url),'utf8');
 const pbrShader=readFileSync(new URL('./pbr.wgsl',import.meta.url),'utf8');
 expect(worldShader).toMatch(/struct Camera \{[^}]*viewDirection: vec3f/s);
 expect(pbrShader).toContain('let v=normalize(camera.viewDirection)');
 expect(pbrShader).not.toContain('normalize(vec3f(1.0,1.0,1.0))');
});
