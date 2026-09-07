import { describe,expect,it } from 'vitest';
import { packScene,sceneCamera,type RenderObject } from './scene';
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
it('keeps different PBR materials in separate GPU batches',()=>{const batches=packScene([{...object,materialId:'pbr-dark-wood'},{...object,id:'metal',materialId:'pbr-brass'}]);expect(batches.map(b=>b.materialId)).toEqual(['pbr-dark-wood','pbr-brass']);expect(()=>packScene([{...object,materialId:'invalid'}])).toThrow();});
it('batches repeated custom geometry while keeping distinct meshes separate',()=>{
 const id=`mesh-${'a'.repeat(64)}`,other=`mesh-${'b'.repeat(64)}`;
 const objects=Array.from({length:100},(_,i)=>({...object,id:`copy-${i}`,shape:'mesh' as const,meshId:id}));
 expect(packScene(objects)).toHaveLength(1);expect(packScene(objects)[0].count).toBe(100);
 expect(packScene([...objects,{...objects[0],meshId:other}])).toHaveLength(2);
});
it('evaluates requested preview times and can focus the camera on small objects',()=>{expect(packScene([{...object,motion:{kind:'float',amplitude:1,speed:1,phase:0}}],Math.PI/2)[0].data[1]).toBeCloseTo(3);expect(sceneCamera([object],1,.25).projection[0]).toBeGreaterThan(sceneCamera([object],1).projection[0]);});
it('preserves imported texture wrap and filter choices',async()=>{const {materialSamplerOptions}=await import('./renderMaterials');expect(materialSamplerOptions({channel:0,matrix:[],wrapS:1001,wrapT:1002,minFilter:1003,magFilter:1003})).toMatchObject({addressModeU:'clamp-to-edge',addressModeV:'mirror-repeat',minFilter:'nearest',magFilter:'nearest',lodMaxClamp:0});});
