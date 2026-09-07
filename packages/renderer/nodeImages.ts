import {PNG} from 'pngjs';
import jpeg from 'jpeg-js';
import {inflateSync} from 'node:zlib';
import type {Pixels} from './renderMaterials';
function checkPng(bytes:Uint8Array){
 if(bytes.length<33)throw new Error('Truncated embedded PNG.');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),width=view.getUint32(16),height=view.getUint32(20);
 if(width<1||height<1||width>2048||height>2048)throw new Error('Embedded texture exceeds the render size limit.');
 const compressed:Uint8Array[]=[];let offset=8;
 while(offset+12<=bytes.length){
  const size=view.getUint32(offset),type=view.getUint32(offset+4);if(offset+size+12>bytes.length)throw new Error('Invalid PNG chunk bounds.');
  if(type===0x504c5445&&size>768||type===0x74524e53&&size>256)throw new Error('Oversized PNG palette or transparency data.');
  if(type===0x49444154)compressed.push(bytes.subarray(offset+8,offset+8+size));offset+=size+12;
 }
 // pngjs bounds ordinary inflation itself, but its Adam7 path uses unbounded zlib inflation.
 if(bytes[28]===1)inflateSync(Buffer.concat(compressed),{maxOutputLength:width*height*8+height*7+1024});
}
export async function decodeNodeImage(blob:Blob):Promise<Pixels>{
 const bytes=new Uint8Array(await blob.arrayBuffer()),isPng=bytes[0]===137&&bytes[1]===80;
 if(isPng)checkPng(bytes);
 const image=isPng?PNG.sync.read(Buffer.from(bytes)):jpeg.decode(bytes,{useTArray:true,formatAsRGBA:true,maxResolutionInMP:5,maxMemoryUsageInMB:128,tolerantDecoding:false});
 if(image.width>2048||image.height>2048)throw new Error('Embedded texture exceeds the render size limit.');
 return {width:image.width,height:image.height,data:new Uint8Array(image.data)};
}
/** The GLTF loader only needs decoded pixels here; rendering remains in vgpu. */
export function installNodeImageDecoder(){
 if(typeof globalThis.self==='undefined')Object.defineProperty(globalThis,'self',{configurable:true,value:globalThis});
 if(typeof globalThis.createImageBitmap==='undefined')Object.defineProperty(globalThis,'createImageBitmap',{configurable:true,value:decodeNodeImage});
}
