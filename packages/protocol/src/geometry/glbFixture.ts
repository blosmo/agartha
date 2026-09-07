export function glbFixture(change:(json:Record<string,any>)=>void=()=>{}){
 const binary=new Uint8Array(92),view=new DataView(binary.buffer);
 [0,0,0,1,0,0,0,1,0].forEach((n,i)=>view.setFloat32(i*4,n,true));
 [0,1,2].forEach((n,i)=>view.setUint16(36+i*2,n,true));
 [0,1,2].forEach((n,i)=>view.setFloat32(44+i*4,n,true));
 [0,0,0,0,1,0,0,0,0].forEach((n,i)=>view.setFloat32(56+i*4,n,true));
 const json:Record<string,any>={asset:{version:'2.0'},buffers:[{byteLength:92}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:6},{buffer:0,byteOffset:44,byteLength:12},{buffer:0,byteOffset:56,byteLength:36}],accessors:[{bufferView:0,componentType:5126,type:'VEC3',count:3,min:[0,0,0],max:[1,1,0]},{bufferView:1,componentType:5123,type:'SCALAR',count:3},{bufferView:2,componentType:5126,type:'SCALAR',count:3},{bufferView:3,componentType:5126,type:'VEC3',count:3}],materials:[{pbrMetallicRoughness:{baseColorFactor:[.2,.5,.7,1],metallicFactor:.1,roughnessFactor:.7}}],meshes:[{primitives:[{attributes:{POSITION:0},indices:1,material:0}]}],nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0,animations:[{name:'Float',samplers:[{input:2,output:3}],channels:[{sampler:0,target:{node:0,path:'translation'}}]}]};
 change(json);
 const text=new TextEncoder().encode(JSON.stringify(json)),length=Math.ceil(text.length/4)*4,bytes=new Uint8Array(12+8+length+8+binary.length),header=new DataView(bytes.buffer);
 header.setUint32(0,0x46546c67,true);header.setUint32(4,2,true);header.setUint32(8,bytes.length,true);header.setUint32(12,length,true);header.setUint32(16,0x4e4f534a,true);bytes.fill(32,20,20+length);bytes.set(text,20);header.setUint32(20+length,binary.length,true);header.setUint32(24+length,0x004e4942,true);bytes.set(binary,28+length);return bytes;
}
