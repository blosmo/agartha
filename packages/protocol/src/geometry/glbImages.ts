import {GLB_LIMITS,GlbReader,gltfRecord} from './glb';
function dimensions(bytes:Uint8Array,mime:string):[number,number]{
 const data=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(mime==='image/png'){
  if(bytes.length<24||data.getUint32(0)!==0x89504e47||data.getUint32(4)!==0x0d0a1a0a||data.getUint32(12)!==0x49484452)throw new Error('Invalid embedded PNG.');
  return [data.getUint32(16),data.getUint32(20)];
 }
 if(mime!=='image/jpeg'||bytes.length<4||data.getUint16(0)!==0xffd8)throw new Error('Embedded textures must be PNG or JPEG.');
 let offset=2;
 while(offset+4<=bytes.length){
  if(bytes[offset++]!==255)throw new Error('Invalid JPEG marker.');
  while(bytes[offset]===255)offset++;
  const marker=bytes[offset++];if(marker===0xd9||marker===0xda)break;
  if(marker===0x01||marker>=0xd0&&marker<=0xd7)continue;
  if(offset+2>bytes.length)break;const size=data.getUint16(offset);if(size<2||offset+size>bytes.length)throw new Error('Invalid JPEG segment bounds.');
  if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
   if(size<8)throw new Error('Invalid JPEG frame.');return [data.getUint16(offset+5),data.getUint16(offset+3)];
  }
  offset+=size;
 }
 throw new Error('JPEG dimensions are unavailable.');
}
export function glbImages(reader:GlbReader){
 const images=reader.list('images');if(images.length>GLB_LIMITS.images)throw new Error('Model has too many textures.');
 let pixels=0;
 return images.map((raw,index)=>{
  const image=gltfRecord(raw,'image');let bytes:Uint8Array,mime:string;
  if(image.uri!==undefined){
   if(image.bufferView!==undefined||typeof image.uri!=='string')throw new Error('Invalid embedded image reference.');
   const match=/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]*={0,2})$/.exec(image.uri);
   if(!match)throw new Error('External image URLs are not allowed; embed PNG or JPEG textures in the GLB.');
   mime=match[1];const decoded=atob(match[2]);bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));
  }else{bytes=reader.view(image.bufferView).bytes;mime=String(image.mimeType);}
  const [width,height]=dimensions(bytes,mime);
  if(width<1||height<1||Math.max(width,height)>GLB_LIMITS.imageDimension)throw new Error('Model textures must be at most 2048 pixels per axis.');
  pixels+=width*height;if(pixels>8_388_608)throw new Error('Model exceeds its decoded texture budget.');
  return {index,mime,width,height,byteLength:bytes.byteLength};
 });
}
