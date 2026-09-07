/** glTF 2.0 binary container/accessor reader. All resources stay inside the uploaded file. */
export type GltfRecord=Record<string,unknown>;
export const GLB_LIMITS={bytes:16_000_000,jsonBytes:2_000_000,accessorScalars:2_000_000,nodes:256,primitives:64,triangles:100000,images:16,imageDimension:2048,animationClips:16,animationChannels:128} as const;
export function gltfRecord(value:unknown,label:string):GltfRecord{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`Invalid glTF ${label}.`);return value as GltfRecord;}
export function gltfArray(value:unknown,label:string):unknown[]{if(value===undefined)return [];if(!Array.isArray(value))throw new Error(`Invalid glTF ${label}.`);return value;}
export function gltfInteger(value:unknown,label:string,min=0,max=Number.MAX_SAFE_INTEGER):number{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min||value>max)throw new Error(`Invalid glTF ${label}.`);return value;}
export function gltfIndex(value:unknown,values:readonly unknown[],label:string){return gltfInteger(value,label,0,values.length-1);}
const componentBytes:Record<number,number>={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
const dimensions:Record<string,number>={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
export class GlbReader {
 readonly json:GltfRecord;readonly binary:Uint8Array;
 private cache=new Map<number,number[]>();private scalars=0;
 constructor(bytes:Uint8Array){
  if(bytes.byteLength<20||bytes.byteLength>GLB_LIMITS.bytes)throw new Error('GLB must be 20 bytes–16 MB.');
  const data=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(data.getUint32(0,true)!==0x46546c67||data.getUint32(4,true)!==2||data.getUint32(8,true)!==bytes.byteLength)throw new Error('Expected a complete glTF 2.0 GLB file.');
  let offset=12,json:Uint8Array|undefined,binary:Uint8Array|undefined;
  while(offset<bytes.length){
   if(offset+8>bytes.length)throw new Error('Truncated GLB chunk header.');
   const length=data.getUint32(offset,true),kind=data.getUint32(offset+4,true);offset+=8;
   if(length%4||offset+length>bytes.length)throw new Error('Invalid GLB chunk bounds.');
   if(!json&&kind!==0x4e4f534a)throw new Error('The first GLB chunk must contain JSON.');
   if(kind===0x4e4f534a){if(json||length>GLB_LIMITS.jsonBytes)throw new Error('Invalid GLB JSON chunk.');json=bytes.subarray(offset,offset+length);}
   else if(kind===0x004e4942){if(binary)throw new Error('Duplicate GLB binary chunk.');binary=bytes.subarray(offset,offset+length);}
   offset+=length;
  }
  if(!json)throw new Error('GLB is missing its JSON chunk.');
  this.json=gltfRecord(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(json)),'document');
  const asset=gltfRecord(this.json.asset,'asset');if(asset.version!=='2.0'||asset.minVersion!==undefined&&asset.minVersion!=='2.0')throw new Error('Only glTF 2.0 assets are supported.');
  this.binary=binary??new Uint8Array();
  const buffers=this.list('buffers');if(buffers.length!==1)throw new Error('Use one embedded GLB binary buffer.');
  const buffer=gltfRecord(buffers[0],'buffer');if(buffer.uri!==undefined)throw new Error('External or data-URI buffers are not supported; embed the buffer in GLB.');
  const length=gltfInteger(buffer.byteLength,'buffer length');if(length>this.binary.length||this.binary.length-length>3)throw new Error('GLB binary buffer length does not match its declaration.');
 }
 list(key:string){return gltfArray(this.json[key],key);}
 view(index:unknown){
  const views=this.list('bufferViews'),view=gltfRecord(views[gltfIndex(index,views,'buffer view index')],'buffer view');
  if(view.buffer!==0)throw new Error('A buffer view must use the embedded buffer.');
  const offset=gltfInteger(view.byteOffset??0,'buffer view offset'),length=gltfInteger(view.byteLength,'buffer view length',1);
  const buffer=gltfRecord(this.list('buffers')[0],'buffer');if(offset+length>(buffer.byteLength as number))throw new Error('Buffer view is outside the binary buffer.');
  return {bytes:this.binary.subarray(offset,offset+length),stride:view.byteStride===undefined?undefined:gltfInteger(view.byteStride,'buffer view stride',4,252),offset};
 }
 accessorInfo(index:unknown){const values=this.list('accessors');return gltfRecord(values[gltfIndex(index,values,'accessor index')],'accessor');}
 accessor(index:unknown):number[]{
  const values=this.list('accessors'),id=gltfIndex(index,values,'accessor index'),cached=this.cache.get(id);if(cached)return cached;
  const accessor=this.accessorInfo(id),count=gltfInteger(accessor.count,'accessor count',1,GLB_LIMITS.accessorScalars);
  const dimension=dimensions[String(accessor.type)],component=gltfInteger(accessor.componentType,'component type'),size=componentBytes[component];
  if(!dimension||!size)throw new Error('Unsupported accessor type or component type.');
  if(accessor.normalized!==undefined&&typeof accessor.normalized!=='boolean'||accessor.normalized===true&&[5125,5126].includes(component))throw new Error('Invalid normalized accessor.');
  this.scalars+=count*dimension;if(this.scalars>GLB_LIMITS.accessorScalars)throw new Error('Model exceeds the decoded accessor budget.');
  const result=new Array<number>(count*dimension).fill(0);
  if(accessor.bufferView!==undefined)this.readValues(this.view(accessor.bufferView),gltfInteger(accessor.byteOffset??0,'accessor offset'),component,dimension,count,Boolean(accessor.normalized),result);
  else if(accessor.byteOffset!==undefined&&accessor.byteOffset!==0)throw new Error('An accessor without a buffer view cannot have an offset.');
  if(accessor.sparse!==undefined){
   const sparse=gltfRecord(accessor.sparse,'sparse accessor'),n=gltfInteger(sparse.count,'sparse count',1,count),indices=gltfRecord(sparse.indices,'sparse indices'),data=gltfRecord(sparse.values,'sparse values');
   const sparseComponent=gltfInteger(indices.componentType,'sparse component type');if(![5121,5123,5125].includes(sparseComponent))throw new Error('Invalid sparse index component type.');
   const indexView=this.view(indices.bufferView),valueView=this.view(data.bufferView);if(indexView.stride||valueView.stride)throw new Error('Sparse buffers must be tightly packed.');
   const ids=new Array<number>(n),replacement=new Array<number>(n*dimension);
   this.readValues(indexView,gltfInteger(indices.byteOffset??0,'sparse index offset'),sparseComponent,1,n,false,ids);
   this.readValues(valueView,gltfInteger(data.byteOffset??0,'sparse value offset'),component,dimension,n,Boolean(accessor.normalized),replacement);
   let previous=-1;for(let i=0;i<n;i++){if(ids[i]<=previous||ids[i]>=count)throw new Error('Sparse indices must be ordered and in range.');previous=ids[i];for(let c=0;c<dimension;c++)result[ids[i]*dimension+c]=replacement[i*dimension+c];}
  }
  this.cache.set(id,result);return result;
 }
 private readValues(view:{bytes:Uint8Array;stride?:number;offset:number},offset:number,component:number,dimension:number,count:number,normalized:boolean,result:number[]){
  const size=componentBytes[component],stride=view.stride??dimension*size;
  if(offset%size||(view.offset+offset)%size||stride<dimension*size||stride%size||offset+(count-1)*stride+dimension*size>view.bytes.length)throw new Error('Accessor layout is outside its buffer view or misaligned.');
  const data=new DataView(view.bytes.buffer,view.bytes.byteOffset,view.bytes.byteLength);
  for(let i=0;i<count;i++)for(let c=0;c<dimension;c++){
   const p=offset+i*stride+c*size;
   let n=component===5120?data.getInt8(p):component===5121?data.getUint8(p):component===5122?data.getInt16(p,true):component===5123?data.getUint16(p,true):component===5125?data.getUint32(p,true):data.getFloat32(p,true);
   if(!Number.isFinite(n))throw new Error('Accessor contains a non-finite number.');
   if(normalized)n=component===5120?Math.max(n/127,-1):component===5121?n/255:component===5122?Math.max(n/32767,-1):n/65535;
   result[i*dimension+c]=n;
  }
 }
}
