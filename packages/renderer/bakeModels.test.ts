import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import {bakeModels} from './bakeModels';
it('bakes a real skinned GLB at distinct times with its texture and reusable geometry',async()=>{
 const bytes=await readFile(new URL('../../scripts/fixtures/Fox.glb',import.meta.url)),modelId=`model-${createHash('sha256').update(bytes).digest('hex')}`;
 const object={id:'fox',name:'Fox',shape:'model' as const,modelId,position:[0,1,0],scale:[2,2,4.5],color:'#ffffff',animation:{clip:'Walk',speed:1,paused:false}};
 const files={[modelId]:bytes.toString('base64')};const first=await bakeModels([object,{...object,id:'other'}],files,0),next=await bakeModels([object],files,.3);
 expect(first.objects).toHaveLength(2);expect(first.meshes).toHaveLength(1);expect(first.objects[0].meshId).toBe(first.objects[1].meshId);
 expect(first.meshes[0].geometry.positions).not.toEqual(next.meshes[0].geometry.positions);expect(first.materials.values().next().value?.pixels?.albedo?.width).toBe(1024);
 expect(first.objects[0].clipBox).toBe(true);expect(first.meshes[0].geometry.normals.every(Number.isFinite)).toBe(true);
},20000);
it('decodes embedded JPEG material maps and retains alpha settings',async()=>{
 const {default:jpeg}=await import('jpeg-js');const {glbFixture}=await import('../protocol/src/geometry/glbFixture');
 const image=jpeg.encode({width:1,height:1,data:Buffer.from([255,0,0,255])},90).data;
 const bytes=glbFixture(j=>{j.images=[{uri:`data:image/jpeg;base64,${image.toString('base64')}`}];j.textures=[{source:0}];j.materials[0].pbrMetallicRoughness.baseColorTexture={index:0};j.materials[0].alphaMode='MASK';j.materials[0].doubleSided=true;});
 const modelId=`model-${createHash('sha256').update(bytes).digest('hex')}`;
 const baked=await bakeModels([{id:'jpeg',name:'JPEG model',shape:'model',modelId,position:[0,0,0],scale:[1,1,1],color:'#ffffff'}],{[modelId]:Buffer.from(bytes).toString('base64')});
 const material=baked.materials.values().next().value!;expect(material.pixels?.albedo?.data[0]).toBeGreaterThan(240);expect(material.alphaCutoff).toBe(.5);expect(material.doubleSided).toBe(true);
});
it('preserves secondary UV selection and texture transforms',async()=>{
 const {default:jpeg}=await import('jpeg-js');const {glbFixture}=await import('../protocol/src/geometry/glbFixture');
 const image=jpeg.encode({width:1,height:1,data:Buffer.from([255,255,255,255])},90).data;
 const bytes=glbFixture(j=>{j.images=[{uri:`data:image/jpeg;base64,${image.toString('base64')}`}];j.textures=[{source:0}];j.extensionsUsed=['KHR_texture_transform'];j.accessors.push({bufferView:0,componentType:5126,type:'VEC2',count:3});j.meshes[0].primitives[0].attributes.TEXCOORD_1=4;j.materials[0].pbrMetallicRoughness.baseColorTexture={index:0,extensions:{KHR_texture_transform:{offset:[.2,.3],scale:[2,2],texCoord:1}}};});
 const modelId=`model-${createHash('sha256').update(bytes).digest('hex')}`;
 const baked=await bakeModels([{id:'uv',name:'UV model',shape:'model',modelId,position:[0,0,0],scale:[1,1,1],color:'#ffffff'}],{[modelId]:Buffer.from(bytes).toString('base64')});
 expect(baked.materials.values().next().value?.placements?.albedo.channel).toBe(1);expect(baked.materials.values().next().value?.placements?.albedo.matrix.map(n=>n===0?0:n)).toEqual([2,0,0,0,2,0,.2,.3,1]);expect(baked.meshes[0].geometry.uvs1).toHaveLength(6);
});
